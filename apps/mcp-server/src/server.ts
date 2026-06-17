// MCP server handler — listTools / callTool ロジック (HTTP クライアント版 / 2026-06-17)。
//
// 旧実装は @belvedere/repo を直接 import し、デフォルト memory backend を読んでいた。
// → デプロイ済み web が書く dev Firestore と別データを見てしまい、
//   「web で起票 → MCP で取得 → 修正 → 完了」のサイクルが繋がらなかった。
//
// 新実装は **Belvedere HTTP API のクライアント** として動く:
//   - すべてのツールは HTTPS で API (Cloud Run) を叩く。Firestore を直接触らない。
//   - 認証は Bearer サービストークン (config/service-token と対) + X-Workspace-Id。
//     → API の authMiddleware → workspaceMiddleware → IDOR ガードと同じ経路を通る (裏口にしない)。
//   - fetch は注入可能 (テストは in-process の Hono app.fetch を渡し、ネットワーク無しで full-stack 検証)。
//
// データレイヤ / ビジネスロジックは API 側の単一ソースに集約され、MCP は薄い変換層に徹する。

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Status, Ticket } from '@belvedere/shared';
import { MCP_TOOLS } from './tools';

/**
 * 注入可能な fetch。`globalThis.fetch` も Hono の `app.fetch` も「Request 1 個を受けて
 * Response (もしくは Promise<Response>) を返す」形に揃えて扱う。
 */
export type FetchLike = (req: Request) => Response | Promise<Response>;

export interface McpClientConfig {
  /** API のベース URL (例: https://belvedere-api-dev-cpszmcqmuq-an.a.run.app)。末尾スラッシュ不要 */
  baseUrl: string;
  /** API の MCP サービストークン (MCP_SERVICE_TOKEN と一致させる)。refreshToken 優先、無ければこちら */
  token: string;
  /** X-Workspace-Id ヘッダに載せる workspace */
  workspaceId: string;
  /**
   * ユーザー本人認証モード: Firebase refresh token。設定時はこちらを優先し、リクエスト毎に
   * securetoken API で ID token を発行 (キャッシュ) して Bearer に使う = MCP が「あなた本人」として
   * 動き、所属する全ワークスペースにアクセスできる (サービストークンの単一 workspace 制約を超える)。
   */
  refreshToken?: string;
  /** refresh token モードで使う Firebase Web API key (公開鍵)。省略時は dev のデフォルトを使う */
  firebaseApiKey?: string;
  /** 省略時は globalThis.fetch。テストは in-process app.fetch / 交換用 fetch を注入する */
  fetch?: FetchLike;
}

/** Firebase secure token endpoint (refresh_token → id_token 交換)。 */
const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

export interface BelvedereMcp {
  listTools(): typeof MCP_TOOLS;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}

interface ApiResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

export function createBelvedereMcp(config: McpClientConfig): BelvedereMcp {
  const doFetch: FetchLike = config.fetch ?? ((req) => globalThis.fetch(req));

  // refresh token モードの ID token キャッシュ (有効期限の 60s 手前まで再利用)。
  let cachedIdToken: { token: string; expiresAt: number } | null = null;

  // refresh token → id token を securetoken API で交換する。doFetch を使うのでテストで注入差し替え可。
  async function exchangeRefreshToken(): Promise<{ idToken: string; expiresIn: number }> {
    const apiKey = config.firebaseApiKey;
    if (!apiKey) throw new Error('firebaseApiKey が未設定です (refresh token 認証に必要)');
    const url = new URL(SECURE_TOKEN_URL);
    url.searchParams.set('key', apiKey);
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(config.refreshToken!)}`;
    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const res = await doFetch(req);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`refresh token 交換失敗 (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { id_token?: string; expires_in?: string | number };
    if (!json.id_token) throw new Error('refresh token 交換: id_token が返りませんでした');
    return { idToken: json.id_token, expiresIn: Number(json.expires_in ?? 3600) };
  }

  // リクエストに載せる Bearer を決める。refreshToken があれば「あなた本人」の ID token、無ければ
  // サービストークン。ID token は有効期限内ならキャッシュを使う。
  async function resolveBearer(): Promise<string> {
    if (config.refreshToken) {
      const now = Date.now();
      if (cachedIdToken && now < cachedIdToken.expiresAt) return cachedIdToken.token;
      const { idToken, expiresIn } = await exchangeRefreshToken();
      cachedIdToken = { token: idToken, expiresAt: now + (expiresIn - 60) * 1000 };
      return idToken;
    }
    return config.token;
  }

  async function api(
    method: string,
    path: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<ApiResponse> {
    const url = new URL(path, config.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await resolveBearer()}`,
      'X-Workspace-Id': config.workspaceId,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const req = new Request(url, { method, headers, ...(body !== undefined && { body }) });
    const res = await doFetch(req);
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }

  function listTools(): typeof MCP_TOOLS {
    return MCP_TOOLS;
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // 認証情報未設定の早期ガード (HTTP を投げる前に分かりやすく案内する)。
    if (!config.token && !config.refreshToken) {
      return errorResult(
        'BELVEDERE_MCP_TOKEN (サービストークン) または BELVEDERE_REFRESH_TOKEN (本人認証) が未設定です。' +
          'docs/setup-mcp.md の手順で Claude Code の mcp 設定に env を渡してください。',
      );
    }
    try {
      switch (name) {
        // ========== 読み取り系 ==========
        case 'belvedere_ticket_list': {
          const query: Record<string, string | undefined> = {
            sprintId: optString(args.sprintId),
            status: optString(args.status),
            projectId: optString(args.projectId),
            assigneeId: optString(args.assigneeId),
            ritual: optString(args.ritual),
            type: optString(args.type),
          };
          const res = await api('GET', '/api/tickets', { query });
          if (!res.ok) return fail(res);
          const tickets = res.body as Ticket[];
          return ok({ count: tickets.length, tickets });
        }

        case 'belvedere_ticket_get': {
          const id = mustString(args.id, 'id');
          const res = await api('GET', `/api/tickets/${encodeURIComponent(id)}`);
          if (!res.ok) return fail(res);
          return ok(res.body);
        }

        case 'belvedere_epic_list': {
          const res = await api('GET', '/api/epics', {
            query: { projectId: optString(args.projectId) },
          });
          if (!res.ok) return fail(res);
          const epics = res.body as unknown[];
          return ok({ count: epics.length, epics });
        }

        case 'belvedere_member_list': {
          const res = await api('GET', '/api/members');
          if (!res.ok) return fail(res);
          const members = res.body as unknown[];
          return ok({ count: members.length, members });
        }

        case 'belvedere_quality_check': {
          const ticketId = mustString(args.ticketId, 'ticketId');
          const res = await api('GET', `/api/tickets/${encodeURIComponent(ticketId)}/quality`);
          if (!res.ok) return fail(res);
          return ok(res.body);
        }

        case 'belvedere_refinement_check': {
          const res = await api('GET', '/api/refinement', {
            query: {
              sprintId: optString(args.sprintId),
              projectId: optString(args.projectId),
            },
          });
          if (!res.ok) return fail(res);
          return ok(res.body);
        }

        // ========== Sprint 系 (bugfix ループの起点) ==========
        case 'belvedere_sprint_list': {
          const res = await api('GET', '/api/sprints');
          if (!res.ok) return fail(res);
          const all = res.body as Array<{ status: string }>;
          const status = optString(args.status);
          const sprints = status ? all.filter((s) => s.status === status) : all;
          return ok({ count: sprints.length, sprints });
        }

        case 'belvedere_sprint_current': {
          const current = await fetchActiveSprint();
          if (current === null) return fail2();
          if (!current) {
            return ok({
              current: null,
              hint: 'active な sprint がありません。UI でスプリントを開始してください',
            });
          }
          return ok({ current });
        }

        case 'belvedere_sprint_board': {
          const current = await fetchActiveSprint();
          if (current === null) return fail2();
          if (!current) {
            return ok({
              sprint: null,
              hint: 'active な sprint がありません。UI でスプリントを開始してください',
            });
          }
          const res = await api('GET', '/api/tickets', { query: { sprintId: current.id } });
          if (!res.ok) return fail(res);
          const tickets = res.body as Ticket[];
          const byStatus: Record<Status, Ticket[]> = {
            backlog: tickets.filter((t) => t.status === 'backlog'),
            todo: tickets.filter((t) => t.status === 'todo'),
            'in-progress': tickets.filter((t) => t.status === 'in-progress'),
            review: tickets.filter((t) => t.status === 'review'),
            done: tickets.filter((t) => t.status === 'done'),
          };
          const bugs = tickets.filter((t) => t.type === 'bug');
          return ok({ sprint: current, byStatus, bugs, bugCount: bugs.length });
        }

        // ========== Agent invoke ==========
        case 'belvedere_invoke_agent': {
          const agent = mustString(args.agent, 'agent');
          const prompt = mustString(args.prompt, 'prompt');
          const validAgents = [
            'orchestrator',
            'planner',
            'daily',
            'refinement',
            'reviewer',
            'retrospective',
          ];
          if (!validAgents.includes(agent)) {
            return errorResult(`invalid agent: ${agent} (valid: ${validAgents.join(', ')})`);
          }
          const res = await api('POST', `/api/agents/${encodeURIComponent(agent)}`, {
            body: { prompt },
          });
          if (!res.ok) return fail(res);
          const run = res.body as {
            status?: string;
            steps?: unknown[];
            llmUsage?: { inputTokens?: number; outputTokens?: number };
            outputArtifacts?: { summary?: string };
          };
          const summary = run.outputArtifacts?.summary ?? '(no output)';
          const meta = {
            status: run.status,
            steps: run.steps?.length ?? 0,
            tokens: {
              input: run.llmUsage?.inputTokens ?? 0,
              output: run.llmUsage?.outputTokens ?? 0,
            },
          };
          return textResult(`${summary}\n\n---\n[run summary] ${JSON.stringify(meta)}`);
        }

        // ========== CRUD 系 (書込承認はホスト側の標準ツール承認 UI に委譲) ==========
        case 'belvedere_ticket_create': {
          mustString(args.title, 'title');
          // title 以外はそのまま API の zod 検証 (TicketCreateBodySchema) に委ねる。
          const res = await api('POST', '/api/tickets', { body: stripUndefined(args) });
          if (!res.ok) return fail(res);
          return ok({ created: res.body });
        }

        case 'belvedere_ticket_update': {
          const id = mustString(args.id, 'id');
          const patch = (args.patch ?? {}) as Record<string, unknown>;
          const res = await api('PATCH', `/api/tickets/${encodeURIComponent(id)}`, {
            body: stripUndefined(patch),
          });
          if (!res.ok) return fail(res);
          return ok({ updated: res.body });
        }

        case 'belvedere_ticket_status_change': {
          const id = mustString(args.id, 'id');
          const to = mustString(args.to, 'to');
          const res = await api('PATCH', `/api/tickets/${encodeURIComponent(id)}/status`, {
            body: { status: to },
          });
          if (!res.ok) return fail(res);
          return ok(res.body);
        }

        case 'belvedere_epic_update': {
          const id = mustString(args.id, 'id');
          const patch = (args.patch ?? {}) as Record<string, unknown>;
          const res = await api('PATCH', `/api/epics/${encodeURIComponent(id)}`, {
            body: stripUndefined(patch),
          });
          if (!res.ok) return fail(res);
          return ok({ updated: res.body });
        }

        default:
          return errorResult(`unknown tool: ${name}`);
      }
    } catch (e) {
      const err = e as Error;
      return errorResult(`tool execution failed: ${err.message}`);
    }
  }

  // active sprint を 1 件返す。API エラー時は null を返す (呼出側が fail2 で表現)。
  async function fetchActiveSprint(): Promise<{ id: string; status: string } | null | undefined> {
    const res = await api('GET', '/api/sprints');
    if (!res.ok) return null;
    const sprints = res.body as Array<{ id: string; status: string }>;
    // undefined = active 無し / object = active sprint
    return sprints.find((s) => s.status === 'active');
  }

  function fail2(): CallToolResult {
    return errorResult('API /api/sprints の取得に失敗しました (認証 / workspace を確認してください)');
  }

  return { listTools, callTool };
}

// ========== ヘルパー ==========

function ok(body: unknown): CallToolResult {
  return textResult(JSON.stringify(body, null, 2));
}

function fail(res: ApiResponse): CallToolResult {
  const errMsg =
    res.body && typeof res.body === 'object' && 'error' in res.body
      ? String((res.body as { error: unknown }).error)
      : JSON.stringify(res.body);
  return errorResult(`API ${res.status}: ${errMsg}`);
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function mustString(v: unknown, fieldName: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`field "${fieldName}" must be a non-empty string`);
  }
  return v;
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** undefined 値のキーを落とす (API の zod 検証で exactOptional 違反にしないため)。 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
