// 過去 Try (seedRetroTries) を Gemini 埋め込みでベクトル化し、Firestore の
// `belvedere-kb-tries-{workspaceId}` コレクションに投入するスクリプト (2026-06-25)。
//
// 目的: Retrospective の「前スプリントの Try に AI が言及する」継続的改善ループ (まわす軸) を
// RAG (SEARCH_BACKEND=firestore / FirestoreKnowledgeSearcher) の意味検索で本物として成立させる。
// AI 挙動・prompt・mock は変えず、knowledge.search が引ける「検索可能データ」を用意するだけ。
//
// 使い方 (index-knowledge.ts と同じ安全則 / project ガード / dry-run 既定):
//   # 1) dry-run (既定): collection / sourceId を print するだけ。埋め込みも書込もしない。
//   GCP_PROJECT=belvedere-dev-atrium GEMINI_API_KEY=... \
//     pnpm --filter @belvedere/api exec tsx scripts/index-tries.ts
//   # 2) --apply: 実際に埋め込み生成 + Firestore 投入。
//   GCP_PROJECT=belvedere-dev-atrium GEMINI_API_KEY=... \
//     pnpm --filter @belvedere/api exec tsx scripts/index-tries.ts --apply
//
// 冪等: doc id = sourceId のサニタイズ。再実行で上書き。
// 投入後: 各 belvedere-kb-tries-* に Firestore ベクトル index を作成 (KB と同様 / 768 次元)。

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GeminiLLMProvider } from '@belvedere/llm';
import { seedRetroTries } from '@belvedere/seed';
import { tryToKbDoc } from '../src/config/rag-collections';

const PROJECT_PATTERN = /^belvedere-(dev|prod)-atrium$/;
// 投入と検索で同モデル・同次元必須 (firestore-rag.ts と一致)。
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;

function assertGuards(): { project: string; apply: boolean; apiKey: string } {
  const project = process.env.GCP_PROJECT ?? '';
  if (!PROJECT_PATTERN.test(project)) {
    throw new Error(`GCP_PROJECT に belvedere-dev-atrium / belvedere-prod-atrium を明示してください。現在: ${project || '(未設定)'}`);
  }
  const apply = process.argv.includes('--apply');
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (apply && !apiKey) {
    throw new Error('--apply には GEMINI_API_KEY (埋め込み生成用) が必要です。.env を source してください。');
  }
  return { project, apply, apiKey };
}

async function main(): Promise<void> {
  const { project, apply, apiKey } = assertGuards();
  const docs = seedRetroTries.map(tryToKbDoc);
  console.log(`▶ index-tries (${apply ? 'APPLY' : 'DRY-RUN'}) project=${project} model=${EMBED_MODEL}`);
  console.log(`▶ 過去 Try: ${docs.length} 件`);
  for (const d of docs) console.log(`  - ${d.sourceId} → ${d.collection} (${d.text.length} 文字)`);

  if (!apply) {
    console.log('ℹ DRY-RUN でした。埋め込み生成も Firestore 投入もしていません。--apply で点火してください。');
    return;
  }

  if (getApps().length === 0) initializeApp({ projectId: project });
  const db = getFirestore();
  const llm = new GeminiLLMProvider({ apiKey });

  let written = 0;
  for (const d of docs) {
    // 投入は RETRIEVAL_DOCUMENT (検索時のクエリは RETRIEVAL_QUERY) で出し分け。
    const embedding = await llm.embedText(d.text, {
      model: EMBED_MODEL,
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBED_DIM,
    });
    await db.collection(d.collection).doc(d.docId).set({
      sourceId: d.sourceId,
      title: d.title,
      text: d.text,
      embedding: FieldValue.vector(embedding),
      updatedAt: new Date().toISOString(),
    });
    written += 1;
    console.log(`  ✓ ${d.sourceId} → ${d.collection} (dim=${embedding.length})`);
  }
  console.log(`✅ done. ${written} 件の過去 Try を投入。`);
  console.log('ℹ 次: 各 belvedere-kb-tries-* に Firestore ベクトルインデックスを作成し (768次元 / flat),');
  console.log('  SEARCH_BACKEND=firestore で knowledge.search が KB + Try をマージ検索する。');
}

main().catch((e) => {
  console.error('❌ index-tries failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
