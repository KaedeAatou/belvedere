// members コレクションの role を新権限モデル (admin/po/sm/dev) へ移行する一回限りのスクリプト
// (権限再設計 2026-06-23 / Phase 4)。
//
// 背景: Phase 1 で正準 role を admin/po/sm/dev に変えた。実行時は middleware の normalizeRole が
// 旧 owner→admin / guest→dev を読み替えるので「提出版は normalize で機能正しい」。本スクリプトは
// その読み替えを Firestore の永続値そのものに焼き込み、最終的に zod enum を ['admin','po','sm','dev']
// へ締められる状態にするためのもの。**本番実行と enum 締めは提出後** (.claude plan の確定判断3)。
//
// マッピング (normalizeRole の legacy 規則 + デモの明示昇格):
//   - role 'owner' → 'admin'   (旧作成者 = 全権)
//   - role 'guest' → 'dev'     (最小権限)
//   - email demo@belvedere.demo → 'admin' (旧 dev / 審査員が全 5 儀式を体験できるように)
//   - 既に正準 (admin/po/sm/dev) は変更しない (冪等)。
//
// 使い方:
//   # 1) dry-run (既定): 変更対象を print するだけ。書き込まない。
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/migrate-roles.ts
//   # 2) 目視で確認したら --apply で実書き込み。
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/migrate-roles.ts --apply
//
// 冪等: 既に目標 role の doc は skip。再実行しても安全。

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 個人参加要件の擬似ドメインのみ。会社識別子は絶対に書かない。
const DEMO_EMAIL = 'demo@belvedere.demo';
const OWNER_EMAIL = 'owner@example.com';
const MCP_EMAIL = 'mcp@belvedere.svc';

const PROJECT_PATTERN = /^belvedere-(dev|prod)-atrium$/;

function assertGuards(): { project: string; apply: boolean } {
  const project = process.env.GCP_PROJECT ?? '';
  if (!PROJECT_PATTERN.test(project)) {
    throw new Error(
      `GCP_PROJECT に belvedere-dev-atrium / belvedere-prod-atrium を明示してください。現在: ${project || '(未設定)'}`,
    );
  }
  // 既定は dry-run。実書き込みは --apply を明示したときだけ (取り返しのつく安全側)。
  const apply = process.argv.includes('--apply');
  return { project, apply };
}

/**
 * 永続 role + email から「移行後の正準 role」を返す。変更不要なら null。
 * normalizeRole の legacy 規則 (owner→admin / guest→dev) と一致させ、demo のみ明示昇格する。
 */
function targetRole(role: string, email: string): 'admin' | 'po' | 'sm' | 'dev' | null {
  if (email === DEMO_EMAIL && role !== 'admin') return 'admin';
  if (role === 'owner') return 'admin';
  if (role === 'guest') return 'dev';
  return null; // 既に正準 (admin/po/sm/dev) / 未知値は触らない
}

async function main(): Promise<void> {
  const { project, apply } = assertGuards();
  if (getApps().length === 0) initializeApp({ projectId: project });
  const db = getFirestore();
  const col = db.collection('members');

  console.log(`▶ migrate-roles (${apply ? 'APPLY' : 'DRY-RUN'}) project=${project}`);

  const snap = await col.get();
  let planned = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const role = String(data.role ?? '');
    const email = String(data.email ?? '');
    const next = targetRole(role, email);
    if (!next) continue; // 変更不要 (冪等)
    planned += 1;
    console.log(`  ${apply ? 'apply ' : 'plan  '} ${doc.id}: role '${role}' -> '${next}' (${email || 'no-email'})`);
    if (apply) {
      await col.doc(doc.id).update({ role: next });
    }
  }
  console.log(`▶ ${apply ? '書き込み' : '対象 (dry-run / 未書込)'}: ${planned} 件`);

  // 期待される最終状態を検証 (kaede=admin / demo=admin / mcp=po)。
  // dry-run でも「現状」を表示し、apply 後は焼き込み結果を確認できる。
  console.log('▶ 検証 (期待: 本人=admin / demo=admin / mcp=po):');
  for (const [label, email, expected] of [
    ['本人', OWNER_EMAIL, 'admin'],
    ['デモ', DEMO_EMAIL, 'admin'],
    ['MCP', MCP_EMAIL, 'po'],
  ] as const) {
    const found = await col.where('email', '==', email).get();
    const roles = found.docs.map((d) => String(d.data().role));
    const ok = roles.length > 0 && roles.every((r) => r === expected);
    console.log(`  ${ok ? '✓' : '·'} ${label} ${email}: [${roles.join(', ') || '(該当なし)'}] (期待 ${expected})`);
  }

  if (!apply) {
    console.log('ℹ DRY-RUN でした。問題なければ --apply を付けて再実行してください。');
  }
  console.log('✅ done.');
}

main().catch((e) => {
  console.error('❌ migration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
