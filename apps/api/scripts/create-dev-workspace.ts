// Belvedere 自身の開発タスクを管理する専用 Workspace を作る一回限りのスクリプト (2026-06-12)。
//
// 背景: 当たり前品質 epic の残 TODO 4 件が「監査レポートと memory にしか無く、
// Belvedere 自身では管理されていない」状態だった (バックログ管理ツールなのに自分の
// バックログを管理していない矛盾)。ROADMAP Phase 1-D ドッグフードの最初の一歩として、
// demo の ws-belvedere とは別の開発専用 Workspace を作り、残 TODO を実チケット化する。
//
// 使い方 (個人 GCP プロジェクトのみ):
//   GCP_PROJECT=belvedere-dev-atrium REPO_BACKEND=firestore \
//     pnpm --filter @belvedere/api exec tsx scripts/create-dev-workspace.ts
//
// 安全性:
//   - 完全に additive (新 Workspace / Member / Ticket を upsert するだけ。既存 ws-belvedere
//     には一切触れない)。stable id 指定の upsert なので再実行で冪等。
//   - owner UID は既存 ws-belvedere の member から email 一致で解決する (ハードコードしない)。
//     = 本人が一度ログイン済みであることが前提 (email-allowlist bootstrap 済み)。

import { createRepoContainer } from '@belvedere/repo';
import type { Epic, Member, Ticket, Workspace } from '@belvedere/shared';

const TARGET_PROJECT = 'belvedere-dev-atrium';
const SOURCE_WS = 'ws-belvedere';        // owner UID をここから引く
const OWNER_EMAIL = 'owner@example.com';
const NEW_WS = 'ws-belvedere-dev';
const NOW = '2026-06-12T00:00:00+09:00';
// story は親 Epic 必須 (案A)。新 ws 専用 Epic を 1 件用意し 4 story を紐付ける
// (ws-belvedere の EP-1..4 は別 workspace なので流用しない — workspace 実在チェックと整合させる)。
const DEV_EPIC_ID = 'EP-dev-1';

function assertGuards(): void {
  if (process.env.REPO_BACKEND !== 'firestore') {
    throw new Error('REPO_BACKEND=firestore を指定してください');
  }
  if (process.env.GCP_PROJECT !== TARGET_PROJECT) {
    throw new Error(`GCP_PROJECT=${TARGET_PROJECT} を明示してください。現在: ${process.env.GCP_PROJECT ?? '(未設定)'}`);
  }
}

// 残 TODO 4 件を未見積もり (NO SP) のバックログ Story として起票する。
// 見積もり (SP) は Refinement / ポーカーで付ける前提なので、あえて空にしておく。
const devBacklog: Array<Pick<Ticket, 'id' | 'title' | 'description' | 'priority' | 'valueImpact' | 'type' | 'acceptanceCriteria'>> = [
  {
    id: 'WC-dev-1',
    title: 'Sprint Goal の SMART 評価を動的化する',
    description: 'Planning の SMART チェック (S/M/A/R/T) が固定値ハードコード。ゴール文を解析して動的に判定し、Measurable 欠落時などに Planner Agent が具体的な追記を提案できるようにする。',
    priority: 'medium',
    valueImpact: 'high',
    type: 'story',
    acceptanceCriteria: ['ゴール文を変更すると SMART 判定が変わる', 'Measurable が弱い時に AI が測定可能な指標を提案する'],
  },
  {
    id: 'WC-dev-2',
    title: '完了スプリントの振り返り画面 (過去スプリント閲覧)',
    description: '現状は active スプリントしか見られない。完了した過去スプリントのボード / velocity 実績を閲覧して「検査と適応」ができるようにする。',
    priority: 'medium',
    valueImpact: 'medium',
    type: 'story',
    acceptanceCriteria: ['スプリントを選択して過去のボードを表示できる', '完了スプリントの velocity 実績が見える'],
  },
  {
    id: 'WC-dev-3',
    title: 'チケットを Epic / Story に紐付ける UI',
    description: '紐付け API はあるが画面操作がない。戦略整合性 (Epic.rationale) のデモを画面で完結させ、チケットから親 Epic の Why を辿れるようにする。',
    priority: 'low',
    valueImpact: 'high',
    type: 'story',
    acceptanceCriteria: ['バックログでチケットを Epic に紐付けできる', 'チケットから親 Epic の rationale を 1 クリックで辿れる'],
  },
  {
    id: 'WC-dev-4',
    title: 'Retro の KPT ノート追加と投票',
    description: 'Keep/Problem/Try が demo データ固定。ノート追加と投票を実装してレトロを実運用できるようにする。※ Try の carry-forward 積み上げとは別機能。',
    priority: 'low',
    valueImpact: 'medium',
    type: 'story',
    acceptanceCriteria: ['KPT 各列にノートを追加できる', 'ノートに投票して票数で並び替わる'],
  },
];

async function main(): Promise<void> {
  assertGuards();
  const repo = await createRepoContainer('firestore');

  // 1. owner UID を既存 ws-belvedere の member から解決
  const sourceMembers = await repo.members.list({ workspaceId: SOURCE_WS });
  const owner = sourceMembers.find((m) => m.email === OWNER_EMAIL);
  if (!owner) {
    throw new Error(`${SOURCE_WS} に ${OWNER_EMAIL} の member が見つかりません (一度ログイン済みか確認してください)`);
  }
  console.log(`▶ owner 解決: ${owner.email} → userId=${owner.userId}`);

  // 2. Workspace
  const ws: Workspace = {
    id: NEW_WS,
    name: 'Belvedere 開発',
    slug: 'belvedere-dev',
    productGoal: 'Belvedere 自身を Scrum で開発し、ツールとしての実用性をドッグフードで証明する',
    ownerId: owner.userId,
    createdAt: NOW,
  };
  await repo.workspaces.upsert(ws);
  console.log(`  ✓ workspace: ${ws.id} (${ws.name})`);

  // 3. owner Member (新 ws に owner として bind)
  const member: Member = {
    userId: owner.userId,
    workspaceId: NEW_WS,
    displayName: owner.displayName,
    email: owner.email,
    role: 'owner',
  };
  await repo.members.upsert(member);
  console.log(`  ✓ member: ${member.displayName} (owner)`);

  // 4. 親 Epic (story は親 Epic 必須 / 案A)
  const epic: Epic = {
    id: DEV_EPIC_ID,
    workspaceId: NEW_WS,
    name: 'Belvedere 開発バックログ',
    status: 'active',
    createdAt: NOW,
  };
  await repo.epics.upsert(epic);
  console.log(`  ✓ epic: ${epic.id} (${epic.name})`);

  // 5. バックログ Story 4 件 (DEV_EPIC_ID に紐付け)
  for (const b of devBacklog) {
    const t: Ticket = {
      id: b.id,
      workspaceId: NEW_WS,
      title: b.title,
      description: b.description,
      status: 'backlog',
      priority: b.priority,
      valueImpact: b.valueImpact,
      type: b.type,
      epicId: DEV_EPIC_ID,
      acceptanceCriteria: b.acceptanceCriteria,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'human',
    };
    await repo.tickets.upsert(t);
    console.log(`  ✓ ticket: ${t.id} — ${t.title}`);
  }

  const tickets = await repo.tickets.list({ workspaceId: NEW_WS });
  console.log(`✅ done. ${NEW_WS} now has: ${tickets.length} tickets / owner=${owner.email}`);
  console.log('   UI: 右上の Workspace 切替で「Belvedere 開発」を選ぶと表示されます。');
}

main().catch((e) => {
  console.error('❌ failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
