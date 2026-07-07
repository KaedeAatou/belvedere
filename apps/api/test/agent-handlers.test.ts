// POST /api/agents/:name の HTTP 契約を特徴づける (characterization) テスト (P0 / 2026-07-07)。
//
// AI パネル チャット品質改善の起点。現状の「会話履歴 (history)・スプリント context の受け渡し」と
// 「AgentRun がサーバに保存されない」挙動をテストで固定する。
//  - ②③ = commit 4085288 で入った multi-turn 配管が LLM への messages に正しく反映されることを保証。
//  - ⑥ = 現状 repo に保存されないことを固定。後続 P5 (サーバ側会話保存) がこの assert を red→green で反転する基準。
//
// 認証は app-auth.test.ts と同じく MCP service token 経路 (Firebase 非経由 / role=po / ws-belvedere)。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, type ApiApp } from '../src/app';
import { createMemoryRepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';
import type { LLMProvider, LLMRequest } from '@belvedere/llm';

// Firebase Admin SDK をモック (CI に ADC が無く実 verifyIdToken がハングするため)。
// service token 経路は Firebase を呼ばないのでこのモックは無影響。
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
const WS = 'ws-belvedere';

function req(path: string, opts: { token?: string; method?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'X-Workspace-Id': WS };
  if (opts.token !== undefined) headers['Authorization'] = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(body !== undefined && { body }),
  });
}

/**
 * mock provider をラップし、generate に渡された LLMRequest を全件記録する spy。
 * runtime は messages 配列を in-place で mutate する (tool ターンを追記) ため、記録時に deep copy する。
 */
function spyLLM(delegate: LLMProvider): { provider: LLMProvider; calls: LLMRequest[] } {
  const calls: LLMRequest[] = [];
  return {
    calls,
    provider: {
      name: `spy:${delegate.name}`,
      generate: async (r: LLMRequest) => {
        calls.push(structuredClone(r));
        return delegate.generate(r);
      },
    },
  };
}

function makeApp(llm?: LLMProvider): { app: ApiApp; repo: ReturnType<typeof createMemoryRepoContainer> } {
  const repo = createMemoryRepoContainer();
  const app = createApp({ repo, llm: llm ?? createLLMProvider('mock') });
  return { app, repo };
}

describe('POST /api/agents/:name — HTTP 契約 (characterization / P0)', () => {
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
  });

  it('① 儀式 agent 実行 → 200 + AgentRun shape (status/steps/outputArtifacts.summary/llmUsage)', async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      req('/api/agents/planner', { token: TOKEN, method: 'POST', body: { prompt: 'こんにちは' } }),
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as {
      agentName: string;
      status: string;
      outputArtifacts?: { summary?: string };
      steps: unknown[];
      llmUsage?: { model: string };
    };
    expect(run.agentName).toBe('planner');
    expect(run.status).toBe('succeeded');
    expect(typeof run.outputArtifacts?.summary).toBe('string');
    expect(Array.isArray(run.steps)).toBe(true);
    expect(run.llmUsage?.model).toBeTruthy();
  });

  it('② history が LLM への messages に (system の後・今回 user の前に) 積まれる', async () => {
    const { provider, calls } = spyLLM(createLLMProvider('mock'));
    const { app } = makeApp(provider);
    const res = await app.fetch(
      req('/api/agents/daily', {
        token: TOKEN,
        method: 'POST',
        body: {
          prompt: '今の進捗は?',
          history: [
            { role: 'user', content: '前回の質問X' },
            { role: 'assistant', content: '前回の回答Y' },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const first = calls[0]!;
    expect(first.messages[0]!.role).toBe('system');
    const users = first.messages.filter((m) => m.role === 'user').map((m) => m.content);
    const asst = first.messages.filter((m) => m.role === 'assistant').map((m) => m.content);
    expect(users).toContain('前回の質問X');
    expect(asst).toContain('前回の回答Y');
  });

  it('③ context は今回の user メッセージ先頭に prefix される', async () => {
    const { provider, calls } = spyLLM(createLLMProvider('mock'));
    const { app } = makeApp(provider);
    const ctx = '[現在のスプリント状況]\nid=sprint-13';
    const res = await app.fetch(
      req('/api/agents/daily', {
        token: TOKEN,
        method: 'POST',
        body: { prompt: '今の進捗は?', context: ctx },
      }),
    );
    expect(res.status).toBe(200);
    const first = calls[0]!;
    const lastUser = first.messages.filter((m) => m.role === 'user').at(-1)!;
    expect(lastUser.content.startsWith(ctx)).toBe(true);
    expect(lastUser.content).toContain('今の進捗は?');
  });

  it('④ 未知の agent 名 → 400', async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      req('/api/agents/bogus', { token: TOKEN, method: 'POST', body: { prompt: 'x' } }),
    );
    expect(res.status).toBe(400);
  });

  it('⑤ orchestrator は childRuns 付き (agent.invoke で儀式 agent を招集)', async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      req('/api/agents/orchestrator', { token: TOKEN, method: 'POST', body: { prompt: 'この候補を診断して' } }),
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as { childRuns?: unknown[] };
    expect(Array.isArray(run.childRuns)).toBe(true);
    expect(run.childRuns!.length).toBeGreaterThanOrEqual(1);
  });

  it('⑥ AgentRun は repo に保存される (P5 でサーバ側会話保存を追加)', async () => {
    const { app, repo } = makeApp();
    await app.fetch(req('/api/agents/planner', { token: TOKEN, method: 'POST', body: { prompt: 'x' } }));
    const saved = await repo.agentRuns.list({ workspaceId: WS });
    expect(saved.length).toBeGreaterThanOrEqual(1);
    expect(saved[0]!.agentName).toBe('planner');
  });

  it('⑦ 正しい conversationId は run に保存 / 不正な id は落とす (保存タグに過ぎない)', async () => {
    const { app, repo } = makeApp();
    await app.fetch(
      req('/api/agents/planner', { token: TOKEN, method: 'POST', body: { prompt: 'x', conversationId: 'conv-abc_123' } }),
    );
    await app.fetch(
      req('/api/agents/planner', { token: TOKEN, method: 'POST', body: { prompt: 'y', conversationId: 'bad id!!' } }),
    );
    const ids = (await repo.agentRuns.list({ workspaceId: WS })).map((r) => r.conversationId);
    expect(ids).toContain('conv-abc_123');
    expect(ids.filter((x) => x === 'bad id!!')).toHaveLength(0); // 空白・記号入りは弾く
  });
});
