// Belvedere API の Hono app factory (2026-06-17 / index.ts から切り出し)。
//
// 切り出しの理由: index.ts は module load 時に serve() を即実行していたため、テストから
// app.fetch() で auth/workspace middleware 込みの経路を踏めなかった (handler 単体テストのみ)。
// createApp({repo, llm}) に分離し、boot は index.ts の thin entry に残すことで、
// in-process の full-stack テスト (MCP service token で Firebase を経由しない) を可能にする。

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { runAgent, buildSystemPrompt, buildRegistry } from '@belvedere/agent';
import {
  buildTools,
  buildOrchestratorTools,
  checkTicketQuality,
  checkBacklogRefinement,
  type KnowledgeSearcher,
} from '@belvedere/tools';
import type { LLMProvider } from '@belvedere/llm';
import type { RepoContainer, TicketQuery } from '@belvedere/repo';
import type { AgentName, AgentRun, AgentStep } from '@belvedere/shared';
import { StatusSchema, RitualSchema, TicketTypeSchema, modelForAgent } from '@belvedere/shared';
import { authMiddleware, type AuthenticatedUser } from './middleware/auth';
import { workspaceMiddleware, type WorkspaceContext } from './middleware/workspace';
import {
  createTicket,
  patchTicket,
  reorderTickets,
  changeTicketStatus,
  deleteTicket,
  addTicketComment,
  type HandlerContext,
  type HandlerResult,
} from './handlers/ticket-handlers';
import { can, forbidden } from './permissions';
import { tryRefinementViaAdk } from './config/refinement-adk';
import { createEpic, patchEpic } from './handlers/epic-handlers';
import { createSprint, patchSprint, startSprint, ensureSprintCadence } from './handlers/sprint-handlers';
import { getMe, patchMember, changeMemberRole } from './handlers/member-handlers';
import { uploadImage, readImage } from './handlers/image-handlers';
import { listApiKeys, createApiKey, revokeApiKey } from './handlers/api-key-handlers';
import {
  createWorkspace,
  listMyWorkspaces,
  inviteMember,
  cancelInvite,
  patchWorkspace,
} from './handlers/workspace-handlers';
import { getFindings } from './handlers/finding-handlers';
import { checkStoryQuality } from './handlers/story-quality-handlers';
import { trimRunForPersist } from './handlers/agent-run-persist';
import { composeServerContext } from './handlers/agent-context';
import { evaluateSprintSmart } from './handlers/smart-eval-handlers';
import {
  startEstimation,
  getEstimation,
  voteEstimation,
  revealEstimation,
  adoptEstimation,
} from './handlers/estimation-handlers';
import {
  listRetroTries,
  createRetroTry,
  patchRetroTry,
  deleteRetroTry,
} from './handlers/retro-try-handlers';
import {
  listRetroNotes,
  createRetroNote,
  patchRetroNote,
  voteRetroNote,
  deleteRetroNote,
} from './handlers/retro-note-handlers';

export interface ApiVariables {
  user: AuthenticatedUser;
  workspaceId: WorkspaceContext['workspaceId'];
  role: WorkspaceContext['role'];
}

export type ApiApp = Hono<{ Variables: ApiVariables }>;

const VALID_AGENTS: ReadonlyArray<AgentName> = [
  'orchestrator',
  'planner',
  'daily',
  'refinement',
  'reviewer',
  'retrospective',
];

// Orchestrator 協議 (agent.invoke) の 1 リクエスト costUsd ハードキャップ (USD)。
// 累積コストがこの値以上になると以降の agent.invoke は error を返す (暴走協議のコスト上限)。
// Mock LLM は costUsd=0 (packages/llm/src/mock.ts) なので CI/デモでは発火しない = 無害。
const AGENT_INVOKE_COST_CAP_USD = 1.0;

// エージェント入力の上限 (security review MEDIUM / 2026-07-09)。/api/agents は認証済みなら
// 誰でも叩けるが prompt/context/history に長さ制限が無く、巨大入力で実 Gemini のトークン費用を
// 押し上げられた (コスト暴走)。クライアント (AI パネル) の現実的なサイズを大きく超える所で弾く。
const AGENT_MAX_PROMPT = 8_000;
const AGENT_MAX_CONTEXT = 16_000;
const AGENT_MAX_HISTORY_ENTRIES = 40;
const AGENT_MAX_HISTORY_TOTAL = 40_000;

type AgentInputBody = {
  prompt?: string;
  context?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
};

/** エージェント入力のサイズ超過を検出する純粋関数。問題なければ null、あれば 400 用エラー文字列。 */
function validateAgentInput(body: AgentInputBody): string | null {
  if (typeof body.prompt === 'string' && body.prompt.length > AGENT_MAX_PROMPT) {
    return `prompt が長すぎます (${body.prompt.length} > ${AGENT_MAX_PROMPT})`;
  }
  if (typeof body.context === 'string' && body.context.length > AGENT_MAX_CONTEXT) {
    return `context が長すぎます (${body.context.length} > ${AGENT_MAX_CONTEXT})`;
  }
  if (Array.isArray(body.history)) {
    if (body.history.length > AGENT_MAX_HISTORY_ENTRIES) {
      return `history の件数が多すぎます (${body.history.length} > ${AGENT_MAX_HISTORY_ENTRIES})`;
    }
    const total = body.history.reduce((n, h) => n + (typeof h?.content === 'string' ? h.content.length : 0), 0);
    if (total > AGENT_MAX_HISTORY_TOTAL) {
      return `history の合計文字数が多すぎます (${total} > ${AGENT_MAX_HISTORY_TOTAL})`;
    }
  }
  return null;
}

function buildCtx(c: Context): HandlerContext {
  return {
    workspaceId: c.get('workspaceId'),
    user: c.get('user'),
    role: c.get('role'),
  };
}

function respond<T>(c: Context, r: HandlerResult<T>): Response {
  // Hono の c.json は status code のリテラル union を要求するので明示的に分岐
  if (r.ok) {
    if (r.status === 201) return c.json(r.body, 201);
    return c.json(r.body, 200);
  }
  if (r.status === 400) return c.json(r.body, 400);
  if (r.status === 403) return c.json(r.body, 403);
  if (r.status === 409) return c.json(r.body, 409);
  return c.json(r.body, 404);
}

/**
 * Belvedere API の Hono app を組み立てて返す。serve() はしない (呼び出し側の責務)。
 * repo / llm を引数で受けることで、テストは memory repo + mock llm を注入できる。
 */
export function createApp(deps: { repo: RepoContainer; llm: LLMProvider; knowledge?: KnowledgeSearcher }): ApiApp {
  const { repo, llm, knowledge } = deps;
  const app = new Hono<{ Variables: ApiVariables }>();

  // ------- Health / Root (認証不要) -------
  app.get('/', (c) => c.json({ name: 'belvedere-api', version: '0.0.1' }));
  // factory.ts は REPO_BACKEND が undefined / null / '' の場合 memory backend を返すので、
  // /health の表示も同じ規約に揃える (?? は null/undefined しか coalesce しないため `||` を使う)。
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      llm: llm.name,
      repo: process.env.REPO_BACKEND || 'memory',
      knowledge: knowledge?.name ?? 'disabled',
    }),
  );

  // ------- CORS (Phase 1-C / 2026-06-11) -------
  // Web (belvedere-web-dev-*) → API (belvedere-api-dev-*) はサブドメイン違いの別 origin。
  // ブラウザは Authorization ヘッダ付き fetch の preflight (OPTIONS) を投げるので、
  // 認証 middleware より先に CORS を入れて OPTIONS を素通しさせる。
  app.use(
    '/api/*',
    cors({
      // dev/prod 両 web origin + prod のクリーン URL を許可。CORS は認証境界ではない
      // (auth は Bearer ID token / credentials:false) ため、正当な web origin を列挙で安全。
      origin: [
        'https://belvedere-web-dev-cpszmcqmuq-an.a.run.app', // dev web (Cloud Run)
        'https://belvedere-web-prod-iuep3t4nma-an.a.run.app', // prod web (Cloud Run)
        'https://belvedere-scrum.web.app', // prod 公開 URL (Firebase Hosting → Cloud Run rewrite)
        'https://belvedere-prod-atrium.web.app', // prod Firebase Hosting 既定ドメイン
        'https://belvedere-prod-atrium.firebaseapp.com', // prod Firebase 既定ドメイン
        'http://localhost:3000', // ローカル開発
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Workspace-Id'],
      maxAge: 600,
      credentials: false,
    }),
  );

  // ------- /api/* は認証必須 (Phase 1-B / 2026-06-10) -------
  // authMiddleware: Authorization: Bearer <ID token | MCP service token> を検証 → c.user
  // workspaceMiddleware: members から user の所属 Workspace を解決 → c.workspaceId / c.role
  app.use('/api/*', authMiddleware(repo));
  app.use('/api/*', workspaceMiddleware(repo));

  /**
   * GET /api/whoami — 認証経路の smoke test (Phase 1-B 動作確認用)
   *
   * 成功時: { userId, email, workspaceId, role }
   * エラー: 401 missing_token / invalid_token、403 invitation_required / workspace_not_accessible
   */
  app.get('/api/whoami', (c) => {
    const user = c.get('user');
    return c.json({
      userId: user.userId,
      email: user.email,
      workspaceId: c.get('workspaceId'),
      role: c.get('role'),
    });
  });

  // ------- /api/* read-only data endpoints -------
  // すべて c.get('workspaceId') 由来の workspace スコープで動く (IDOR fix)。
  app.get('/api/tickets', async (c) => {
    const q: TicketQuery = { workspaceId: c.get('workspaceId') };
    // 自由文字列フィルタ (検証不要)
    const sprintId = c.req.query('sprintId');
    const assigneeId = c.req.query('assigneeId');
    const projectId = c.req.query('projectId');
    if (sprintId) q.sprintId = sprintId;
    if (assigneeId) q.assigneeId = assigneeId;
    if (projectId) q.projectId = projectId;
    // enum フィルタは zod で検証する。不正値を `as` キャストで素通しすると、repo の等値照合で
    // 黙って 0 件になり「なぜ空?」のデバッグが難しくなる (body 検証と同じ規律で 400 にする)。
    const status = c.req.query('status');
    if (status !== undefined) {
      const p = StatusSchema.safeParse(status);
      if (!p.success) return c.json({ error: 'invalid_query', field: 'status', allowed: StatusSchema.options }, 400);
      q.status = p.data;
    }
    const type = c.req.query('type');
    if (type !== undefined) {
      const p = TicketTypeSchema.safeParse(type);
      if (!p.success) return c.json({ error: 'invalid_query', field: 'type', allowed: TicketTypeSchema.options }, 400);
      q.type = p.data;
    }
    const ritual = c.req.query('ritual');
    if (ritual !== undefined) {
      const p = RitualSchema.safeParse(ritual);
      if (!p.success) return c.json({ error: 'invalid_query', field: 'ritual', allowed: RitualSchema.options }, 400);
      q.ritual = p.data;
    }
    return c.json(await repo.tickets.list(q));
  });

  // 単体取得 (IDOR ガード) — MCP belvedere_ticket_get / UI 詳細表示用。
  app.get('/api/tickets/:id', async (c) => {
    const workspaceId = c.get('workspaceId');
    const t = await repo.tickets.get(c.req.param('id'));
    if (!t) return c.json({ error: 'not found' }, 404);
    if (t.workspaceId !== workspaceId) return c.json({ error: 'not found' }, 404);
    return c.json(t);
  });

  // チケット品質診断 (DoD / SP / US 紐付け) — checkTicketQuality 純粋関数を server 側で実行。
  app.get('/api/tickets/:id/quality', async (c) => {
    const workspaceId = c.get('workspaceId');
    const t = await repo.tickets.get(c.req.param('id'));
    if (!t) return c.json({ error: 'not found' }, 404);
    if (t.workspaceId !== workspaceId) return c.json({ error: 'not found' }, 404);
    return c.json(checkTicketQuality(t));
  });

  app.get('/api/sprints', async (c) => {
    const workspaceId = c.get('workspaceId');
    // 「常時稼働」不変条件を遅延補充: active 1 + planned 1 が無ければ作ってから返す。
    await ensureSprintCadence(repo, workspaceId);
    return c.json(await repo.sprints.list({ workspaceId }));
  });

  app.get('/api/sprints/:id', async (c) => {
    const workspaceId = c.get('workspaceId');
    const s = await repo.sprints.get(c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    if (s.workspaceId !== workspaceId) return c.json({ error: 'not found' }, 404);
    return c.json(s);
  });

  app.get('/api/epics', async (c) => {
    const workspaceId = c.get('workspaceId');
    const projectId = c.req.query('projectId');
    return c.json(await repo.epics.list({ workspaceId, ...(projectId && { projectId }) }));
  });

  app.get('/api/epics/:id', async (c) => {
    const workspaceId = c.get('workspaceId');
    const e = await repo.epics.get(c.req.param('id'));
    if (!e) return c.json({ error: 'not found' }, 404);
    if (e.workspaceId !== workspaceId) return c.json({ error: 'not found' }, 404);
    return c.json(e);
  });

  app.get('/api/members', async (c) => {
    const workspaceId = c.get('workspaceId');
    return c.json(await repo.members.list({ workspaceId }));
  });

  // ルールエンジン findings (UI バッジ / AI Integrity Panel 用、T4)
  app.get('/api/findings', async (c) => {
    return respond(c, await getFindings(repo, buildCtx(c), c.req.query('ceremony')));
  });

  // バックログリファインメント 6 観点診断 (粒度 / 依存 / valueImpact / priority↔valueImpact /
  // SP 分散 / Epic.rationale 欠落) + 種別ルール。MCP belvedere_refinement_check / Refinement 画面用。
  app.get('/api/refinement', async (c) => {
    const workspaceId = c.get('workspaceId');
    const [tickets, epics, sprints, estimations] = await Promise.all([
      repo.tickets.list({ workspaceId }),
      repo.epics.list({ workspaceId }),
      repo.sprints.list({ workspaceId }),
      repo.estimations.list({ workspaceId }),
    ]);
    const sprintId = c.req.query('sprintId');
    const projectId = c.req.query('projectId');
    const result = checkBacklogRefinement(
      { tickets, epics, sprints, estimations, now: new Date().toISOString() },
      { ...(sprintId && { sprintId }), ...(projectId && { projectId }) },
    );
    return c.json(result);
  });

  // User Story 起票時の AI 品質チェック (起票はブロックせず判定結果を返すだけ / 2026-06-13)。
  app.post('/api/story-quality', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await checkStoryQuality(repo, llm, buildCtx(c), body));
  });

  // Sprint Goal の SMART 評価 (WC-14)。active スプリントの Goal を LLM が 5観点で採点する。
  app.post('/api/planning/smart', async (c) => {
    return respond(c, await evaluateSprintSmart(repo, llm, buildCtx(c)));
  });

  // ------- /api/* CRUD endpoints (Phase 1-C / 2026-06-11) -------
  app.post('/api/tickets', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createTicket(repo, buildCtx(c), body));
  });
  app.patch('/api/tickets/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchTicket(repo, buildCtx(c), c.req.param('id'), body));
  });
  // 区画 d&d 確定 — `/api/tickets/reorder` は `:id` を取る POST ルートが無いので衝突しない。
  app.post('/api/tickets/reorder', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await reorderTickets(repo, buildCtx(c), body));
  });
  app.patch('/api/tickets/:id/status', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await changeTicketStatus(repo, buildCtx(c), c.req.param('id'), body));
  });
  app.delete('/api/tickets/:id', async (c) => {
    return respond(c, await deleteTicket(repo, buildCtx(c), c.req.param('id')));
  });
  // チケットへコメント / 追記を 1 件足す (WC-2640fecd)
  app.post('/api/tickets/:id/comments', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await addTicketComment(repo, buildCtx(c), c.req.param('id'), body));
  });

  // Sprint 新規作成 (owner/sm/po のみ / 2026-06-12)
  app.post('/api/sprints', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createSprint(repo, buildCtx(c), body));
  });
  // Sprint の goal/期間編集 + 開始 (owner/sm/po のみ / 2026-06-11)
  app.patch('/api/sprints/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchSprint(repo, buildCtx(c), c.req.param('id'), body));
  });
  app.post('/api/sprints/:id/start', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await startSprint(repo, buildCtx(c), c.req.param('id'), body));
  });

  app.post('/api/epics', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createEpic(repo, buildCtx(c), body));
  });
  app.patch('/api/epics/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchEpic(repo, buildCtx(c), c.req.param('id'), body));
  });

  // Phase 1-C: 自分自身の Member 取得 + displayName 編集
  app.get('/api/me', async (c) => respond(c, await getMe(repo, buildCtx(c))));
  app.patch('/api/members/:userId', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchMember(repo, buildCtx(c), c.req.param('userId'), body));
  });
  // メンバーの role 変更 (admin 専権 / WC-600736ff)
  app.post('/api/members/:userId/role', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await changeMemberRole(repo, buildCtx(c), c.req.param('userId'), body));
  });

  // 画像アップロード (WC-a8f0be16)。POST=保存して id を返す / GET=API プロキシで binary 配信。
  app.post('/api/images', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await uploadImage(buildCtx(c), body));
  });
  app.get('/api/images/:id', async (c) => {
    const img = await readImage(buildCtx(c), c.req.param('id'));
    if (!img) return c.json({ error: 'not_found' }, 404);
    return c.body(new Uint8Array(img.bytes), 200, {
      'Content-Type': img.contentType,
      'Cache-Control': 'private, max-age=3600',
    });
  });

  // ------- per-user API キー (programmatic アクセス用トークン / 2026-06-17) -------
  // authMiddleware + workspaceMiddleware 配下 = current workspace スコープ。
  // 平文 token は POST のレスポンスでのみ 1 回返る (config/api-key.ts / api-key-handlers.ts)。
  app.get('/api/api-keys', async (c) => respond(c, await listApiKeys(repo, buildCtx(c))));
  app.post('/api/api-keys', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createApiKey(repo, buildCtx(c), body, new Date().toISOString()));
  });
  app.delete('/api/api-keys/:id', async (c) =>
    respond(c, await revokeApiKey(repo, buildCtx(c), c.req.param('id'))),
  );

  // ------- Workspace 管理 (Phase 1-E 前倒し / 2026-06-12) -------
  // GET/POST /api/workspaces は workspaceMiddleware が skip する (所属ゼロでも呼べる)。
  app.get('/api/workspaces', async (c) =>
    respond(c, await listMyWorkspaces(repo, { user: c.get('user') })),
  );
  app.post('/api/workspaces', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createWorkspace(repo, { user: c.get('user') }, body));
  });
  app.post('/api/workspaces/members/invite', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await inviteMember(repo, buildCtx(c), body));
  });
  // PATCH /api/workspaces/:id — Product Goal 編集 (WC-23)。完全一致 skip 対象外なので
  // workspaceMiddleware を通り role が確定する (product.goal ゲート = PO/admin)。
  app.patch('/api/workspaces/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchWorkspace(repo, buildCtx(c), c.req.param('id'), body));
  });
  app.delete('/api/workspaces/members/:userId', async (c) =>
    respond(c, await cancelInvite(repo, buildCtx(c), c.req.param('userId'))),
  );

  // ------- 見積もりポーカー (T6) -------
  app.post('/api/tickets/:id/estimation', async (c) =>
    respond(c, await startEstimation(repo, buildCtx(c), c.req.param('id'), new Date().toISOString())),
  );
  app.get('/api/tickets/:id/estimation', async (c) =>
    respond(c, await getEstimation(repo, buildCtx(c), c.req.param('id'))),
  );
  app.put('/api/tickets/:id/estimation/vote', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await voteEstimation(repo, buildCtx(c), c.req.param('id'), body, new Date().toISOString()));
  });
  app.post('/api/tickets/:id/estimation/reveal', async (c) =>
    respond(c, await revealEstimation(repo, buildCtx(c), c.req.param('id'), new Date().toISOString())),
  );
  app.post('/api/tickets/:id/estimation/adopt', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await adoptEstimation(repo, buildCtx(c), c.req.param('id'), body, new Date().toISOString()));
  });

  // ------- Retro Try 積み上げ (carry-forward stack) -------
  app.get('/api/retro-tries', async (c) => respond(c, await listRetroTries(repo, buildCtx(c))));
  app.post('/api/retro-tries', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createRetroTry(repo, buildCtx(c), body));
  });
  app.patch('/api/retro-tries/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchRetroTry(repo, buildCtx(c), c.req.param('id'), body));
  });
  app.delete('/api/retro-tries/:id', async (c) => {
    return respond(c, await deleteRetroTry(repo, buildCtx(c), c.req.param('id')));
  });

  // ------- Retro KPT ボードのノート (Keep / Problem / Try) -------
  app.get('/api/retro-notes', async (c) => {
    // F-16: ?sprintNumber= で「今回の振り返り」の由来スプリントに絞る (未指定は全件 = 後方互換)。
    // 数値でない値は 400 で弾く (as キャスト素通しで黙って 0 件になるのを避ける — tickets query と同じ規律)。
    const query: { sprintNumber?: number } = {};
    const sn = c.req.query('sprintNumber');
    if (sn !== undefined) {
      const n = Number(sn);
      if (!Number.isFinite(n)) {
        return c.json({ error: 'invalid_query', field: 'sprintNumber', expected: 'number' }, 400);
      }
      query.sprintNumber = n;
    }
    return respond(c, await listRetroNotes(repo, buildCtx(c), query));
  });
  app.post('/api/retro-notes', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await createRetroNote(repo, buildCtx(c), body));
  });
  app.patch('/api/retro-notes/:id', async (c) => {
    const body = await c.req.json<unknown>().catch(() => ({}));
    return respond(c, await patchRetroNote(repo, buildCtx(c), c.req.param('id'), body));
  });
  app.post('/api/retro-notes/:id/vote', async (c) =>
    respond(c, await voteRetroNote(repo, buildCtx(c), c.req.param('id'))),
  );
  app.delete('/api/retro-notes/:id', async (c) => {
    return respond(c, await deleteRetroNote(repo, buildCtx(c), c.req.param('id')));
  });

  // 非ストリーム / ストリーム両 route が共有する agent 実行の中核。
  // tools 組み立て (orchestrator は協議統括) → runAgent → conversationId 検証 → AgentRun 永続化。
  // hooks (onStep / onDelta) を渡すとストリーミング側がイベントを流せる。
  async function runAgentCore(
    name: AgentName,
    prompt: string,
    body: {
      context?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      conversationId?: string;
    },
    workspaceId: string,
    hooks: { onStep?: (s: AgentStep) => void; onDelta?: (t: string) => void } = {},
  ): Promise<AgentRun> {
    // 価値連鎖 (Product Goal → Sprint Goal → Story) の上位 2 段を、経路 (web / MCP) に依らず
    // 必ず agent へ渡す (2026-07-10 実機検証: 未注入だと実 Gemini が「プロダクトゴールが不明」と
    // 回答する)。productGoal / active sprint 未設定でも「未設定」と明示し、agent が空欄チェック
    // ではなく意味判断 (直結しているか) に集中できるようにする。
    const ws = await repo.workspaces.get(workspaceId);
    const sprints = await repo.sprints.list({ workspaceId });
    const active = sprints.find((s) => s.status === 'active');
    const serverContext = composeServerContext(
      ws?.productGoal ?? null,
      active ? { number: active.number, goal: active.goal } : null,
      body.context,
    );

    // Orchestrator は単一窓口 = agent.invoke で 5 儀式 agent を子として協議統括する。
    // childRuns / costCap は 1 リクエスト境界で持つ (module singleton だと複数 workspace でクロス汚染)。
    const knowledgeDeps = knowledge ? { knowledge } : undefined;
    const childRuns: AgentRun[] = [];
    const tools =
      name === 'orchestrator'
        ? buildRegistry(
            buildOrchestratorTools(repo, workspaceId, {
              llm,
              childRuns,
              costCapUsd: AGENT_INVOKE_COST_CAP_USD,
              ...(knowledge && { knowledge }),
              // 画面文脈 (+ 上記の価値連鎖) を agent.invoke の子にも伝播 (根本 B / F-33): 単一窓口
              // ON で実際にツールを叩く子が「今のスプリント」やゴールを見失わないようにする。
              contextText: serverContext,
            }),
          )
        : buildRegistry(buildTools(repo, workspaceId, knowledgeDeps));

    const run = await runAgent(
      {
        agentName: name,
        workspaceId,
        llm,
        model: modelForAgent(name),
        systemPrompt: buildSystemPrompt(name),
        tools,
        trigger: 'human',
        contextText: serverContext,
        ...(body.history && { history: body.history }),
        ...(hooks.onStep && { onStep: hooks.onStep }),
        ...(hooks.onDelta && { onDelta: hooks.onDelta }),
      },
      prompt,
    );

    // 会話 ID (クライアント発番) を検証 (≤64 字 [\w-] のみ / 不正は黙って落とす = 保存タグに過ぎない)。
    const convId =
      typeof body.conversationId === 'string' && /^[\w-]{1,64}$/.test(body.conversationId)
        ? body.conversationId
        : undefined;
    const fullRun: AgentRun = {
      ...run,
      ...(convId && { conversationId: convId }),
      ...(childRuns.length > 0 && { childRuns }),
    };

    // サーバ側に会話 (AgentRun) を保存 = 会話の監査・再開の土台。保存失敗で会話体験を壊さないよう握る
    // (step content は Firestore 1MB 上限対策に trimRunForPersist で切り詰め)。復元 GET は作らない
    // (復元は web の localStorage が担当)。
    try {
      await repo.agentRuns.add(trimRunForPersist(fullRun));
    } catch (e) {
      console.error('agentRuns.add に失敗 (会話は継続):', e);
    }
    return fullRun;
  }

  // ------- /api/agents/:name (エージェント実行) -------
  app.post('/api/agents/:name', async (c) => {
    const workspaceId = c.get('workspaceId');
    // AI Agent 実行は全メンバー (admin/po/sm/dev) が可。role 未確定 (workspace 未解決) のみ弾く。
    // 全ロール許可なので実質 defense-in-depth だが、ゲートを通すことで「未認可で agent を回す」経路を塞ぐ。
    if (!can('agent.invoke', { role: c.get('role') })) {
      return c.json(forbidden('agent.invoke'), 403);
    }
    const name = c.req.param('name') as AgentName;
    if (!VALID_AGENTS.includes(name)) {
      return c.json({ error: `unknown agent: ${name}`, valid: VALID_AGENTS }, 400);
    }
    const body: {
      prompt?: string;
      context?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      conversationId?: string;
    } = await c.req
      .json<{
        prompt?: string;
        context?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        conversationId?: string;
      }>()
      .catch(() => ({}));
    const inputErr = validateAgentInput(body);
    if (inputErr) return c.json({ error: 'input_too_large', message: inputErr }, 400);
    const prompt = body.prompt ?? `Sprint 13 の${name}実行をお願いします。`;

    // Refinement を ADK + A2A ピアへ委譲する flag ルート (既定 OFF / 自前くるくるは本体のまま)。
    // ADK 不達/エラーは null が返り、そのまま下の TS runAgent へ自動 fallback する (退避路)。
    if (name === 'refinement') {
      const adkRun = await tryRefinementViaAdk(prompt, workspaceId);
      if (adkRun) return c.json(adkRun);
    }

    const fullRun = await runAgentCore(name, prompt, body, workspaceId);
    return c.json(fullRun);
  });

  // ------- /api/agents/:name/stream (SSE ストリーミング / P6) -------
  // 既存 /api/agents/:name とは別 route (既存契約は 1 バイトも変えない = MCP/CLI/e2e 無傷)。
  // 本体は runAgentCore を共有し、step (tool 実行) / delta (text 断片) / run (確定) / done / error を
  // SSE で流す。ADK 迂回は通さない (常に TS runAgent / flag 既定 OFF なので実害なし / パリティより単純さ優先)。
  app.post('/api/agents/:name/stream', async (c) => {
    const workspaceId = c.get('workspaceId');
    if (!can('agent.invoke', { role: c.get('role') })) {
      return c.json(forbidden('agent.invoke'), 403);
    }
    const name = c.req.param('name') as AgentName;
    if (!VALID_AGENTS.includes(name)) {
      return c.json({ error: `unknown agent: ${name}`, valid: VALID_AGENTS }, 400);
    }
    const body: {
      prompt?: string;
      context?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      conversationId?: string;
    } = await c.req
      .json<{
        prompt?: string;
        context?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        conversationId?: string;
      }>()
      .catch(() => ({}));
    const inputErr = validateAgentInput(body);
    if (inputErr) return c.json({ error: 'input_too_large', message: inputErr }, 400);
    const prompt = body.prompt ?? `Sprint 13 の${name}実行をお願いします。`;

    return streamSSE(c, async (stream) => {
      // sync な onStep/onDelta から async な writeSSE を、順序を保って呼ぶため promise chain で直列化する。
      let chain: Promise<unknown> = Promise.resolve();
      const emit = (event: string, data: unknown): void => {
        chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
      };
      try {
        const fullRun = await runAgentCore(name, prompt, body, workspaceId, {
          onStep: (s) => {
            if (s.type === 'tool_call') {
              emit('step', { type: 'tool_call', toolName: s.toolName });
            } else if (s.type === 'tool_result') {
              const ok = !(s.content !== null && typeof s.content === 'object' && 'error' in s.content);
              emit('step', { type: 'tool_result', toolName: s.toolName, durationMs: s.durationMs, ok });
            }
          },
          onDelta: (t) => emit('delta', { text: t }),
        });
        // run = 最終確定 (非ストリーム経路と同じ shape)。done で終端。
        emit('run', fullRun);
        emit('done', {});
        await chain;
      } catch (e) {
        emit('error', { message: (e as Error).message });
        await chain;
      }
    });
  });

  return app;
}
