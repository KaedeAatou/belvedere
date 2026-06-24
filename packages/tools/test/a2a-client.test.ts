// 最小 A2A クライアントの単体テスト (2026-06-25)。
// fetchImpl 注入で A2A の JSON-RPC message/send 形状・防御的テキスト抽出・失敗時 ok:false を固定する。

import { describe, it, expect } from 'vitest';
import { a2aInvoke, extractA2AText } from '../src/a2a-client';

function jsonResponse(body: unknown, opts: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.status ? `HTTP ${opts.status}` : 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('extractA2AText (Task / Message のバージョン差を吸収)', () => {
  it('Task.artifacts[].parts からテキストを集める', () => {
    const result = { artifacts: [{ parts: [{ kind: 'text', text: 'Refinement: ' }, { kind: 'text', text: '5件' }] }] };
    expect(extractA2AText(result)).toBe('Refinement: 5件');
  });
  it('Message 直返し (parts) も拾う', () => {
    expect(extractA2AText({ parts: [{ kind: 'text', text: 'hello' }] })).toBe('hello');
  });
  it('status.message.parts も拾う', () => {
    expect(extractA2AText({ status: { message: { parts: [{ kind: 'text', text: 'done' }] } } })).toBe('done');
  });
  it('テキストが無ければ空文字', () => {
    expect(extractA2AText({ artifacts: [{ parts: [{ kind: 'file' }] }] })).toBe('');
    expect(extractA2AText(null)).toBe('');
  });
});

describe('a2aInvoke (JSON-RPC message/send)', () => {
  it('message/send を正しい形で叩き result からテキストを返す', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const fakeFetch = (async (url: string, init: { body: string }) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return jsonResponse({
        jsonrpc: '2.0',
        id: 'm1',
        result: { artifacts: [{ parts: [{ kind: 'text', text: '6観点で5件の指摘 (WC-106 等)' }] }] },
      });
    }) as unknown as typeof fetch;

    const res = await a2aInvoke('https://orch.example/', 'Refinement お願い', { fetchImpl: fakeFetch, messageId: 'm1' });
    expect(res.ok).toBe(true);
    expect(res.text).toBe('6観点で5件の指摘 (WC-106 等)');
    expect(capturedUrl).toBe('https://orch.example/'); // 末尾スラッシュ正規化
    expect(capturedBody.method).toBe('message/send');
    const params = capturedBody.params as { message: { parts: Array<{ text: string }>; messageId: string } };
    expect(params.message.parts[0]!.text).toBe('Refinement お願い');
    expect(params.message.messageId).toBe('m1');
  });

  it('非2xx は throw せず ok:false', async () => {
    const fakeFetch = (async () => jsonResponse({ error: 'boom' }, { ok: false, status: 503 })) as unknown as typeof fetch;
    const res = await a2aInvoke('https://orch.example', 'x', { fetchImpl: fakeFetch });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('503');
  });

  it('JSON-RPC error は ok:false', async () => {
    const fakeFetch = (async () =>
      jsonResponse({ jsonrpc: '2.0', id: '1', error: { message: 'agent failed' } })) as unknown as typeof fetch;
    const res = await a2aInvoke('https://orch.example', 'x', { fetchImpl: fakeFetch });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('agent failed');
  });

  it('fetch 例外 (不達) も throw せず ok:false (退避路の前提)', async () => {
    const fakeFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const res = await a2aInvoke('https://orch.example', 'x', { fetchImpl: fakeFetch });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ECONNREFUSED');
  });
});
