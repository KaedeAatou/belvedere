// RAG コレクション名と doc 整形 (SDK 非依存 / 2026-06-25)。
//
// index-tries.ts (投入) と firestore-rag.ts (検索) が同じ collection 名・同じ sourceId 規約を
// 共有することで「投入先と検索先がズレて永遠にヒットしない」古典バグを構造的に防ぐ。
// firebase-admin を import しないので純粋関数として決定的に単体テストできる。

import type { RetroTry } from '@belvedere/shared';
import type { KnowledgeHit } from '@belvedere/tools';

/** 全社共通 Scrum 知識ベース (テナント横断で同じ)。index-knowledge.ts が投入。 */
export const KB_COLLECTION = 'belvedere-kb-scrum';

/** テナント別「過去 Try」コーパスの prefix。Elastic 側 (knowledge.ts triesIndexPrefix) と同名規約。 */
export const TRIES_COLLECTION_PREFIX = 'belvedere-kb-tries-';

/** workspaceId から Try コーパスの collection 名を作る (投入 ↔ 検索で共有)。 */
export function triesCollectionFor(workspaceId: string): string {
  return `${TRIES_COLLECTION_PREFIX}${workspaceId}`;
}

export interface TryKbDoc {
  /** 投入先 collection (テナント別)。 */
  collection: string;
  /** Firestore doc id (sourceId をサニタイズ)。 */
  docId: string;
  /** 引用 ID。Agent は回答根拠としてこれを引用する (`retro-try:<id>`)。 */
  sourceId: string;
  title: string;
  /** 埋め込み対象テキスト。ふりかえり/Try 系クエリにヒットしやすいよう Sprint 番号・状態を文脈に含める。 */
  text: string;
}

/**
 * 過去 Try (RetroTry) を RAG コーパス doc に整形する。
 * sourceId は引用要件のため `retro-try:<id>`、text は意味検索の再現性のため Sprint 番号と
 * 達成状態を文脈として含める。AI 挙動は変えず「検索可能なデータ」を用意するだけ。
 */
export function tryToKbDoc(t: RetroTry): TryKbDoc {
  const sourceId = `retro-try:${t.id}`;
  return {
    collection: triesCollectionFor(t.workspaceId),
    docId: sourceId.replace(/[/#.:]/g, '_').slice(0, 1400),
    sourceId,
    title: `前スプリントのふりかえり Try (Sprint ${t.sprintNumber})`,
    text: `# 前スプリントのふりかえり Try\n## Sprint ${t.sprintNumber}\n${t.text}\n(状態: ${t.done ? '完了済み' : '継続中・未完了'})`,
  };
}

/**
 * 複数の近傍検索結果リストを score 降順でマージし topK を返す
 * (Firestore の KB + テナント別 Try collection の統合 / Elastic の複数 index マージ相当)。
 */
export function mergeHitsTopK(lists: KnowledgeHit[][], topK: number): KnowledgeHit[] {
  return lists
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}
