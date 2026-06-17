// API full-stack テスト (createApp + app.fetch / 2026-06-17)。
//
// 従来は authMiddleware が Firebase Admin SDK を要するため Hono 経由の test ができず、
// handler 単体 test のみだった (crud-handlers.test.ts の冒頭コメント参照)。
// MCP service token パス (config/service-token.ts) の導入で Firebase を経由せず認証できるようになり、
// 認証 → workspace 解決 → handler → repo の full-stack を in-process で踏めるようになった。
//
// ここでは MCP クライアントに依存しない「API の生 HTTP 契約」を固定する:
//  - 認証 (missing / invalid / valid service token / env 未設定で無効)
//  - 新エンドポイント (GET /api/tickets/:id, /quality, type フィルタ, /api/refinement)

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, type ApiApp } from '../src/app';
import { createMemoryRepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';

const TOKEN = 'test-service-token';

function makeApp(): ApiApp {
  return createApp({ repo: createMemoryRepoContainer(), llm: createLLMProvider('mock') });
}

function req(path: string, opts: { token?: string; workspaceId?: string; method?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) headers['Authorization'] = `Bearer ${opts.token}`;
  headers['X-Workspace-Id'] = opts.workspaceId ?? 'ws-belvedere';
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return new Request(`http://localhost${path}`, { method: opts.method ?? 'GET', headers, ...(body !== undefined && { body }) });
}

describe('API 認証 (service token)', () => {
  let app: ApiApp;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    app = makeApp();
  });

  it('GET /health は認証不要で 200 + repo 表記を返す', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; repo: string };
    expect(json.status).toBe('ok');
  });

  it('Authorization 無し → 401 missing_token', async () => {
    const res = await app.fetch(new Request('http://localhost/api/whoami', { headers: { 'X-Workspace-Id': 'ws-belvedere' } }));
    expect(res.status).toBe(401);
    expect((await res.json()) as { error: string }).toEqual({ error: 'missing_token' });
  });

  it('不正トークン → 401 invalid_token', async () => {
    const res = await app.fetch(req('/api/whoami', { token: 'garbage' }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_token');
  });

  it('正しいサービストークン → 200 / svc:mcp / role=po / ws-belvedere', async () => {
    const res = await app.fetch(req('/api/whoami', { token: TOKEN }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { userId: string; email: string; workspaceId: string; role: string };
    expect(json.userId).toBe('svc:mcp');
    expect(json.email).toBe('mcp@belvedere.svc');
    expect(json.workspaceId).toBe('ws-belvedere');
    expect(json.role).toBe('po');
  });

  it('env MCP_SERVICE_TOKEN 未設定なら正しいトークンでも 401 (認証パス無効 = 安全側)', async () => {
    delete process.env.MCP_SERVICE_TOKEN;
    const res = await app.fetch(req('/api/whoami', { token: TOKEN }));
    expect(res.status).toBe(401);
  });

  it('未所属 workspace を X-Workspace-Id 指定 → 403', async () => {
    const res = await app.fetch(req('/api/whoami', { token: TOKEN, workspaceId: 'ws-attacker' }));
    expect(res.status).toBe(403);
  });
});

describe('API 新エンドポイント', () => {
  let app: ApiApp;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    app = makeApp();
  });

  it('GET /api/tickets/:id 正常 → 200 / 存在しない → 404', async () => {
    const ok = await app.fetch(req('/api/tickets/WC-101', { token: TOKEN }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { id: string }).id).toBe('WC-101');

    const nope = await app.fetch(req('/api/tickets/WC-NOPE', { token: TOKEN }));
    expect(nope.status).toBe(404);
  });

  it('GET /api/tickets/:id/quality → DoD/SP/US の品質判定を返す', async () => {
    const res = await app.fetch(req('/api/tickets/WC-101/quality', { token: TOKEN }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ticketId: string; issues: string[]; ok: boolean };
    expect(json.ticketId).toBe('WC-101');
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it('GET /api/tickets?type=bug → seed に bug 無し / 起票後は取得できる', async () => {
    const before = await app.fetch(req('/api/tickets?type=bug', { token: TOKEN }));
    expect(((await before.json()) as unknown[]).length).toBe(0);

    const created = await app.fetch(
      req('/api/tickets', { token: TOKEN, method: 'POST', body: { title: 'a bug', type: 'bug', sprintId: 'sprint-13' } }),
    );
    expect(created.status).toBe(201);

    const after = await app.fetch(req('/api/tickets?type=bug&sprintId=sprint-13', { token: TOKEN }));
    expect(((await after.json()) as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/tickets?status=INVALID → 400 invalid_query (黙って空配列にしない)', async () => {
    const res = await app.fetch(req('/api/tickets?status=INVALID', { token: TOKEN }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_query');
  });

  it('GET /api/tickets?type=epic → 400 (type は story/task/spike/bug/incident のみ)', async () => {
    const res = await app.fetch(req('/api/tickets?type=epic', { token: TOKEN }));
    expect(res.status).toBe(400);
  });

  it('GET /api/refinement → 6 観点 (EP-3 strategic_intent_missing) を返す', async () => {
    const res = await app.fetch(req('/api/refinement', { token: TOKEN }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { findings: Array<{ ticketId: string; signal: string }> };
    expect(json.findings.some((f) => f.ticketId === 'EP-3' && f.signal === 'strategic_intent_missing')).toBe(true);
  });
});
