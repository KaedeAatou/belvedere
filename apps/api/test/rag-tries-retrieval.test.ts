// 過去 Try の RAG 検索 = 継続的改善ループ (まわす軸) の「データ層」テスト (2026-06-25)。
//
// 狙い: 既存 AI (mock/prompt は不変) が knowledge.search で過去 Try を引けることを、searcher +
// コーパスのレベルで決定的に検証する。AI の出力挙動はテストしない (mock 不変 / 実言及は実 Gemini)。
// ここで固めるのは「seed Try → コーパス → 検索で sourceId 付きヒット / 捏造なし / 無関係は空」。

import { describe, it, expect } from 'vitest';
import { MockKnowledgeSearcher } from '@belvedere/tools';
import { seedRetroTries } from '@belvedere/seed';
import { tryToKbDoc } from '../src/config/rag-collections';

// seed の過去 Try を RAG コーパスに見立てる (本番は Firestore Vector / これは決定的な代替)。
const corpus = seedRetroTries.map((t) => {
  const d = tryToKbDoc(t);
  return { sourceId: d.sourceId, title: d.title, text: d.text };
});
const validSourceIds = new Set(corpus.map((d) => d.sourceId));

describe('過去 Try の RAG 検索', () => {
  it('retro クエリ「ベロシティ 超えない 計画」で S12 の Try を sourceId 付きで返す', async () => {
    const s = new MockKnowledgeSearcher(corpus);
    const hits = await s.search('ベロシティ 超えない 計画 詰め込み ストーリーポイント', { workspaceId: 'ws-belvedere' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.sourceId === 'retro-try:try-seed-s12-ac')).toBe(true);
  });

  it('捏造防止: 返る sourceId は必ずコーパスに実在する', async () => {
    const s = new MockKnowledgeSearcher(corpus);
    const hits = await s.search('Try BLOCKED 理由 ベロシティ 計画 ふりかえり', { workspaceId: 'ws-belvedere' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => validSourceIds.has(h.sourceId))).toBe(true);
  });

  it('無関係クエリは空 = 前回 Try が無ければ言及しない (捏造回避)', async () => {
    const s = new MockKnowledgeSearcher(corpus);
    expect(await s.search('xyzzy 全く無関係なクエリ', { workspaceId: 'ws-belvedere' })).toEqual([]);
  });
});
