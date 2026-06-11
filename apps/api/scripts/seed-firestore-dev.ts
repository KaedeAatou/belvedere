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
import type { RetroTry } from '@belvedere/shared';

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

  for (const s of seedSprints) await repo.sprints.upsert(s);
  console.log(`  ✓ sprints: ${seedSprints.length}`);

  for (const m of seedMembers) await repo.members.upsert(m);
  console.log(`  ✓ members: ${seedMembers.length}`);

  for (const e of seedEpics) await repo.epics.upsert(e);
  console.log(`  ✓ epics:   ${seedEpics.length}`);

  for (const t of seedTickets) await repo.tickets.upsert(t);
  console.log(`  ✓ tickets: ${seedTickets.length}`);

  for (const r of seedRetroTries) await repo.retroTries.upsert(r);
  console.log(`  ✓ retroTries: ${seedRetroTries.length}`);

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
