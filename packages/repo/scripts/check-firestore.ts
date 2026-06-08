// Firestore 読み出し検証スクリプト (Phase 1-B / 2026-06-09)。
// factory 経由 (createRepoContainer('firestore')) で読み、async 化 + 動的 import の経路も検証する。
//
// 実行: GCP_PROJECT=belvedere-dev-atrium pnpm --filter @belvedere/repo exec tsx scripts/check-firestore.ts
// 認証: ADC (gcloud auth application-default login) 済みであること。

import { createRepoContainer } from '../src/factory';

async function main(): Promise<void> {
  const repo = await createRepoContainer('firestore');

  const [projects, epics, tickets, members, sprints] = await Promise.all([
    repo.projects.list(),
    repo.epics.list(),
    repo.tickets.list(),
    repo.members.list(),
    repo.sprints.list(),
  ]);

  console.log('--- 件数 (list) ---');
  console.log(`projects=${projects.length} epics=${epics.length} tickets=${tickets.length} members=${members.length} sprints=${sprints.length}`);

  // get 検証 (doc id 引き)
  const first = tickets[0];
  if (first) {
    const got = await repo.tickets.get(first.id);
    console.log(`--- get(${first.id}) → ${got ? 'OK' : 'MISS'} ---`);
  }

  // where 検証 (equality フィルタ)
  const retro = await repo.tickets.list({ ritual: 'retrospective' });
  console.log(`--- where ritual=retrospective → ${retro.length}件 ---`);

  // Refinement 第6観点のデモ前提: rationale 欠落 Epic (EP-3 が該当のはず)
  const missing = epics.filter((e) => !e.rationale || e.rationale.trim() === '').map((e) => e.id);
  console.log(`--- rationale 欠落 Epic: ${missing.join(', ') || '(なし)'} ---`);

  console.log('\n✅ Firestore 読み出し検証 完了');
}

main().catch((e) => {
  console.error('❌ check-firestore failed:', e);
  process.exit(1);
});
