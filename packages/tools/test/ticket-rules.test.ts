// ルールエンジンの unit test (T3 / 2026-06-11)。
// ルール 1 個につき最低「発火する / しない」の 2 ケースを担保する。

import { describe, it, expect } from 'vitest';
import type { Ticket, Sprint, EstimationSession } from '@belvedere/shared';
import { runTicketRules, buildRuleContext } from '../src/ticket-rules';

const NOW = '2026-06-11T09:00:00Z';

function ticket(over: Partial<Ticket> & { id: string }): Ticket {
  return {
    workspaceId: 'ws-belvedere',
    title: 't',
    status: 'todo',
    priority: 'medium',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    createdBy: 'human',
    ...over,
  };
}

function ctxOf(tickets: Ticket[], sprints: Sprint[] = [], sessions: EstimationSession[] = []) {
  return buildRuleContext(NOW, tickets, sprints, sessions);
}

/** ある儀式で特定 ruleId が ticketId に対して発火したか */
function fired(ceremony: Parameters<typeof runTicketRules>[0], ctx: ReturnType<typeof ctxOf>, ruleId: string, ticketId?: string): boolean {
  return runTicketRules(ceremony, ctx).some((f) => f.ruleId === ruleId && (!ticketId || f.ticketId === ticketId));
}

describe('TYPE_MISSING', () => {
  it('type 未設定で発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A' })]), 'TYPE_MISSING', 'A')).toBe(true);
  });
  it('type 設定済では発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'story' })]), 'TYPE_MISSING', 'A')).toBe(false);
  });
});

describe('TASK_NO_PARENT', () => {
  it('親なし task で発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'task' })]), 'TASK_NO_PARENT', 'A')).toBe(true);
  });
  it('US- 親ありでは発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'task', parentTicketId: 'US-101' })]), 'TASK_NO_PARENT', 'A')).toBe(false);
  });
  it('story 型の親ありでは発火しない', () => {
    const ctx = ctxOf([ticket({ id: 'S', type: 'story' }), ticket({ id: 'A', type: 'task', parentTicketId: 'S' })]);
    expect(fired('refinement', ctx, 'TASK_NO_PARENT', 'A')).toBe(false);
  });
});

describe('TASK_STALL', () => {
  it('in-progress 2 日経過で発火 (daily)', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'task', status: 'in-progress', startedAt: '2026-06-08T00:00:00Z' })]);
    expect(fired('daily', ctx, 'TASK_STALL', 'A')).toBe(true);
  });
  it('着手直後では発火しない', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'task', status: 'in-progress', startedAt: '2026-06-11T06:00:00Z' })]);
    expect(fired('daily', ctx, 'TASK_STALL', 'A')).toBe(false);
  });
});

describe('STORY_DOD_MISSING / STORY_DOD_PROCEDURAL', () => {
  it('DoD 空で MISSING 発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'story' })]), 'STORY_DOD_MISSING', 'A')).toBe(true);
  });
  it('DoD ありで MISSING 発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'story', acceptanceCriteria: ['ユーザがログインできる'] })]), 'STORY_DOD_MISSING', 'A')).toBe(false);
  });
  it('全行が手続き的で PROCEDURAL 発火', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', acceptanceCriteria: ['実装する', 'テストする'] })]);
    expect(fired('refinement', ctx, 'STORY_DOD_PROCEDURAL', 'A')).toBe(true);
  });
  it('価値ベースの行を含めば PROCEDURAL 発火しない', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', acceptanceCriteria: ['ユーザがログイン後にプロフィールが見える', '実装する'] })]);
    expect(fired('refinement', ctx, 'STORY_DOD_PROCEDURAL', 'A')).toBe(false);
  });
});

describe('STORY_SP_MISSING', () => {
  it('SP 未設定で発火 + open-estimation action', () => {
    const findings = runTicketRules('refinement', ctxOf([ticket({ id: 'A', type: 'story' })]));
    const f = findings.find((x) => x.ruleId === 'STORY_SP_MISSING');
    expect(f?.action?.kind).toBe('open-estimation');
  });
  it('SP 設定済では発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'story', estimatePt: 5 })]), 'STORY_SP_MISSING', 'A')).toBe(false);
  });
});

describe('STORY_STALL', () => {
  it('in-progress 3 日経過で発火', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', status: 'in-progress', startedAt: '2026-06-07T00:00:00Z' })]);
    expect(fired('daily', ctx, 'STORY_STALL', 'A')).toBe(true);
  });
  it('startedAt 無し時は updatedAt で推定判定', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', status: 'in-progress', updatedAt: '2026-06-01T00:00:00Z' })]);
    const f = runTicketRules('daily', ctx).find((x) => x.ruleId === 'STORY_STALL');
    expect(f?.message).toContain('(推定)');
  });
});

describe('SPIKE rules', () => {
  it('timeboxHours 無しで SPIKE_NO_TIMEBOX 発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'spike' })]), 'SPIKE_NO_TIMEBOX', 'A')).toBe(true);
  });
  it('timebox 超過で SPIKE_TIMEBOX_OVER 発火', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'spike', status: 'in-progress', timeboxHours: 4, startedAt: '2026-06-11T00:00:00Z' })]);
    expect(fired('daily', ctx, 'SPIKE_TIMEBOX_OVER', 'A')).toBe(true);
  });
  it('DoD が判断材料ベースでなければ SPIKE_DOD_NOT_DECISION 発火', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'spike', timeboxHours: 4, acceptanceCriteria: ['技術ドキュメント1本'] })]);
    expect(fired('refinement', ctx, 'SPIKE_DOD_NOT_DECISION', 'A')).toBe(true);
  });
  it('結論キーワードを含めば SPIKE_DOD_NOT_DECISION 発火しない', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'spike', timeboxHours: 4, acceptanceCriteria: ['3社比較し結論を出す'] })]);
    expect(fired('refinement', ctx, 'SPIKE_DOD_NOT_DECISION', 'A')).toBe(false);
  });
});

describe('BUG rules', () => {
  it('再現手順なしで BUG_NO_REPRO 発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'bug', description: '落ちる' })]), 'BUG_NO_REPRO', 'A')).toBe(true);
  });
  it('再現記述ありで BUG_NO_REPRO 発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'bug', description: '再現手順: ボタン連打' })]), 'BUG_NO_REPRO', 'A')).toBe(false);
  });
  it('回帰テスト DoD なしで BUG_NO_REGRESSION_DOD 発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'bug', description: '再現あり', acceptanceCriteria: ['直る'] })]), 'BUG_NO_REGRESSION_DOD', 'A')).toBe(true);
  });
  // WC-2dba4170: 専用欄 reproSteps / regressionNote が埋まっていれば発火しない (description 非依存)。
  it('reproSteps 欄ありで BUG_NO_REPRO 発火しない (description が空でも)', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'bug', description: '落ちる', reproSteps: '1. ボタン連打 → 2. 落ちる' })]), 'BUG_NO_REPRO', 'A')).toBe(false);
  });
  it('regressionNote 欄ありで BUG_NO_REGRESSION_DOD 発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'bug', reproSteps: '手順', regressionNote: '連打のユニットテストを追加' })]), 'BUG_NO_REGRESSION_DOD', 'A')).toBe(false);
  });
});

describe('INCIDENT rules', () => {
  it('未完了で INCIDENT_ACTIVE 発火 (daily)', () => {
    expect(fired('daily', ctxOf([ticket({ id: 'A', type: 'incident', status: 'in-progress' })]), 'INCIDENT_ACTIVE', 'A')).toBe(true);
  });
  it('done で根本対応 Bug 無しなら INCIDENT_NO_FOLLOWUP_BUG 発火', () => {
    const ctx = ctxOf([ticket({ id: 'INC', type: 'incident', status: 'done' })]);
    expect(fired('refinement', ctx, 'INCIDENT_NO_FOLLOWUP_BUG', 'INC')).toBe(true);
  });
  it('根本対応 Bug があれば発火しない', () => {
    const ctx = ctxOf([
      ticket({ id: 'INC', type: 'incident', status: 'done' }),
      ticket({ id: 'B', type: 'bug', relatedIncidentId: 'INC' }),
    ]);
    expect(fired('refinement', ctx, 'INCIDENT_NO_FOLLOWUP_BUG', 'INC')).toBe(false);
  });
});

describe('MISMATCH_SPIKE_TITLE', () => {
  it('調査 title なのに story で発火', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'story', title: 'OAuth プロバイダの調査' })]), 'MISMATCH_SPIKE_TITLE', 'A')).toBe(true);
  });
  it('spike なら発火しない', () => {
    expect(fired('refinement', ctxOf([ticket({ id: 'A', type: 'spike', title: 'OAuth の調査', timeboxHours: 4, acceptanceCriteria: ['結論'] })]), 'MISMATCH_SPIKE_TITLE', 'A')).toBe(false);
  });
});

describe('SPRINT_OVER_VELOCITY (aggregate)', () => {
  const active = (over: Partial<Sprint> = {}): Sprint => ({
    id: 'sprint-13', workspaceId: 'ws-belvedere', number: 13, startsAt: '', endsAt: '', goal: '', capacity: 32, status: 'active', ...over,
  });
  const completed = (velocity: number): Sprint => ({
    id: 'sprint-12', workspaceId: 'ws-belvedere', number: 12, startsAt: '', endsAt: '', goal: '', capacity: 30, velocity, status: 'completed',
  });
  it('合計 SP が平均 velocity を超過で発火', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', sprintId: 'sprint-13', estimatePt: 8 }), ticket({ id: 'B', type: 'story', sprintId: 'sprint-13', estimatePt: 5 })], [active(), completed(10)]);
    expect(fired('planning', ctx, 'SPRINT_OVER_VELOCITY')).toBe(true);
  });
  it('velocity 内では発火しない', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', sprintId: 'sprint-13', estimatePt: 3 })], [active(), completed(10)]);
    expect(fired('planning', ctx, 'SPRINT_OVER_VELOCITY')).toBe(false);
  });
  it('velocity 実績が無ければ発火しない (判定不能)', () => {
    const ctx = ctxOf([ticket({ id: 'A', type: 'story', sprintId: 'sprint-13', estimatePt: 99 })], [active()]);
    expect(fired('planning', ctx, 'SPRINT_OVER_VELOCITY')).toBe(false);
  });
});

describe('ESTIMATE_DIVERGENCE (aggregate)', () => {
  const session = (votes: EstimationSession['votes'], status: EstimationSession['status'] = 'revealed'): EstimationSession => ({
    id: 'EST-1', workspaceId: 'ws-belvedere', ticketId: 'A', status, votes, createdAt: '', createdBy: 'u1',
  });
  it('2 段以上割れたら発火', () => {
    const ctx = ctxOf([], [], [session([
      { userId: 'u1', value: 2, submittedAt: '' },
      { userId: 'u2', value: 8, submittedAt: '' },
    ])]);
    expect(fired('refinement', ctx, 'ESTIMATE_DIVERGENCE', 'A')).toBe(true);
  });
  it('揃っていれば発火しない', () => {
    const ctx = ctxOf([], [], [session([
      { userId: 'u1', value: 5, submittedAt: '' },
      { userId: 'u2', value: 5, submittedAt: '' },
    ])]);
    expect(fired('refinement', ctx, 'ESTIMATE_DIVERGENCE', 'A')).toBe(false);
  });
  it('voting 中 (未開示) では発火しない', () => {
    const ctx = ctxOf([], [], [session([
      { userId: 'u1', value: 2, submittedAt: '' },
      { userId: 'u2', value: 13, submittedAt: '' },
    ], 'voting')]);
    expect(fired('refinement', ctx, 'ESTIMATE_DIVERGENCE', 'A')).toBe(false);
  });
});

describe('儀式フィルタ', () => {
  it('daily では refinement 専用ルール (TYPE_MISSING) は出ない', () => {
    expect(fired('daily', ctxOf([ticket({ id: 'A' })]), 'TYPE_MISSING')).toBe(false);
  });
});

describe('エッジ: 空リスト / 複数ルール同時発火', () => {
  it('tickets/sprints/sessions すべて空 → 全儀式で findings 0 (per-ticket も aggregate も空)', () => {
    // 空配列で例外を投げず findings 0 を返すこと (退化入力 / testing.md §1)。
    // aggregate ルール (SPRINT_OVER_VELOCITY / ESTIMATE_DIVERGENCE) も空入力で何も足さない。
    const empty = ctxOf([]);
    for (const ceremony of ['planning', 'daily', 'refinement', 'review', 'retrospective'] as const) {
      expect(runTicketRules(ceremony, empty)).toEqual([]);
    }
  });

  it('SP も DoD も無い Story 1 枚で 2 ルールが同時発火 (同 ticket に複数 findings)', () => {
    // 1 チケットに対し独立条件のルールが同時に立つことを固定 (additive 合成の健全性)。
    const ctx = ctxOf([ticket({ id: 'A', type: 'story' })]); // acceptanceCriteria / estimatePt 両方欠落
    const onA = runTicketRules('refinement', ctx).filter((f) => f.ticketId === 'A');
    const ruleIds = onA.map((f) => f.ruleId).sort();
    expect(ruleIds).toContain('STORY_DOD_MISSING');
    expect(ruleIds).toContain('STORY_SP_MISSING');
    // type は設定済 (story) なので TYPE_MISSING は混ざらない = 同時発火が「全部入り」ではないことも担保。
    expect(ruleIds).not.toContain('TYPE_MISSING');
  });
});
