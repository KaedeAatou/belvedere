// ws-dogfood のチケット id をランダム (WC-<hex>) から連番 (WC-1, WC-2, …) へ移行する
// 一回限りのスクリプト (WC-6d01e4b2)。覚えやすい番号にするための破壊的マイグレーション。
//
// 背景: Firestore は doc id を改名できないため「新 id で作成 → 旧 doc 削除」で置換する。
// チケット→チケット参照 (parentTicketId / blockedBy / relatedIncidentId) は old→new に張り替える。
// epicId(EP-) / sprintId(SPRINT-) / comments.authorId は別名前空間なので触らない。
//
// 使い方 (個人 GCP プロジェクトのみ / 会社アカウント禁止):
//   gcloud auth application-default login   # 未設定なら
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/renumber-dogfood-tickets.ts [--apply]
//
//   既定は dry-run (マッピングを表示するだけ)。--apply で実書き込み。
//
// 安全性:
//   - WORKSPACE は ws-dogfood 固定。ws-belvedere (immutable seed WC-101..112) は絶対に触らない。
//   - --apply 前に全チケットを backup JSON (scripts/.backup-dogfood-tickets-<ts>.json) へ書き出す。
//   - createdAt 昇順で WC-1..N を割り当てる (作成順 = 直感的な番号)。
//   - 現状 ws-dogfood は全て非数値 id (WC-<hex>) なので WC-1..N の新 doc は既存と衝突しない。

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepoContainer } from '@belvedere/repo';
import type { Ticket } from '@belvedere/shared';

const PROJECT_PATTERN = /^belvedere-dev-atrium$/; // prod は対象外 (dogfood は dev のみ)
const WORKSPACE = 'ws-dogfood';

function assertGuards(): void {
  if (process.env.REPO_BACKEND !== 'firestore') {
    throw new Error('REPO_BACKEND=firestore を指定してください');
  }
  if (!PROJECT_PATTERN.test(process.env.GCP_PROJECT ?? '')) {
    throw new Error(`GCP_PROJECT=belvedere-dev-atrium を明示してください (現在: ${process.env.GCP_PROJECT ?? '(未設定)'})`);
  }
}

/** チケット→チケット参照を old→new に張り替えた新チケットを返す。 */
function remap(t: Ticket, map: Map<string, string>): Ticket {
  const next: Ticket = { ...t, id: map.get(t.id) ?? t.id };
  if (t.parentTicketId && map.has(t.parentTicketId)) next.parentTicketId = map.get(t.parentTicketId)!;
  if (t.relatedIncidentId && map.has(t.relatedIncidentId)) next.relatedIncidentId = map.get(t.relatedIncidentId)!;
  if (t.blockedBy && t.blockedBy.length > 0) next.blockedBy = t.blockedBy.map((b) => map.get(b) ?? b);
  return next;
}

async function main(): Promise<void> {
  assertGuards();
  const apply = process.argv.includes('--apply');
  const repo = await createRepoContainer('firestore');

  const tickets = await repo.tickets.list({ workspaceId: WORKSPACE });
  // createdAt 昇順 (同時刻は id で安定ソート)。
  tickets.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));

  const map = new Map<string, string>();
  tickets.forEach((t, i) => map.set(t.id, `WC-${i + 1}`));

  console.log(`▶ ${apply ? 'APPLY' : 'DRY-RUN'} renumber (workspace=${WORKSPACE}, ${tickets.length} tickets)`);
  for (const t of tickets) {
    const changed = map.get(t.id) !== t.id ? '' : ' (no change)';
    console.log(`  ${t.id.padEnd(14)} → ${map.get(t.id)!.padEnd(6)} ${t.title.slice(0, 40)}${changed}`);
  }

  if (!apply) {
    console.log('\n(dry-run。--apply で実行します)');
    return;
  }

  // backup は repo 外 (OS tmp) に置き、誤コミットを防ぐ。
  const backupPath = join(tmpdir(), `belvedere-dogfood-tickets-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(tickets, null, 2), 'utf8');
  console.log(`\n▶ backup: ${backupPath}`);

  // 1) 新 id の doc を全て作成 (参照張替済)。現状 old は全て非数値なので WC-1..N と衝突しない。
  for (const t of tickets) {
    await repo.tickets.upsert(remap(t, map));
  }
  // 2) 旧 doc を削除 (id が変わったものだけ)。
  for (const t of tickets) {
    if (map.get(t.id) !== t.id) await repo.tickets.delete(t.id);
  }
  console.log(`✔ renumber 完了: ${tickets.length} 件を WC-1..${tickets.length} に移行しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
