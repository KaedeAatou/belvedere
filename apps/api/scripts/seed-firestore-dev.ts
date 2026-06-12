// dev Firestore に seed fixture を投入する一回限りのスクリプト (2026-06-11)。
//
// 背景: deployed API は REPO_BACKEND=firestore だが、seed (WC tickets/sprints/members) は
// memory backend 専用 fixture のため Firestore には入っていない。このため ws-belvedere の
// 儀式画面が空になる。本スクリプトで seed を Firestore に upsert し、デモが実データで埋まるようにする。
//
// 使い方 (個人 GCP プロジェクトのみ / 会社アカウント禁止):
//   gcloud auth application-default login   # 未設定なら
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/seed-firestore-dev.ts [--clean]
//
//   --clean: e2e で蓄積した汚染チケット (title が [E2E] / E2E Failure / 🤖 のもの) も削除する。
//
// 安全性:
//   - upsert は id 指定の set なので冪等 (再実行で重複しない)。seed id は WC-101..112 /
//     sprint-12..14 / member userId なので、ランダム id の e2e チケットと衝突しない。
//   - API と同一の createRepoContainer('firestore') を使うため schema が必ず一致する。

import { createRepoContainer } from '@belvedere/repo';
import { seedTickets, seedSprints, seedMembers, seedEpics } from '@belvedere/seed';
import type { RetroTry, RetroNote } from '@belvedere/shared';

const TARGET_PROJECT = 'belvedere-dev-atrium';
const WORKSPACE = 'ws-belvedere';

// Retro Try 積み上げ (carry-forward stack) の初期 fixture。過去スプリント由来の継続改善アクション。
// seed package は immutable fixture のため、dev 専用のこのスクリプトに直接定義する。
const seedRetroTries: RetroTry[] = [
  {
    id: 'try-s11-review-24h',
    workspaceId: WORKSPACE,
    text: 'PR レビューは依頼から 24h 以内に着手する。',
    sprintNumber: 11,
    done: true,
    createdAt: '2026-04-21T10:00:00+09:00',
    createdBy: 'kaede',
  },
  {
    id: 'try-s12-daily-blocked',
    workspaceId: WORKSPACE,
    text: 'デイリーで前日の停滞チケットを必ず 1 件共有する。',
    sprintNumber: 12,
    done: false,
    createdAt: '2026-05-05T10:00:00+09:00',
    createdBy: 'uehara',
  },
];

// Retro KPT ボードのノート初期 fixture (Sprint 13 のレトロ)。レトロを実データで開催できる状態にする。
// 旧 RetroScreen にハードコードされていた demo テキストを流用 (各列 2-3 件)。votes は実 member userId。
const RETRO_SPRINT = 13;
const seedRetroNotes: RetroNote[] = [
  // Keep
  { id: 'note-k1', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'keep', text: '新機能リリース後、社内利用が +60% 増えた。導線として効いている。', authorId: 'kaede', votes: ['kaede', 'okubo', 'uehara', 'hirai', 'hayashi'], createdAt: '2026-05-18T10:00:00+09:00', createdBy: 'kaede' },
  { id: 'note-k2', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'keep', text: 'AI形骸化チェックがプランニングで2件のスコープ漏れを事前に拾った。', authorId: 'uehara', votes: ['kaede', 'okubo', 'uehara', 'hirai'], createdAt: '2026-05-18T10:01:00+09:00', createdBy: 'uehara' },
  { id: 'note-k3', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'keep', text: 'ペアレビューを REVIEW 列で実施したのは良かった。', authorId: 'okubo', votes: ['okubo', 'hayashi'], createdAt: '2026-05-18T10:02:00+09:00', createdBy: 'okubo' },
  // Problem
  { id: 'note-p1', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'problem', text: 'Spike が長期 DOING に留まった。タイムボックスが弱い。', authorId: 'hirai', votes: ['kaede', 'okubo', 'uehara', 'hirai', 'hayashi'], createdAt: '2026-05-18T10:03:00+09:00', createdBy: 'hirai' },
  { id: 'note-p2', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'problem', text: 'BLOCKED チケットの理由が空のまま2日経過していた。', authorId: 'uehara', votes: ['uehara', 'hirai', 'hayashi'], createdAt: '2026-05-18T10:04:00+09:00', createdBy: 'uehara' },
  { id: 'note-p3', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'problem', text: 'ゴールのMが弱く、レビュー時に判定が割れた。', authorId: 'kaede', votes: ['kaede', 'okubo', 'uehara'], createdAt: '2026-05-18T10:05:00+09:00', createdBy: 'kaede' },
  { id: 'note-p4', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'problem', text: '週後半の更新頻度が落ちた（金曜の更新 0件）。', authorId: 'hayashi', votes: ['hayashi'], createdAt: '2026-05-18T10:06:00+09:00', createdBy: 'hayashi' },
  // Try (この列のノートは積み上げへ昇格できる)
  { id: 'note-t1', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'try', text: 'Spikeに 1.5日のハードタイムボックス、超過時は自動でレトロ議題に。', authorId: 'okubo', votes: ['kaede', 'okubo', 'uehara', 'hirai', 'hayashi'], createdAt: '2026-05-18T10:07:00+09:00', createdBy: 'okubo' },
  { id: 'note-t2', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'try', text: 'BLOCKED に遷移したら理由必須にする（Belvedere AIで強制）。', authorId: 'uehara', votes: ['kaede', 'uehara', 'hirai', 'hayashi'], createdAt: '2026-05-18T10:08:00+09:00', createdBy: 'uehara' },
  { id: 'note-t3', workspaceId: WORKSPACE, sprintNumber: RETRO_SPRINT, column: 'try', text: '金曜午前に "micro-daily" を実施し更新を促す。', authorId: 'hayashi', votes: ['okubo', 'hayashi'], createdAt: '2026-05-18T10:09:00+09:00', createdBy: 'hayashi' },
];

function assertGuards(): void {
  if (process.env.REPO_BACKEND !== 'firestore') {
    throw new Error('REPO_BACKEND=firestore を指定してください (memory に書いても意味がありません)');
  }
  if (process.env.GCP_PROJECT !== TARGET_PROJECT) {
    throw new Error(`GCP_PROJECT=${TARGET_PROJECT} を明示してください (誤プロジェクト書込み防止)。現在: ${process.env.GCP_PROJECT ?? '(未設定)'}`);
  }
}

function isPollution(title: string): boolean {
  return title.includes('[E2E]') || title.includes('E2E Failure') || title.startsWith('🤖');
}

async function main(): Promise<void> {
  assertGuards();
  const clean = process.argv.includes('--clean');
  const repo = await createRepoContainer('firestore');

  console.log(`▶ seeding Firestore (project=${TARGET_PROJECT}, workspace=${WORKSPACE})`);

  // seed の sprint 日付は 2026-04〜05 固定で、今(数週間後)では active スプリントが終了済に
  // 見え Daily の Burndown / 滞留日数が壊れる。active スプリントが「今」を含むよう全 sprint と
  // ticket.startedAt を一律 shift する (active の開始を 5 日前に置く = day5/14 の現実的な途中)。
  // Date.now() は tsx Node スクリプトなので使用可。再実行で常に再センタリングされる。
  const DAY = 86_400_000;
  const active = seedSprints.find((s) => s.status === 'active');
  const offset = active ? Date.now() - 5 * DAY - Date.parse(active.startsAt) : 0;
  const shiftIso = (iso: string) => new Date(Date.parse(iso) + offset).toISOString();
  const shiftedSprints = seedSprints.map((s) => ({ ...s, startsAt: shiftIso(s.startsAt), endsAt: shiftIso(s.endsAt) }));
  const shiftedTickets = seedTickets.map((t) => (t.startedAt !== undefined ? { ...t, startedAt: shiftIso(t.startedAt) } : t));

  for (const s of shiftedSprints) await repo.sprints.upsert(s);
  console.log(`  ✓ sprints: ${shiftedSprints.length} (active を今基準に shift)`);

  for (const m of seedMembers) await repo.members.upsert(m);
  console.log(`  ✓ members: ${seedMembers.length}`);

  for (const e of seedEpics) await repo.epics.upsert(e);
  console.log(`  ✓ epics:   ${seedEpics.length}`);

  for (const t of shiftedTickets) await repo.tickets.upsert(t);
  console.log(`  ✓ tickets: ${shiftedTickets.length}`);

  for (const r of seedRetroTries) await repo.retroTries.upsert(r);
  console.log(`  ✓ retroTries: ${seedRetroTries.length}`);

  for (const n of seedRetroNotes) await repo.retroNotes.upsert(n);
  console.log(`  ✓ retroNotes: ${seedRetroNotes.length}`);

  if (clean) {
    const all = await repo.tickets.list({ workspaceId: WORKSPACE });
    const seedIds = new Set(seedTickets.map((t) => t.id));
    const pollution = all.filter((t) => !seedIds.has(t.id) && isPollution(t.title));
    console.log(`▶ cleaning e2e pollution: ${pollution.length} 件`);
    for (const t of pollution) {
      await repo.tickets.delete(t.id);
      console.log(`  ✗ deleted ${t.id} — ${t.title.slice(0, 40)}`);
    }
  }

  const finalTickets = await repo.tickets.list({ workspaceId: WORKSPACE });
  const finalSprints = await repo.sprints.list({ workspaceId: WORKSPACE });
  const finalMembers = await repo.members.list({ workspaceId: WORKSPACE });
  console.log(`✅ done. ws-belvedere now has: ${finalTickets.length} tickets / ${finalSprints.length} sprints / ${finalMembers.length} members`);
}

main().catch((e) => {
  console.error('❌ seed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
