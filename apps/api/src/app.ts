// Belvedere API の Hono app factory (2026-06-17 / index.ts から切り出し)。
//
// 切り出しの理由: index.ts は module load 時に serve() を即実行していたため、テストから
// app.fetch() で auth/workspace middleware 込みの経路を踏めなかった (handler 単体テストのみ)。
// createApp({repo, llm}) に分離し、boot は index.ts の thin entry に残すことで、
// in-process の full-stack テスト (MCP service token で Firebase を経由しない) を可能にする。

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
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
import type { AgentName, AgentRun } from '@belvedere/shared';
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
} from './handlers/workspace-handlers';
import { getFindings } from './handlers/finding-handlers';
import { checkStoryQuality } from './handlers/story-quality-handlers';
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
  app.get('/api/retro-notes', async (c) => respond(c, await listRetroNotes(repo, buildCtx(c))));
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
    const body: { prompt?: string } = await c.req.json<{ prompt?: string }>().catch(() => ({}));
    const prompt = body.prompt ?? `Sprint 13 の${name}実行をお願いします。`;

    // Refinement を ADK + A2A ピアへ委譲する flag ルート (既定 OFF / 自前くるくるは本体のまま)。
    // ADK 不達/エラーは null が返り、そのまま下の TS runAgent へ自動 fallback する (退避路)。
    if (name === 'refinement') {
      const adkRun = await tryRefinementViaAdk(prompt, workspaceId);
      if (adkRun) return c.json(adkRun);
    }

    // Orchestrator は単一窓口 = agent.invoke で 5 儀式 agent を子として協議統括する。
    // 他 5 agent は素の buildTools (agent.invoke なし = 子になっても再協議できない / 深さ 1 固定)。
    // childRuns コレクタと costCap は 1 リクエスト境界 (request-scoped) で持つ
    // (module singleton にすると複数 workspace 同時実行でクロス汚染する)。
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
      },
      prompt,
    );

    // 協議で子 run が起きていれば親 run へ後付け (後方互換: 0 件なら conditional spread でキーごと省略)。
    return c.json({ ...run, ...(childRuns.length > 0 && { childRuns }) });
  });

  return app;
}
