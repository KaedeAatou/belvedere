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

  it('API キー未設定なら constructor が throw する (silent fallback しない)', () => {
    expect(() => new GeminiLLMProvider({ apiKey: '' })).toThrow(/GEMINI_API_KEY/);
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
