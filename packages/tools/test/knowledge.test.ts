import { describe, it, expect } from 'vitest';
import {
  MockKnowledgeSearcher,
  ElasticKnowledgeSearcher,
  createKnowledgeSearcher,
  type MockKnowledgeDoc,
} from '../src/knowledge';

const DOCS: MockKnowledgeDoc[] = [
  {
    sourceId: 'definition-of-done.md#完了の定義',
    title: 'Definition of Done',
    text: 'DoD は完了の共通理解。テスト・レビュー・ドキュメントを含む。',
  },
  {
    sourceId: 'story-points.md#相対見積もり',
    title: 'Story Points',
    text: 'ストーリーポイントは相対見積もり。velocity と比較する。',
  },
  {
    sourceId: 'refinement.md#過剰計画',
    title: 'Refinement',
    text: '過剰計画は velocity を超える計画。SP の積み上げを velocity と比較する。',
  },
];

describe('MockKnowledgeSearcher', () => {
  it('キーワード一致をスコア順 (多く一致した doc が先頭) で返す', async () => {
    const s = new MockKnowledgeSearcher(DOCS);
    const hits = await s.search('velocity 過剰計画', { workspaceId: 'ws-x' });
    // refinement は velocity + 過剰計画 の両方一致 (score 2) で先頭
    expect(hits[0]?.sourceId).toBe('refinement.md#過剰計画');
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it('一致なしは空配列', async () => {
    const s = new MockKnowledgeSearcher(DOCS);
    expect(await s.search('xyzzy', { workspaceId: 'ws-x' })).toEqual([]);
  });

  it('topK で件数を絞る', async () => {
    const s = new MockKnowledgeSearcher(DOCS);
    const hits = await s.search('velocity テスト 見積もり', { workspaceId: 'ws-x', topK: 1 });
    expect(hits.length).toBe(1);
  });
});

describe('ElasticKnowledgeSearcher', () => {
  it('URL / APIキー未設定で constructor が throw (signpost)', () => {
    expect(() => new ElasticKnowledgeSearcher({ url: '', apiKey: '' })).toThrow(/未設定/);
    expect(() => new ElasticKnowledgeSearcher({ url: 'https://es', apiKey: '' })).toThrow(/未設定/);
  });

  it('semantic query を組み index にテナントを付け ApiKey ヘッダで叩き hits を parse する', async () => {
    let capturedUrl = '';
    let capturedInit: { method: string; headers: Record<string, string>; body: string } | null = null;
    const fakeFetch = (async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          hits: {
            hits: [
              {
                _id: 'a',
                _score: 1.5,
                _source: {
                  sourceId: 'definition-of-done.md#完了の定義',
                  title: 'Definition of Done',
                  content: 'DoD は完了の共通理解。',
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const s = new ElasticKnowledgeSearcher({
      url: 'https://es.example/',
      apiKey: 'KEY123',
      fetchImpl: fakeFetch,
    });
    const hits = await s.search('DoD とは', { workspaceId: 'ws-belvedere', topK: 5 });

    // index は「全社 KB + テナント別 Try」固定 (encodeURIComponent で , → %2C)
    expect(capturedUrl).toContain('belvedere-kb-scrum%2Cbelvedere-kb-tries-ws-belvedere');
    expect(capturedUrl).toContain('ignore_unavailable=true');
    const init = capturedInit as unknown as { headers: Record<string, string>; body: string };
    expect(init.headers.authorization).toBe('ApiKey KEY123');
    const body = JSON.parse(init.body) as {
      size: number;
      query: { semantic: { field: string; query: string } };
    };
    expect(body.size).toBe(5);
    expect(body.query.semantic.field).toBe('content');
    expect(body.query.semantic.query).toBe('DoD とは');

    expect(hits).toEqual([
      {
        sourceId: 'definition-of-done.md#完了の定義',
        title: 'Definition of Done',
        text: 'DoD は完了の共通理解。',
        score: 1.5,
      },
    ]);
  });

  it('非 ok レスポンスで throw する', async () => {
    const fakeFetch = (async () =>
      new Response('boom', { status: 500, statusText: 'Internal Server Error' })) as unknown as typeof fetch;
    const s = new ElasticKnowledgeSearcher({ url: 'https://es.example', apiKey: 'K', fetchImpl: fakeFetch });
    await expect(s.search('x', { workspaceId: 'ws' })).rejects.toThrow(/500/);
  });
});

describe('createKnowledgeSearcher', () => {
  it('none / undefined / 空文字 は undefined (knowledge.search を出さない)', () => {
    expect(createKnowledgeSearcher('none')).toBeUndefined();
    expect(createKnowledgeSearcher(undefined)).toBeUndefined();
    expect(createKnowledgeSearcher('')).toBeUndefined();
  });

  it('mock は MockKnowledgeSearcher', () => {
    const s = createKnowledgeSearcher('mock', { mockDocs: DOCS });
    expect(s?.name).toBe('mock');
  });

  it('elastic は config 不足なら throw (signpost)', () => {
    expect(() => createKnowledgeSearcher('elastic', {})).toThrow(/未設定/);
  });

  it('未知の backend は throw', () => {
    expect(() => createKnowledgeSearcher('opensearch')).toThrow(/unknown backend/);
  });
});
