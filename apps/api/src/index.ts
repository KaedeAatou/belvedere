// Belvedere API (Cloud Run 想定)
// 最小エンドポイント:
//   GET  /              ping (認証不要)
//   GET  /health        health check (認証不要)
//   GET  /tickets       全チケット (Phase 1-B 末で /api/* 配下に移動して保護予定)
//   GET  /sprints/:id   スプリント情報 (同上)
//   GET  /epics         Epic 一覧 (同上)
//   GET  /epics/:id     Epic 詳細 (同上)
//   POST /agents/:name  エージェント実行 (同上)
//   GET  /api/whoami    認証経路 smoke test (Phase 1-B / 2026-06-10 追加、認証必須)

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { runAgent, buildSystemPrompt, buildRegistry } from '@belvedere/agent';
import { createLLMProvider } from '@belvedere/llm';
import { createRepoContainer } from '@belvedere/repo';
import { buildTools } from '@belvedere/tools';
import type { AgentName } from '@belvedere/shared';
import { authMiddleware, type AuthenticatedUser } from './middleware/auth';
import { workspaceMiddleware, type WorkspaceContext } from './middleware/workspace';

const app = new Hono<{
  Variables: {
    user: AuthenticatedUser;
    workspaceId: WorkspaceContext['workspaceId'];
    role: WorkspaceContext['role'];
  };
}>();

const repo = await createRepoContainer(process.env.REPO_BACKEND);
const llm = createLLMProvider(process.env.LLM_PROVIDER);
const tools = buildRegistry(buildTools(repo));

// ------- Health / Root -------
app.get('/', (c) => c.json({ name: 'belvedere-api', version: '0.0.1' }));
// factory.ts は REPO_BACKEND が undefined / null / '' の場合 memory backend を返すので、
// /health の表示も同じ規約に揃える (?? は null/undefined しか coalesce しないため `||` を使う)。
app.get('/health', (c) => c.json({ status: 'ok', llm: llm.name, repo: process.env.REPO_BACKEND || 'memory' }));

// ------- Read-only data endpoints -------
app.get('/tickets', async (c) => {
  const sprintId = c.req.query('sprintId');
  const status = c.req.query('status');
  const ts = await repo.tickets.list({
    ...(sprintId && { sprintId }),
    ...(status && { status: status as Parameters<typeof repo.tickets.list>[0] extends infer U ? U extends { status?: infer S } ? S : never : never }),
  });
  return c.json(ts);
});

app.get('/sprints', async (c) => c.json(await repo.sprints.list()));

app.get('/sprints/:id', async (c) => {
  const s = await repo.sprints.get(c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  return c.json(s);
});

app.get('/epics', async (c) => c.json(await repo.epics.list()));

app.get('/epics/:id', async (c) => {
  const e = await repo.epics.get(c.req.param('id'));
  if (!e) return c.json({ error: 'not found' }, 404);
  return c.json(e);
});

app.get('/members', async (c) => c.json(await repo.members.list()));

// ------- /api/* は認証必須 (Phase 1-B / 2026-06-10) -------
// authMiddleware: Authorization: Bearer <ID token> を Firebase Admin SDK で検証 → c.user
// workspaceMiddleware: members から user の所属 Workspace を解決 → c.workspaceId / c.role
// 既存の /tickets 等は Phase 1-B 末に /api/* 配下に移動して同様に保護する (段階的移行)
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

// ------- Agent invocation -------
const VALID_AGENTS: ReadonlyArray<AgentName> = ['orchestrator', 'planner', 'daily', 'refinement', 'reviewer', 'retrospective'];

app.post('/agents/:name', async (c) => {
  const name = c.req.param('name') as AgentName;
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ error: `unknown agent: ${name}`, valid: VALID_AGENTS }, 400);
  }
  const body: { prompt?: string } = await c.req.json<{ prompt?: string }>().catch(() => ({}));
  const prompt = body.prompt ?? `Sprint 13 の${name}実行をお願いします。`;

  const run = await runAgent(
    {
      agentName: name,
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
