// Scrum 知識ベース (references/agile-knowledge-base/*.md) を Gemini 埋め込みでベクトル化し、
// Firestore の `belvedere-kb-scrum` コレクションに投入する一回限り(再実行は冪等 upsert)のスクリプト。
// GCP ネイティブ RAG (FirestoreKnowledgeSearcher / SEARCH_BACKEND=firestore) のコーパス点火用 (2026-06-25)。
//
// なぜ Firestore Vector か: GCP クレジットで無料・無期限・本物の意味検索 (Elastic 14日トライアル期限切れを回避)。
// Firestore は findNearest (ベクトル KNN) をネイティブ対応。埋め込みは Gemini text-embedding-004 (768次元)。
//
// 使い方:
//   # 1) dry-run (既定): チャンク数と sourceId を print するだけ。埋め込みも書込もしない。
//   GCP_PROJECT=belvedere-dev-atrium GEMINI_API_KEY=... \
//     pnpm --filter @belvedere/api exec tsx scripts/index-knowledge.ts
//   # 2) --apply: 実際に埋め込み生成 + Firestore 投入。
//   GCP_PROJECT=belvedere-dev-atrium GEMINI_API_KEY=... \
//     pnpm --filter @belvedere/api exec tsx scripts/index-knowledge.ts --apply
//
// 冪等: doc id = sourceId のサニタイズ。再実行で上書き。安全則 (project ガード / dry-run 既定) は migrate-roles.ts と同じ。

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GeminiLLMProvider } from '@belvedere/llm';

const PROJECT_PATTERN = /^belvedere-(dev|prod)-atrium$/;
const KB_COLLECTION = 'belvedere-kb-scrum';
// generativelanguage で利用可能なのが gemini-embedding 系のみ。既定 3072 次元を Firestore Vector 上限
// (2048) 内に収めるため 768 次元に切り詰める (COSINE 検索なので正規化不要)。投入と検索で同次元必須。
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;

// コーパス場所: repo ルートの references/agile-knowledge-base/ (このファイルから ../../../references)
const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, '..', '..', '..', 'references', 'agile-knowledge-base');

interface Chunk {
  sourceId: string; // 例: refinement.md#3-belvedere-refinement-agent-6-観点との対応
  title: string;
  text: string;
  source: string; // ファイル名
}

/** 見出しを doc id / sourceId に使えるよう slug 化 (日本語は残す / 空白→ハイフン / 記号除去)。 */
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_#>[\]()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[/.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 1 つの .md を `## ` (レベル2見出し) 単位でチャンク化する。各チャンクにファイルの `# ` タイトルを文脈として付ける。 */
function chunkMarkdown(file: string, content: string): Chunk[] {
  const lines = content.split('\n');
  const fileTitle = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, '').trim() ?? basename(file, '.md');

  // `## ` の行で区切る。最初の `## ` より前 (前文) は file タイトルのチャンクにまとめる。
  const chunks: Chunk[] = [];
  let curHeading = fileTitle;
  let curBody: string[] = [];
  const flush = (): void => {
    const body = curBody.join('\n').trim();
    if (body.length === 0) return;
    const sourceId = `${file}#${slugify(curHeading)}`;
    chunks.push({
      sourceId,
      title: `${fileTitle} — ${curHeading}`,
      text: `# ${fileTitle}\n## ${curHeading}\n${body}`,
      source: file,
    });
  };
  for (const line of lines) {
    const m = /^##\s+(.+)/.exec(line);
    if (m) {
      flush();
      curHeading = m[1]!.trim();
      curBody = [];
    } else {
      curBody.push(line);
    }
  }
  flush();
  return chunks;
}

function loadCorpus(): Chunk[] {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.md'));
  const chunks: Chunk[] = [];
  for (const f of files) {
    const content = readFileSync(join(CORPUS_DIR, f), 'utf8');
    chunks.push(...chunkMarkdown(f, content));
  }
  return chunks;
}

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
  const chunks = loadCorpus();
  console.log(`▶ index-knowledge (${apply ? 'APPLY' : 'DRY-RUN'}) project=${project} model=${EMBED_MODEL}`);
  console.log(`▶ コーパス: ${chunks.length} チャンク (${CORPUS_DIR})`);
  for (const c of chunks) console.log(`  - ${c.sourceId} (${c.text.length} 文字)`);

  if (!apply) {
    console.log('ℹ DRY-RUN でした。埋め込み生成も Firestore 投入もしていません。--apply で点火してください。');
    return;
  }

  if (getApps().length === 0) initializeApp({ projectId: project });
  const db = getFirestore();
  const col = db.collection(KB_COLLECTION);
  const llm = new GeminiLLMProvider({ apiKey });

  let written = 0;
  for (const c of chunks) {
    // 投入は RETRIEVAL_DOCUMENT (検索時のクエリは RETRIEVAL_QUERY) で出し分けると検索品質が上がる。
    const embedding = await llm.embedText(c.text, {
      model: EMBED_MODEL,
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBED_DIM,
    });
    const docId = c.sourceId.replace(/[/#.]/g, '_').slice(0, 1400);
    await col.doc(docId).set({
      sourceId: c.sourceId,
      title: c.title,
      text: c.text,
      source: c.source,
      embedding: FieldValue.vector(embedding),
      updatedAt: new Date().toISOString(),
    });
    written += 1;
    console.log(`  ✓ ${c.sourceId} (dim=${embedding.length})`);
  }
  console.log(`✅ done. ${written} チャンクを ${KB_COLLECTION} に投入。`);
  console.log(`ℹ 次: Firestore ベクトルインデックスを作成し (gcloud firestore indexes composite create / vectorConfig),`);
  console.log(`  SEARCH_BACKEND=firestore を api デプロイに設定すると /health knowledge=firestore になります。`);
}

main().catch((e) => {
  console.error('❌ index-knowledge failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
