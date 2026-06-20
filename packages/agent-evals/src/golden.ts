// agent-evals: ルールエンジン品質ゲートの golden データ (「まわす = 後退させない」の本体)。
//
// 目的: prompts.ts / ticket-rules.ts / refinement.ts を変えたとき「拾うべき指摘を
// 拾えているか」を CI で固定し、AI の判断品質が静かに劣化するのを止める。
// 単体テスト (packages/tools/test/ticket-rules.test.ts) が「ルール単位の fire/not-fire」を
// 見るのに対し、こちらは「現実的なチケットの束 → 期待される指摘」をシナリオで採点する。
//
// 規律 (.claude/rules/testing.md): immutable seed (WC-101.. / EP-1..) は触らず eval 専用の
// 合成チケットで組む。退化入力 (空 AC / 親なし / 未設定 type / 空集合) を必ず含める。

import type { Ticket, Ritual } from '@belvedere/shared';

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
    name: 'spike-タイムボックスなし',
    ceremony: 'refinement',
    tickets: [
      tk({
        id: 'EVAL-SPIKE',
        type: 'spike',
        title: 'ベクトル検索の比較検証',
        acceptanceCriteria: ['どのエンジンを採用するか結論を出す'],
      }),
    ],
    expect: [{ ruleId: 'SPIKE_NO_TIMEBOX', ticketId: 'EVAL-SPIKE' }],
  },
  {
    name: '退化-空チケット集合 (クラッシュしない)',
    ceremony: 'refinement',
    tickets: [],
    expect: [],
  },
];
