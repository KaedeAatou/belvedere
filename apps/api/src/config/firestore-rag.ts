// SEARCH_BACKEND=firestore の配線 (GCP ネイティブ RAG / 2026-06-25)。
//
// packages/tools の FirestoreKnowledgeSearcher は firebase-admin 非依存を保つため embed/nearest を
// 注入で受ける。その実体 (Gemini 埋め込み + Firestore findNearest) をここ apps/api 側 (SDK がある所) で
// 構成する。コーパスは scripts/index-knowledge.ts で `belvedere-kb-scrum` に投入済み前提。
//
// 前提: firebase-admin は repo (REPO_BACKEND=firestore) 側で initializeApp 済み。getFirestore() は遅延呼出。

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GeminiLLMProvider } from '@belvedere/llm';
import type { EmbedQueryFn, VectorNearestFn, KnowledgeHit } from '@belvedere/tools';

const KB_COLLECTION = 'belvedere-kb-scrum';
// 埋め込みは投入時 (index-knowledge.ts) と同じモデル・同じ次元を使うこと (一致しないと検索が壊れる)。
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768; // Firestore Vector 上限 2048 内 / 投入側と一致必須

/**
 * createKnowledgeSearcher('firestore', cfg) に渡す { embed, nearest } を構成する。
 * - embed: クエリを RETRIEVAL_QUERY で埋め込む (投入は RETRIEVAL_DOCUMENT / 出し分けで品質向上)。
 * - nearest: Firestore findNearest (COSINE) で近傍 topK を引く。score は 1-distance (高いほど近い)。
 * GEMINI_API_KEY 未設定なら throw (signpost / silent fallback しない)。
 */
export function buildFirestoreRagConfig(): { embed: EmbedQueryFn; nearest: VectorNearestFn } {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('[knowledge:firestore] GEMINI_API_KEY が未設定です (クエリ埋め込みに必要 / SEARCH_BACKEND=firestore)。');
  }
  const llm = new GeminiLLMProvider({ apiKey });

  const embed: EmbedQueryFn = (q) =>
    llm.embedText(q, { model: EMBED_MODEL, taskType: 'RETRIEVAL_QUERY', outputDimensionality: EMBED_DIM });

  const nearest: VectorNearestFn = async (queryEmbedding, opts) => {
    const db = getFirestore();
    // belvedere-kb-scrum は全社共通 Scrum 知識ベース (テナント横断で同じ。tenant Try RAG は将来拡張)。
    const snap = await db
      .collection(KB_COLLECTION)
      .findNearest({
        vectorField: 'embedding',
        queryVector: FieldValue.vector(queryEmbedding),
        limit: opts.topK,
        distanceMeasure: 'COSINE',
        distanceResultField: '_distance',
      })
      .get();
    return snap.docs.map((d): KnowledgeHit => {
      const data = d.data();
      const distance = typeof data._distance === 'number' ? data._distance : 1;
      return {
        sourceId: typeof data.sourceId === 'string' ? data.sourceId : d.id,
        title: typeof data.title === 'string' ? data.title : '',
        text: typeof data.text === 'string' ? data.text : '',
        score: 1 - distance, // COSINE distance(0=同一) → score(高いほど近い / Elastic _score と整合)
      };
    });
  };

  return { embed, nearest };
}
