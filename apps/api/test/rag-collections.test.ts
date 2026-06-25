// RAG コレクション名・doc 整形・マージの純粋関数テスト (2026-06-25)。
// index-tries.ts (投入) と firestore-rag.ts (検索) が共有する seam を、firebase-admin 非依存で
// 決定的に固める (投入先と検索先の名前ズレ / sourceId 捏造 / マージ順の退化を防ぐ)。

import { describe, it, expect } from 'vitest';
import {
  triesCollectionFor,
  tryToKbDoc,
  mergeHitsTopK,
  TRIES_COLLECTION_PREFIX,
} from '../src/config/rag-collections';
import { seedRetroTries } from '@belvedere/seed';
import type { KnowledgeHit } from '@belvedere/tools';

describe('triesCollectionFor', () => {
  it('workspaceId から belvedere-kb-tries-{ws} を作る', () => {
    expect(triesCollectionFor('ws-belvedere')).toBe(`${TRIES_COLLECTION_PREFIX}ws-belvedere`);
    expect(triesCollectionFor('ws-belvedere')).toBe('belvedere-kb-tries-ws-belvedere');
  });
});

describe('tryToKbDoc', () => {
  it('RetroTry を sourceId=retro-try:<id> / Sprint 文脈付き text に整形する', () => {
    const t = seedRetroTries.find((x) => x.id === 'try-seed-s12-ac');
    expect(t).toBeDefined();
    if (!t) return;
    const d = tryToKbDoc(t);
    expect(d.sourceId).toBe('retro-try:try-seed-s12-ac');
    expect(d.collection).toBe('belvedere-kb-tries-ws-belvedere');
    expect(d.docId).not.toMatch(/[/#.:]/); // サニタイズ済 (Firestore doc id に使える)
    expect(d.text).toContain('Sprint 12');
    expect(d.text).toContain(t.text); // 原文を保持 = 検索で本文一致
    expect(d.title).toContain('Sprint 12');
  });

  it('全 seed Try が一意な docId / sourceId を持つ (上書き衝突しない)', () => {
    const docs = seedRetroTries.map(tryToKbDoc);
    expect(docs.length).toBeGreaterThan(0);
    expect(new Set(docs.map((d) => d.docId)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => d.sourceId)).size).toBe(docs.length);
    // sourceId は必ず retro-try: で始まる (引用規約 / 捏造判定の基準)
    expect(docs.every((d) => d.sourceId.startsWith('retro-try:'))).toBe(true);
  });
});

describe('mergeHitsTopK', () => {
  const h = (sourceId: string, score: number): KnowledgeHit => ({ sourceId, title: '', text: '', score });

  it('KB と Try を score 降順でマージし topK で切る', () => {
    const kb = [h('kb-a', 0.9), h('kb-b', 0.5)];
    const tries = [h('try-x', 0.95), h('try-y', 0.2)];
    const merged = mergeHitsTopK([kb, tries], 3);
    expect(merged.map((x) => x.sourceId)).toEqual(['try-x', 'kb-a', 'kb-b']);
  });

  it('退化入力: topK=0 / 空リストは空配列', () => {
    expect(mergeHitsTopK([[h('a', 1)]], 0)).toEqual([]);
    expect(mergeHitsTopK([[], []], 3)).toEqual([]);
    expect(mergeHitsTopK([], 3)).toEqual([]);
  });
});
