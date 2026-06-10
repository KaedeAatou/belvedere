// Belvedere API (Cloud Run 想定)
// 最小エンドポイント:
//   GET  /              ping (認証不要)
//   GET  /health        health check (認証不要)
//
// 以下はすべて /api/* 配下 (Phase 1-B / 2026-06-10 / 認証 + workspace 解決必須):
//   GET  /api/whoami        認証経路 smoke test
//   GET  /api/tickets       チケット一覧 (workspaceId フィルタ済)
//   GET  /api/sprints       スプリント一覧
//   GET  /api/sprints/:id   スプリント詳細
//   GET  /api/epics         Epic 一覧
//   GET  /api/epics/:id     Epic 詳細
//   GET  /api/members       メンバ一覧 (自分の Workspace のみ)
//   POST /api/agents/:name  エージェント実行 (workspaceId スコープで動く)

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { runAgent, buildSystemPrompt, buildRegistry } from '@belvedere/agent';
import { createLLMProvider } from '@belvedere/llm';
import { createRepoContainer } from '@belvedere/repo';
import { buildTools } from '@belvedere/tools';
import type { AgentName } from '@belvedere/shared';
import { authMiddleware, type AuthenticatedUser } from './middleware/auth';
import { workspaceMiddleware, type WorkspaceContext } from './middleware/workspace';
import {
  createTicket,
  patchTicket,
  changeTicketStatus,
  deleteTicket,
  type HandlerContext,
  type HandlerResult,
} from './handlers/ticket-handlers';
import { createEpic, patchEpic } from './handlers/epic-handlers';
import { getMe, patchMember } from './handlers/member-handlers';
import { getFindings } from './handlers/finding-handlers';

const app = new Hono<{
  Variables: {
    user: AuthenticatedUser;
    workspaceId: WorkspaceContext['workspaceId'];
    role: WorkspaceContext['role'];
  };
}>();

const repo = await createRepoContainer(process.env.REPO_BACKEND);
const llm = createLLMProvider(process.env.LLM_PROVIDER);

// ------- Health / Root (認証不要) -------
app.get('/', (c) => c.json({ name: 'belvedere-api', version: '0.0.1' }));
// factory.ts は REPO_BACKEND が undefined / null / '' の場合 memory backend を返すので、
// /health の表示も同じ規約に揃える (?? は null/undefined しか coalesce しないため `||` を使う)。
app.get('/health', (c) => c.json({ status: 'ok', llm: llm.name, repo: process.env.REPO_BACKEND || 'memory' }));

// ------- CORS (Phase 1-C / 2026-06-11) -------
// Web (belvedere-web-dev-*) → API (belvedere-api-dev-*) はサブドメイン違いの別 origin。
// ブラウザは Authorization ヘッダ付き fetch の preflight (OPTIONS) を投げるので、
// 認証 middleware より先に CORS を入れて OPTIONS を素通しさせる。
//
// origin allowlist:
//   - https://belvedere-web-dev-cpszmcqmuq-an.a.run.app (本番 Cloud Run)
//   - http://localhost:3000 (ローカル Nuxt dev)
// Phase 1-D 以降で MCP HTTP / staging を追加する時に env (ALLOWED_ORIGINS) 化を検討。
app.use(
  '/api/*',
  cors({
    origin: [
      'https://belvedere-web-dev-cpszmcqmuq-an.a.run.app',
      'http://localhost:3000',
    ],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Workspace-Id'],
    maxAge: 600,
    credentials: false,
  }),
);

// ------- /api/* は認証必須 (Phase 1-B / 2026-06-10) -------
// authMiddleware: Authorization: Bearer <ID token> を Firebase Admin SDK で検証 → c.user
// workspaceMiddleware: members から user の所属 Workspace を解決 → c.workspaceId / c.role
app.use('/api/*', authMiddleware);
app.use('/api/*', workspaceMiddleware(repo));

/**
 * GET /api/whoami — 認証経路の smoke test (Phase 1-B 動作確認用)
 *
 * 必須ヘッダ: Authorization: Bearer <Firebase ID token>
 * 任意ヘッダ: X-Workspace-Id (省略時は 1 件目の Workspace)
 *
 * 成功時のレスポンス:
 *   { userId, email, workspaceId, role }
 *
 * エラーパターン:
 *   - token 無し → 401 { error: 'missing_token' }
 *   - token 無効 → 401 { error: 'invalid_token' }
 *   - member 未登録 → 403 { error: 'invitation_required' }
 *   - X-Workspace-Id 指定だが未所属 → 403 { error: 'workspace_not_accessible' }
 */
app.get('/api/whoami', (c) => {
  const user = c.get('user');
  const workspaceId = c.get('workspaceId');
  const role = c.get('role');
  return c.json({
    userId: user.userId,
    email: user.email,
    workspaceId,
    role,
  });
});

// ------- /api/* read-only data endpoints -------
// すべて c.get('workspaceId') 由来の workspace スコープで動く (IDOR fix)。
app.get('/api/tickets', async (c) => {
  const workspaceId = c.get('workspaceId');
  const sprintId = c.req.query('sprintId');
  const status = c.req.query('status');
  const ts = await repo.tickets.list({
    workspaceId,
    ...(sprintId && { sprintId }),
    ...(status && { status: status as Parameters<typeof repo.tickets.list>[0] extends infer U ? U extends { status?: infer S } ? S : never : never }),
  });
  return c.json(ts);
});

app.get('/api/sprints', async (c) => {
  const workspaceId = c.get('workspaceId');
  return c.json(await repo.sprints.list({ workspaceId }));
});

app.get('/api/sprints/:id', async (c) => {
  const workspaceId = c.get('workspaceId');
  const s = await repo.sprints.get(c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  // IDOR ガード: 別 workspace の sprint は「存在しない」扱い
  if (s.workspaceId !== workspaceId) return c.json({ error: 'not found' }, 404);
  return c.json(s);
});

app.get('/api/epics', async (c) => {
  const workspaceId = c.get('workspaceId');
  return c.json(await repo.epics.list({ workspaceId }));
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

// ------- /api/* CRUD endpoints (Phase 1-C / 2026-06-11) -------
// すべて c.get('workspaceId') / c.get('user') を HandlerContext に詰めて純粋関数 handler に委譲。
// handler の HandlerResult から Hono レスポンスに変換するヘルパ。

function buildCtx(c: import('hono').Context): HandlerContext {
  return {
    workspaceId: c.get('workspaceId'),
    user: c.get('user'),
  };
}

function respond<T>(c: import('hono').Context, r: HandlerResult<T>): Response {
  // Hono の c.json は status code のリテラル union を要求するので、201/400/404/200 を明示的に分岐
  if (r.ok) {
    if (r.status === 201) return c.json(r.body, 201);
    return c.json(r.body, 200);
  }
  if (r.status === 400) return c.json(r.body, 400);
  return c.json(r.body, 404);
}

app.post('/api/tickets', async (c) => {
  const body = await c.req.json<unknown>().catch(() => ({}));
  return respond(c, await createTicket(repo, buildCtx(c), body));
});
app.patch('/api/tickets/:id', async (c) => {
  const body = await c.req.json<unknown>().catch(() => ({}));
  return respond(c, await patchTicket(repo, buildCtx(c), c.req.param('id'), body));
});
app.patch('/api/tickets/:id/status', async (c) => {
  const body = await c.req.json<unknown>().catch(() => ({}));
  return respond(c, await changeTicketStatus(repo, buildCtx(c), c.req.param('id'), body));
});
app.delete('/api/tickets/:id', async (c) => {
  return respond(c, await deleteTicket(repo, buildCtx(c), c.req.param('id')));
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

// ------- /api/agents/:name (エージェント実行) -------
const VALID_AGENTS: ReadonlyArray<AgentName> = ['orchestrator', 'planner', 'daily', 'refinement', 'reviewer', 'retrospective'];

app.post('/api/agents/:name', async (c) => {
  const workspaceId = c.get('workspaceId');
  const name = c.req.param('name') as AgentName;
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ error: `unknown agent: ${name}`, valid: VALID_AGENTS }, 400);
  }
  const body: { prompt?: string } = await c.req.json<{ prompt?: string }>().catch(() => ({}));
  const prompt = body.prompt ?? `Sprint 13 の${name}実行をお願いします。`;

  // workspaceId を closure cap した tools を毎リクエストで作成 (request-scoped)。
  // global にすると他 Workspace のリクエストで前回 workspaceId が漏れる。
  const tools = buildRegistry(buildTools(repo, workspaceId));

  const run = await runAgent(
    {
      agentName: name,
      workspaceId,
      llm,
      model: 'gemini-2.5-pro',
      systemPrompt: buildSystemPrompt(name),
      tools,
      trigger: 'human',
    },
    prompt,
  );

  return c.json(run);
});

// ------- Server boot -------
const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[belvedere-api] listening on http://0.0.0.0:${info.port}`);
  console.log(`  llm provider: ${llm.name}`);
  console.log(`  repo backend: ${process.env.REPO_BACKEND ?? 'memory'}`);
});
