// summarizeSprintContext の unit test (P2 / 2026-07-07)。
// sprint.current tool の本体。AI パネルが sprintId 無しで現在文脈を掴めるための純粋関数。
// 退化入力 (空 / active なし / planned なし / velocity 実績なし / name・goal 空) を直接固定する。

import { describe, it, expect } from 'vitest';
import type { Sprint } from '@belvedere/shared';
import { summarizeSprintContext } from '../src/sprint-context';

function sprint(over: Partial<Sprint> & { id: string; number: number }): Sprint {
  return {
    workspaceId: 'ws-belvedere',
    startsAt: '2026-06-01T00:00:00Z',
    endsAt: '2026-06-14T00:00:00Z',
    goal: 'ゴール',
    capacity: 20,
    status: 'planned',
    ...over,
  };
}

describe('summarizeSprintContext', () => {
  it('空配列 → 全て null / 空 (退化入力で壊れない)', () => {
    const ctx = summarizeSprintContext([]);
    expect(ctx.active).toBeNull();
    expect(ctx.next).toBeNull();
    expect(ctx.avgVelocity).toBeNull();
    expect(ctx.recentCompleted).toEqual([]);
  });

  it('active を status で拾う / next は planned を number 昇順の先頭にする', () => {
    const ctx = summarizeSprintContext([
      sprint({ id: 'sprint-14', number: 14, status: 'planned' }),
      sprint({ id: 'sprint-13', number: 13, status: 'active', goal: '決済 MVP' }),
      sprint({ id: 'sprint-15', number: 15, status: 'planned' }),
    ]);
    expect(ctx.active?.id).toBe('sprint-13');
    expect(ctx.active?.goal).toBe('決済 MVP');
    expect(ctx.next?.id).toBe('sprint-14'); // 15 ではなく 14 (number 昇順の先頭)
  });

  it('active が無くても planned から next だけ返す (active は null)', () => {
    const ctx = summarizeSprintContext([sprint({ id: 'sprint-20', number: 20, status: 'planned' })]);
    expect(ctx.active).toBeNull();
    expect(ctx.next?.id).toBe('sprint-20');
  });

  it('velocity 実績 = velocity 記録のあるスプリントの平均 (四捨五入) / 未記録は除外', () => {
    const ctx = summarizeSprintContext([
      sprint({ id: 'sprint-10', number: 10, status: 'completed', velocity: 20 }),
      sprint({ id: 'sprint-11', number: 11, status: 'completed', velocity: 25 }),
      sprint({ id: 'sprint-13', number: 13, status: 'active' }), // velocity 未記録 → 平均から除外
    ]);
    expect(ctx.avgVelocity).toBe(23); // round((20+25)/2)=22.5→23
  });

  it('velocity 実績が 1 件も無ければ avgVelocity は null', () => {
    const ctx = summarizeSprintContext([sprint({ id: 'sprint-13', number: 13, status: 'active' })]);
    expect(ctx.avgVelocity).toBeNull();
  });

  it('recentCompleted は number 降順で最大 3 件', () => {
    const ctx = summarizeSprintContext([
      sprint({ id: 'sprint-9', number: 9, status: 'completed', velocity: 18 }),
      sprint({ id: 'sprint-10', number: 10, status: 'completed', velocity: 20 }),
      sprint({ id: 'sprint-11', number: 11, status: 'completed', velocity: 22 }),
      sprint({ id: 'sprint-12', number: 12, status: 'completed', velocity: 24 }),
    ]);
    expect(ctx.recentCompleted.map((s) => s.number)).toEqual([12, 11, 10]); // 9 は溢れる
    expect(ctx.recentCompleted[0]).toEqual({ id: 'sprint-12', number: 12, velocity: 24 });
  });

  it('name 未設定 → "Sprint {number}" / goal 空文字 → null', () => {
    const ctx = summarizeSprintContext([
      sprint({ id: 'sprint-13', number: 13, status: 'active', goal: '   ' }),
    ]);
    expect(ctx.active?.name).toBe('Sprint 13');
    expect(ctx.active?.goal).toBeNull();
  });
});
