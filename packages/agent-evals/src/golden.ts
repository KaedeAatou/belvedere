// agent-evals: ルールエンジン品質ゲートの golden データ (「まわす = 後退させない」の本体)。
//
// 目的: prompts.ts / ticket-rules.ts / refinement.ts を変えたとき「拾うべき指摘を
// 拾えているか」を CI で固定し、AI の判断品質が静かに劣化するのを止める。
// 単体テスト (packages/tools/test/ticket-rules.test.ts) が「ルール単位の fire/not-fire」を
// 見るのに対し、こちらは「現実的なチケットの束 → 期待される指摘」をシナリオで採点する。
//
// 規律 (.claude/rules/testing.md): immutable seed (WC-101.. / EP-1..) は触らず eval 専用の
// 合成チケットで組む。退化入力 (空 AC / 親なし / 未設定 type / 空集合) を必ず含める。

import type { Ticket, Ritual, Sprint } from '@belvedere/shared';

/** 停滞判定などで使う固定 now (Date.now() を呼ばない = 決定的)。 */
export const EVAL_NOW = '2026-06-20T09:00:00.000Z';

export interface ExpectedFinding {
  ruleId: string;
  ticketId: string;
}

export interface EvalCase {
  name: string;
  ceremony: Ritual;
  tickets: Ticket[];
  /** aggregate ルール (SPRINT_OVER_VELOCITY) 用の sprint 群。省略時は []。 */
  sprints?: Sprint[];
  /** この finding が出ているべき (検出漏れ = 品質後退)。 */
  expect: ExpectedFinding[];
  /** この finding は出ていてはいけない (誤検出ガード)。 */
  mustNotFire?: ExpectedFinding[];
}

/**
 * 必須フィールドを埋めた合成 Ticket。optional は exactOptionalPropertyTypes のため
 * undefined を渡さず「省略」する (= over に含めないことで未設定を表現)。
 */
function tk(over: Partial<Ticket> & { id: string }): Ticket {
  return {
    workspaceId: 'ws-eval',
    title: 'eval ticket',
    status: 'backlog',
    priority: 'medium',
    createdAt: EVAL_NOW,
    updatedAt: EVAL_NOW,
    createdBy: 'human',
    ...over,
  };
}

/** 必須フィールドを埋めた合成 Sprint。velocity は completed sprint で over に渡す。 */
function sp(over: Partial<Sprint> & { id: string; status: Sprint['status'] }): Sprint {
  return {
    workspaceId: 'ws-eval',
    number: 1,
    startsAt: EVAL_NOW,
    endsAt: EVAL_NOW,
    goal: '',
    capacity: 0,
    ...over,
  };
}

export const goldenCases: EvalCase[] = [
  {
    name: 'story-DoD欠落 (acceptanceCriteria 空)',
    ceremony: 'refinement',
    tickets: [
      tk({
        id: 'EVAL-DOD',
        type: 'story',
        title: '決済結果をユーザーに通知する',
        estimatePt: 5,
        acceptanceCriteria: [],
      }),
    ],
    expect: [{ ruleId: 'STORY_DOD_MISSING', ticketId: 'EVAL-DOD' }],
    // SP は設定済なので SP 欠落は誤検出してはいけない
    mustNotFire: [{ ruleId: 'STORY_SP_MISSING', ticketId: 'EVAL-DOD' }],
  },
  {
    name: 'story-SP未設定 (estimatePt 省略)',
    ceremony: 'refinement',
    tickets: [
      tk({
        id: 'EVAL-SP',
        type: 'story',
        title: '通知設定画面を追加する',
        acceptanceCriteria: ['ユーザーが通知ON/OFFを切り替えられる'],
      }),
    ],
    expect: [{ ruleId: 'STORY_SP_MISSING', ticketId: 'EVAL-SP' }],
    // AC はあるので DoD 欠落は誤検出してはいけない
    mustNotFire: [{ ruleId: 'STORY_DOD_MISSING', ticketId: 'EVAL-SP' }],
  },
  {
    name: 'task-親Storyなし',
    ceremony: 'refinement',
    tickets: [tk({ id: 'EVAL-TASK', type: 'task', title: 'Cloud Run のメモリを 512Mi に上げる' })],
    expect: [{ ruleId: 'TASK_NO_PARENT', ticketId: 'EVAL-TASK' }],
  },
  {
    name: 'task-親Storyあり (誤検出ガード)',
    ceremony: 'refinement',
    tickets: [
      tk({
        id: 'EVAL-STORY-P',
        type: 'story',
        title: '決済通知 Story',
        estimatePt: 3,
        acceptanceCriteria: ['通知が届くことを確認できる'],
      }),
      tk({ id: 'EVAL-TASK-OK', type: 'task', title: '通知テンプレを実装', parentTicketId: 'EVAL-STORY-P' }),
    ],
    expect: [],
    mustNotFire: [{ ruleId: 'TASK_NO_PARENT', ticketId: 'EVAL-TASK-OK' }],
  },
  {
    name: 'bug-再現手順なし',
    ceremony: 'refinement',
    tickets: [
      tk({ id: 'EVAL-BUG', type: 'bug', title: '決済が稀に失敗する', description: '本番で時々エラーになる' }),
    ],
    expect: [{ ruleId: 'BUG_NO_REPRO', ticketId: 'EVAL-BUG' }],
  },
  {
    name: 'type未設定',
    ceremony: 'refinement',
    tickets: [tk({ id: 'EVAL-NOTYPE', title: 'なにかのチケット' })],
    expect: [{ ruleId: 'TYPE_MISSING', ticketId: 'EVAL-NOTYPE' }],
  },
  {
    name: 'story-3日以上停滞 (daily)',
    ceremony: 'daily',
    tickets: [
      tk({
        id: 'EVAL-STALL',
        type: 'story',
        title: '請求書PDF生成',
        status: 'in-progress',
        startedAt: '2026-06-16T09:00:00.000Z',
        estimatePt: 5,
        acceptanceCriteria: ['PDFが出力される'],
      }),
    ],
    expect: [{ ruleId: 'STORY_STALL', ticketId: 'EVAL-STALL' }],
  },
  {
    name: '退化-空チケット集合 (クラッシュしない)',
    ceremony: 'refinement',
    tickets: [],
    expect: [],
  },

  // ===== 強化ケース (2026-06-20): unit test が拾わない「境界・相互作用・検出完全性」を狙う =====

  {
    // eval 固有の価値: ルール単体でなく「現実的な混在バックログで取りこぼしなく全部拾えるか」を採点する。
    name: '現実的な混在バックログ (検出完全性 — 4 指摘を取りこぼさず・健全チケットは誤検出しない)',
    ceremony: 'refinement',
    tickets: [
      tk({ id: 'MIX-STORY-BAD', type: 'story', title: '決済履歴をエクスポートする', acceptanceCriteria: [] }), // DoD 空 + SP 無 → 2 指摘
      tk({ id: 'MIX-TASK', type: 'task', title: 'CSV 生成ユーティリティ' }), // 親 Story なし
      tk({ id: 'MIX-BUG', type: 'bug', title: 'エクスポートが文字化け', description: '日本語が壊れる' }), // 再現手順なし
      tk({ id: 'MIX-CLEAN', type: 'story', title: '通知設定を保存する', estimatePt: 3, acceptanceCriteria: ['設定が永続化され再読込で保持される'] }), // 健全
    ],
    expect: [
      { ruleId: 'STORY_DOD_MISSING', ticketId: 'MIX-STORY-BAD' },
      { ruleId: 'STORY_SP_MISSING', ticketId: 'MIX-STORY-BAD' },
      { ruleId: 'TASK_NO_PARENT', ticketId: 'MIX-TASK' },
      { ruleId: 'BUG_NO_REPRO', ticketId: 'MIX-BUG' },
    ],
    mustNotFire: [
      { ruleId: 'STORY_DOD_MISSING', ticketId: 'MIX-CLEAN' },
      { ruleId: 'STORY_SP_MISSING', ticketId: 'MIX-CLEAN' },
    ],
  },
  {
    // bug catcher: STORY_SP_MISSING は `estimatePt == null`。`!estimatePt` に変えると SP=0 で誤発火する。
    name: 'SP=0 コーナー (estimatePt==0 は SP 欠落で誤検出しない)',
    ceremony: 'refinement',
    tickets: [
      tk({ id: 'SP-ZERO', type: 'story', title: '設定の no-op 化', estimatePt: 0, acceptanceCriteria: ['挙動が変わらないことを確認できる'] }),
    ],
    expect: [],
    mustNotFire: [
      { ruleId: 'STORY_SP_MISSING', ticketId: 'SP-ZERO' },
      { ruleId: 'STORY_DOD_MISSING', ticketId: 'SP-ZERO' },
    ],
  },
  {
    // bug catcher: type 未設定だと appliesTo 型一致で STORY 系ルールに当たらない (TYPE_MISSING のみ)。
    name: '型未設定 × DoD空 (appliesTo 型ガード: TYPE_MISSING だけ出て STORY 系は当たらない)',
    ceremony: 'refinement',
    tickets: [tk({ id: 'NOTYPE-NODOD', title: '種別未設定で AC も空のチケット', acceptanceCriteria: [] })],
    expect: [{ ruleId: 'TYPE_MISSING', ticketId: 'NOTYPE-NODOD' }],
    mustNotFire: [
      { ruleId: 'STORY_DOD_MISSING', ticketId: 'NOTYPE-NODOD' },
      { ruleId: 'STORY_SP_MISSING', ticketId: 'NOTYPE-NODOD' },
    ],
  },
  {
    // bug catcher: 儀式フィルタ。daily に refinement ルールを混ぜたら壊れる。
    name: '儀式フィルタ抑制 (daily では refinement ルール STORY_DOD_MISSING/SP_MISSING が出ない)',
    ceremony: 'daily',
    tickets: [tk({ id: 'FILTER-STORY', type: 'story', title: 'DoD も SP も無いが daily では指摘しない', status: 'todo', acceptanceCriteria: [] })],
    expect: [],
    mustNotFire: [
      { ruleId: 'STORY_DOD_MISSING', ticketId: 'FILTER-STORY' },
      { ruleId: 'STORY_SP_MISSING', ticketId: 'FILTER-STORY' },
    ],
  },
  {
    name: 'SPRINT_OVER_VELOCITY 発火 (計画 SP 21 > 平均 velocity 20)',
    ceremony: 'planning',
    sprints: [sp({ id: 'SP-DONE', status: 'completed', velocity: 20 }), sp({ id: 'SP-ACT', status: 'active' })],
    tickets: [tk({ id: 'OVER-1', type: 'story', sprintId: 'SP-ACT', estimatePt: 21, acceptanceCriteria: ['完了条件あり'] })],
    expect: [{ ruleId: 'SPRINT_OVER_VELOCITY', ticketId: 'SP-ACT' }],
  },
  {
    // bug catcher: 過剰計画は `sum > avg` (厳密 >)。`>=` にすると計画==velocity で誤発火する。
    name: 'SPRINT_OVER_VELOCITY 厳密境界 (計画 SP 20 == 平均 velocity 20 は発火しない)',
    ceremony: 'planning',
    sprints: [sp({ id: 'SP-DONE2', status: 'completed', velocity: 20 }), sp({ id: 'SP-ACT2', status: 'active' })],
    tickets: [tk({ id: 'EQ-1', type: 'story', sprintId: 'SP-ACT2', estimatePt: 20, acceptanceCriteria: ['完了条件あり'] })],
    expect: [],
    mustNotFire: [{ ruleId: 'SPRINT_OVER_VELOCITY', ticketId: 'SP-ACT2' }],
  },
];
