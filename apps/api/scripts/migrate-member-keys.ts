// members コレクションの doc id を userId 単独 → 複合キー `${workspaceId}:${userId}` へ
// 再キーする一回限りの移行スクリプト (2026-06-12)。
//
// 背景: Member の doc id 複合キー化 (マルチテナント修正) に伴い、既存 Firestore の
// 旧 doc (id=userId) は新コードの get(workspaceId, userId) で読めなくなる。本スクリプトで
// 全 member doc を複合 id へ再キーし、あわせて dev workspace 作成時に上書きで失われた
// ws-belvedere の owner 所属を復元する。
//
// 使い方 (新コードのデプロイ完了後に実行):
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/migrate-member-keys.ts
//
// 冪等: 既に複合 id の doc は skip。再実行しても安全。

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TARGET_PROJECT = 'belvedere-dev-atrium';
const OWNER_EMAIL = 'owner@example.com';
const RESTORE_WS = 'ws-belvedere';

function assertGuards(): void {
  if (process.env.GCP_PROJECT !== TARGET_PROJECT) {
    throw new Error(`GCP_PROJECT=${TARGET_PROJECT} を明示してください。現在: ${process.env.GCP_PROJECT ?? '(未設定)'}`);
  }
}

async function main(): Promise<void> {
  assertGuards();
  if (getApps().length === 0) initializeApp({ projectId: TARGET_PROJECT });
  const db = getFirestore();
  const col = db.collection('members');

  // 1. 全 member doc を複合 id へ再キー (旧 id != 複合 id のものだけ)。
  const snap = await col.get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const workspaceId = String(data.workspaceId ?? '');
    const userId = String(data.userId ?? '');
    if (!workspaceId || !userId) {
      console.warn(`  ⚠ skip (workspaceId/userId 欠落): ${doc.id}`);
      continue;
    }
    const composite = `${workspaceId}:${userId}`;
    if (doc.id === composite) continue; // 既に移行済み
    await col.doc(composite).set(data);
    await col.doc(doc.id).delete();
    console.log(`  re-key ${doc.id} -> ${composite}`);
    migrated += 1;
  }
  console.log(`▶ 再キー: ${migrated} 件`);

  // 2. 失われた ws-belvedere owner 所属を復元 (上書きで消えた分)。
  const mine = await col.where('email', '==', OWNER_EMAIL).get();
  const template = mine.docs
    .map((d) => d.data())
    .find((d) => d.userId && !String(d.userId).startsWith('invite:'));
  if (!template) {
    console.warn(`  ⚠ ${OWNER_EMAIL} の member が見つからず、復元をスキップ`);
  } else {
    const uid = String(template.userId);
    const hasBelvedere = mine.docs.some((d) => d.data().workspaceId === RESTORE_WS);
    if (hasBelvedere) {
      console.log(`  ✓ ${RESTORE_WS} 所属は既に存在 (復元不要)`);
    } else {
      const restored = {
        userId: uid,
        workspaceId: RESTORE_WS,
        displayName: template.displayName ?? 'Kaede',
        email: template.email ?? OWNER_EMAIL,
        role: 'owner',
      };
      await col.doc(`${RESTORE_WS}:${uid}`).set(restored);
      console.log(`  ✓ ${RESTORE_WS} owner 所属を復元 (userId=${uid})`);
    }
  }

  // 3. 結果サマリ
  const finalMine = await col.where('email', '==', OWNER_EMAIL).get();
  const wsList = finalMine.docs.map((d) => d.data().workspaceId);
  console.log(`✅ done. ${OWNER_EMAIL} の所属: [${wsList.join(', ')}]`);
}

main().catch((e) => {
  console.error('❌ migration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
