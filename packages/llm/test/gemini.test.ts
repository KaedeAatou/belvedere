// GeminiLLMProvider (Gemini API REST) の単体テスト。
// 実 API を叩かず fetch を注入し、(1) リクエスト形状の変換 (2) レスポンス解析
// (3) tool_calls / 構造化出力 / エラーを担保する。A-2「Gemini API」実装の回帰ガード。

import { describe, it, expect } from 'vitest';
import { GeminiLLMProvider, toGeminiContents } from '../src/gemini';
import type { LLMMessage } from '../src/provider';

/** 注入用の fake fetch。直近リクエストを captured に記録し、canned JSON を返す。 */
function fakeFetch(responseBody: unknown, opts: { ok?: boolean; status?: number } = {}) {
  const captured: { url?: string; init?: RequestInit; body?: any } = {};
  const impl = (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    captured.body = JSON.parse((init.body as string) ?? '{}');
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: opts.status ? `HTTP ${opts.status}` : 'OK',
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, captured };
}

/** attempt ごとに status を変える fake fetch。statuses[i] が i 回目の応答 (末尾以降は最後の値を反復)。 */
function sequencedFetch(statuses: number[], okBody: unknown) {
  const calls = { count: 0 };
  const impl = (async (_url: string, _init: RequestInit) => {
    const status = statuses[Math.min(calls.count, statuses.length - 1)]!;
    calls.count++;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      statusText: `HTTP ${status}`,
      json: async () => okBody,
      text: async () => JSON.stringify({ error: { message: 'transient' } }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const textResponse = {
  candidates: [{ content: { parts: [{ text: 'Sprint Goal: 決済 MVP を完成させる' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
};

describe('GeminiLLMProvider', () => {
  it('テキスト応答を text + stop:stop + usage に解析する', async () => {
    const { impl } = fakeFetch(textResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'test-key', fetchImpl: impl });
    const resp = await provider.generate({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'system', content: 'Your role: Planner Agent' }, { role: 'user', content: '計画して' }],
    });
    expect(resp.text).toContain('Sprint Goal');
    expect(resp.stop).toEqual({ type: 'stop' });
    expect(resp.usage.inputTokens).toBe(120);
    expect(resp.usage.outputTokens).toBe(30);
    expect(resp.usage.costUsd).toBeGreaterThan(0);
  });

  it('functionCall を stop:tool_calls に解析する', async () => {
    const fnResponse = {
      candidates: [
        { content: { parts: [{ functionCall: { name: 'ticket.list', args: { status: 'todo' } } }] } },
      ],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
    };
    const { impl } = fakeFetch(fnResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl });
    const resp = await provider.generate({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] });
    expect(resp.stop.type).toBe('tool_calls');
    if (resp.stop.type === 'tool_calls') {
      expect(resp.stop.calls).toHaveLength(1);
      expect(resp.stop.calls[0]!.name).toBe('ticket.list');
      expect(resp.stop.calls[0]!.arguments).toEqual({ status: 'todo' });
      expect(resp.stop.calls[0]!.id).toBeTruthy();
    }
  });

  it('リクエストを Gemini 形状に変換する (systemInstruction / tools / responseSchema / API キーはヘッダ)', async () => {
    const { impl, captured } = fakeFetch(textResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'secret-key', fetchImpl: impl });
    await provider.generate({
      model: 'gemini-2.5-pro',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'U' },
      ],
      tools: [{ name: 'ticket.list', description: 'list', parameters: { type: 'object' } }],
      responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      temperature: 0.2,
    });
    expect(captured.body.systemInstruction.parts[0].text).toBe('SYS');
    expect(captured.body.tools[0].functionDeclarations[0].name).toBe('ticket.list');
    expect(captured.body.generationConfig.responseMimeType).toBe('application/json');
    expect(captured.body.generationConfig.responseSchema).toEqual({ type: 'object', properties: { ok: { type: 'boolean' } } });
    expect(captured.body.generationConfig.temperature).toBe(0.2);
    // API キーは URL でなくヘッダに載る (ログ漏洩回避)
    expect(captured.url).not.toContain('secret-key');
    expect((captured.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
  });

  it('非 2xx は throw する', async () => {
    const { impl } = fakeFetch({ error: { message: 'bad key' } }, { ok: false, status: 403 });
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl });
    await expect(
      provider.generate({ model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/403/);
  });

  it('429/503 は指数バックオフでリトライし、回復したら成功する', async () => {
    const { impl, calls } = sequencedFetch([503, 429, 200], textResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl, retryBaseMs: 0 });
    const resp = await provider.generate({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(resp.text).toContain('Sprint Goal');
    expect(calls.count).toBe(3); // 503 → 429 → 200
  });

  it('リトライ枯渇後も 5xx が続けば throw する (初回 + maxRetries 回)', async () => {
    const { impl, calls } = sequencedFetch([503, 503, 503, 503, 503], textResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl, retryBaseMs: 0, maxRetries: 3 });
    await expect(
      provider.generate({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/503/);
    expect(calls.count).toBe(4); // 初回 + 3 リトライ
  });

  it('400/403 はリトライせず即 throw する (RETRYABLE 外)', async () => {
    const { impl, calls } = sequencedFetch([403, 200], textResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl, retryBaseMs: 0 });
    await expect(
      provider.generate({ model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/403/);
    expect(calls.count).toBe(1); // リトライしない
  });

  it('API キー未設定なら constructor が throw する (silent fallback しない)', () => {
    expect(() => new GeminiLLMProvider({ apiKey: '' })).toThrow(/GEMINI_API_KEY/);
  });
});

describe('GeminiLLMProvider.embedText (RAG 埋め込み / 2026-06-25)', () => {
  const embedResponse = { embedding: { values: [0.1, 0.2, 0.3, 0.4] } };

  it('embedContent を叩き values を返す (model は URL / taskType は body / キーはヘッダ)', async () => {
    const { impl, captured } = fakeFetch(embedResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'secret-key', fetchImpl: impl });
    const vec = await provider.embedText('DoD とは', { taskType: 'RETRIEVAL_QUERY' });
    expect(vec).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(captured.url).toContain('text-embedding-004:embedContent'); // 既定モデル
    expect(captured.url).not.toContain('secret-key'); // キーは URL に載せない
    expect((captured.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(captured.body.content.parts[0].text).toBe('DoD とは');
    expect(captured.body.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('opts.model / outputDimensionality を尊重する (gemini-embedding-001 への切替)', async () => {
    const { impl, captured } = fakeFetch(embedResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl });
    await provider.embedText('x', { model: 'gemini-embedding-001', outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' });
    expect(captured.url).toContain('gemini-embedding-001:embedContent');
    expect(captured.body.outputDimensionality).toBe(768);
    expect(captured.body.taskType).toBe('RETRIEVAL_DOCUMENT');
  });

  it('空の embedding は throw する (silent fallback しない)', async () => {
    const { impl } = fakeFetch({ embedding: { values: [] } });
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl });
    await expect(provider.embedText('x')).rejects.toThrow(/空の embedding/);
  });

  it('429/503 は generate と同じく指数バックオフでリトライする', async () => {
    const { impl, calls } = sequencedFetch([503, 200], embedResponse);
    const provider = new GeminiLLMProvider({ apiKey: 'k', fetchImpl: impl, retryBaseMs: 0 });
    const vec = await provider.embedText('x');
    expect(vec).toHaveLength(4);
    expect(calls.count).toBe(2);
  });
});

describe('toGeminiContents', () => {
  it('assistant.toolCalls を model の functionCall に、連続 tool 結果を 1 user ターンに集約する', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'U' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'ticket.list', arguments: { a: 1 } }] },
      { role: 'tool', content: '{"items":[]}', toolName: 'ticket.list', toolCallId: 'c1' },
      { role: 'tool', content: '{"count":0}', toolName: 'ticket.count', toolCallId: 'c2' },
      { role: 'assistant', content: '完了しました' },
    ];
    const { systemInstruction, contents } = toGeminiContents(messages);
    expect(systemInstruction).toBe('SYS');
    // user / model(functionCall) / user(functionResponse x2 集約) / model(text)
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model']);
    expect(contents[1]!.parts[0]!.functionCall!.name).toBe('ticket.list');
    expect(contents[2]!.parts).toHaveLength(2);
    expect(contents[2]!.parts[0]!.functionResponse!.name).toBe('ticket.list');
    expect(contents[2]!.parts[1]!.functionResponse!.name).toBe('ticket.count');
    expect(contents[3]!.parts[0]!.text).toBe('完了しました');
  });
});
