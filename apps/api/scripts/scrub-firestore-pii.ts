// Firestore ランタイムデータの PII スクラブ (2026-07-07 / git 履歴スクラブの対 / dry-run 既定)。
//
// 背景: git 履歴の実名/個人メアドは filter-repo で置換したが、Firestore のランタイムデータ
// (member doc / チケットの assignee / retro note の author 等) には旧 userId・実名・個人メアドが残る。
// 審査員デモ (ws-belvedere) の UI に member 表示名等として露出しうるため、同じ置換を DB にも適用する。
//
// 使い方 (個人 GCP プロジェクトのみ):
//   GCP_PROJECT=belvedere-dev-atrium pnpm --filter @belvedere/api exec tsx scripts/scrub-firestore-pii.ts          # dry-run
//   GCP_PROJECT=belvedere-dev-atrium pnpm --filter @belvedere/api exec tsx scripts/scrub-firestore-pii.ts --apply  # 書込
//
// 設計:
//   - 置換は git スクラブと同一セット (旧 userId → kaede / 実名 → Kaede / 個人メアド → owner@example.com)。
//   - 各 doc を JSON 文字列化 → 置換 → 変化があれば parse して set (このリポジトリの repo 層は
//     ISO 文字列日付のみで Timestamp を保存しないため JSON round-trip 安全)。
//   - members コレクションだけ doc id が `${workspaceId}:${userId}` 複合のため、userId が変わる doc は
//     新 id で set + 旧 doc delete (それ以外のコレクションは in-place set)。
//   - 置換後 id が既存 doc と衝突する場合 (seed 再投入済みの kaede member 等) は旧 doc の削除のみ行う。

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_PATTERN = /^belvedere-(dev|prod)-atrium$/;

// git スクラブ (filter-repo) と同一の置換セット。順序: メアド完全形 → 裸ユーザー名 → 実名。
const REPLACEMENTS: Array<[string | RegExp, string]> = [
  ['owner@example.com', 'owner@example.com'],
  ['owner', 'owner'],
  ['kaede', 'kaede'],
  ['Kaede', 'Kaede'],
  ['Kaede', 'Kaede'],
];

const COLLECTIONS = [
  'workspaces', 'tickets', 'sprints', 'projects', 'epics', 'stories', 'members',
  'apiKeys', 'ceremonies', 'agentRuns', 'ceremonyHealth', 'estimationSessions',
  'retroTries', 'retroNotes',
];

function applyReplacements(s: string): string {
  let out = s;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from as string).join(to);
  }
  return out;
}

async function main(): Promise<void> {
  const project = process.env.GCP_PROJECT ?? '';
  if (!PROJECT_PATTERN.test(project)) {
    throw new Error(`GCP_PROJECT に belvedere-dev-atrium / belvedere-prod-atrium を明示してください。現在: ${project || '(未設定)'}`);
  }
  const apply = process.argv.includes('--apply');
  initializeApp({ credential: applicationDefault(), projectId: project });
  const db = getFirestore();

  console.log(`▶ PII scrub (project=${project}, mode=${apply ? 'APPLY' : 'dry-run'})`);
  let totalChanged = 0;

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    let changed = 0;
    for (const doc of snap.docs) {
      const before = JSON.stringify(doc.data());
      const after = applyReplacements(before);
      const idAfter = applyReplacements(doc.id);
      if (before === after && idAfter === doc.id) continue;
      changed++;
      const summary = `${col}/${doc.id}${idAfter !== doc.id ? ` → ${idAfter}` : ''}`;
      if (!apply) {
        console.log(`  [dry] would fix ${summary}`);
        continue;
      }
      const data = JSON.parse(after) as Record<string, unknown>;
      if (idAfter !== doc.id) {
        // 複合 id (members の `${workspaceId}:${userId}` 等) に旧 userId が含まれるケース:
        // 新 id に置き直して旧 doc を消す。新 id が既存 (seed 再投入済) なら旧 doc の削除のみ。
        const target = db.collection(col).doc(idAfter);
        const exists = (await target.get()).exists;
        if (!exists) await target.set(data);
        await doc.ref.delete();
        console.log(`  ✓ ${exists ? 'deleted (target 既存)' : 'moved'} ${summary}`);
      } else {
        await doc.ref.set(data);
        console.log(`  ✓ fixed ${summary}`);
      }
    }
    if (changed > 0) console.log(`  ${col}: ${changed} 件${apply ? ' 適用' : ' (dry-run)'}`);
    totalChanged += changed;
  }

  console.log(`✅ done. 対象 ${totalChanged} 件${apply ? ' を適用' : ' (--apply で書込)'}`);
}

main().catch((e) => {
  console.error('❌ scrub failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
