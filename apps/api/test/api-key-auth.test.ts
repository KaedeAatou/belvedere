// per-user API キー認証経路の full-stack テスト (createApp + app.fetch / 2026-06-17)。
// app-auth.test.ts と同じく Firebase Admin SDK をモックし、サービストークンでキーを発行 →
// その平文キーを Bearer に使って本人として通ることを検証する。
//
// 検証: 発行 → 平文キーで whoami が発行者として解決 / lastUsedAt 更新 / 失効後 401 / 未登録 blv_ → 401。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, type ApiApp } from '../src/app';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';

// app-auth.test.ts と同様の Firebase モック (CI に ADC が無く verifyIdToken がハングするため)。
vi.mock('firebase-admin/app', () => ({
  initializeApp: () => ({}),
  applicationDefault: () => ({}),
  getApps: () => [],
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async () => {
      throw new Error('mock: firebase not available in test');
    },
  }),
}));

const TOKEN = 'test-service-token';

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

describe('API 認証 (per-user API キー)', () => {
  let app: ApiApp;
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
    app = createApp({ repo, llm: createLLMProvider('mock') });
  });

  async function mintKey(name = 'ci'): Promise<string> {
    const res = await app.fetch(req('/api/api-keys', { token: TOKEN, method: 'POST', body: { name } }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; token: string };
    return json.token;
  }

  it('発行 → 平文キーで whoami が発行者 (svc:mcp) として解決する', async () => {
    const key = await mintKey();
    expect(key).toMatch(/^blv_/);

    const res = await app.fetch(req('/api/whoami', { token: key }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { userId: string; email: string; workspaceId: string; role: string };
    expect(json.userId).toBe('svc:mcp'); // service token で発行 = svc:mcp 所有
    expect(json.email).toBe('mcp@belvedere.svc');
    expect(json.workspaceId).toBe('ws-belvedere');
    expect(json.role).toBe('po');
  });

  it('認証成功で lastUsedAt が更新される (best-effort)', async () => {
    const key = await mintKey();
    const before = (await repo.apiKeys.list({ workspaceId: 'ws-belvedere' }))[0]!;
    expect(before.lastUsedAt).toBeUndefined();

    await app.fetch(req('/api/whoami', { token: key }));
    // best-effort upsert は await されないため、microtask flush を挟む。
    await new Promise((r) => setTimeout(r, 0));
    const after = await repo.apiKeys.get(before.id);
    expect(after?.lastUsedAt).toBeDefined();
  });

  it('失効後は同じキーで 401 invalid_token', async () => {
    const listRes = await app.fetch(req('/api/api-keys', { token: TOKEN })); // 既存確認用
    expect(listRes.status).toBe(200);
    const key = await mintKey();
    const created = (await repo.apiKeys.list({ workspaceId: 'ws-belvedere' }))[0]!;

    const del = await app.fetch(req(`/api/api-keys/${created.id}`, { token: TOKEN, method: 'DELETE' }));
    expect(del.status).toBe(200);

    const res = await app.fetch(req('/api/whoami', { token: key }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_token');
  });

  it('未登録の blv_ トークン → 401 invalid_token (Firebase 検証に回さない)', async () => {
    const res = await app.fetch(req('/api/whoami', { token: 'blv_not_a_real_key' }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_token');
  });

  // WC-3a8bb53c: API キーは発行元 workspace に固定 (ユーザ×ワークスペース scope)。
  // svc:mcp を 2 workspace 所属にし、ws-belvedere で発行したキーが X-Workspace-Id=ws-second を
  // 渡しても ws-belvedere に固定されること / 一方サービストークン (非 API キー) は切替できることを確認。
  async function joinSecond(): Promise<void> {
    await repo.members.upsert({ userId: 'svc:mcp', workspaceId: 'ws-belvedere', email: 'mcp@belvedere.svc', displayName: 'MCP', role: 'po' });
    await repo.members.upsert({ userId: 'svc:mcp', workspaceId: 'ws-second', email: 'mcp@belvedere.svc', displayName: 'MCP', role: 'dev' });
  }

  it('API キーは発行元 workspace に固定され X-Workspace-Id を無視する', async () => {
    await joinSecond();
    const key = await mintKey('pinned'); // X-Workspace-Id=ws-belvedere で発行 = key.workspaceId=ws-belvedere
    // 別 workspace を X-Workspace-Id で要求しても、キーは発行元 (ws-belvedere) に固定される
    const res = await app.fetch(req('/api/whoami', { token: key, workspaceId: 'ws-second' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { workspaceId: string; role: string };
    expect(json.workspaceId).toBe('ws-belvedere'); // ws-second ではなく発行元に固定
    expect(json.role).toBe('po');
  });

  it('サービストークン (非 API キー) は X-Workspace-Id で切替できる (固定は API キー限定)', async () => {
    await joinSecond();
    // 対比: 同じ svc:mcp でもサービストークン経路は apiKeyWorkspaceId を持たないので切替可。
    const res = await app.fetch(req('/api/whoami', { token: TOKEN, workspaceId: 'ws-second' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { workspaceId: string; role: string };
    expect(json.workspaceId).toBe('ws-second');
    expect(json.role).toBe('dev');
  });

  it('発行 → list に出る / tokenHash は API レスポンスに含まれない', async () => {
    await mintKey('visible');
    const res = await app.fetch(req('/api/api-keys', { token: TOKEN }));
    expect(res.status).toBe(200);
    const keys = (await res.json()) as Array<Record<string, unknown>>;
    expect(keys.some((k) => k.name === 'visible')).toBe(true);
    for (const k of keys) expect('tokenHash' in k).toBe(false);
  });
});
