// Firestore seed 投入スクリプト (Phase 1-B / 2026-06-09)。
// immutable demo fixture (1 project / 4 epics / 12 tickets / 3 sprints / 5 members) を
// フラットコレクションへ投入する。set なので冪等 (再実行で上書き)。
//
// 実行: GCP_PROJECT=belvedere-dev-atrium pnpm --filter @belvedere/repo seed:firestore
// 認証: 事前に `gcloud auth application-default login` (ADC) が必要。
//
// 注意: stories / ceremonies / agentRuns / ceremonyHealth は seed を持たないため空スタート
// (memory backend と同じ挙動)。

import { Firestore } from '@google-cloud/firestore';
import {
  seedTickets,
  seedSprints,
  seedProjects,
  seedEpics,
  seedMembers,
} from '@belvedere/seed';

async function main(): Promise<void> {
  const projectId = process.env.GCP_PROJECT;
  const db = new Firestore({
    ...(projectId ? { projectId } : {}),
    ignoreUndefinedProperties: true,
  });

  const batch = db.batch();
  for (const t of seedTickets) batch.set(db.collection('tickets').doc(t.id), t);
  for (const s of seedSprints) batch.set(db.collection('sprints').doc(s.id), s);
  for (const p of seedProjects) batch.set(db.collection('projects').doc(p.id), p);
  for (const e of seedEpics) batch.set(db.collection('epics').doc(e.id), e);
  // members の doc id は userId (memory.ts と揃える)
  for (const m of seedMembers) batch.set(db.collection('members').doc(m.userId), m);

  await batch.commit();

  console.log(
    `✅ Firestore seeded (project=${projectId ?? '(ADC default)'}): ` +
      `tickets=${seedTickets.length} sprints=${seedSprints.length} ` +
      `projects=${seedProjects.length} epics=${seedEpics.length} members=${seedMembers.length}`,
  );
}

main().catch((e) => {
  console.error('❌ seed-firestore failed:', e);
  process.exit(1);
});
