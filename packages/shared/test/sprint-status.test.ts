// reconcileSprintStatus の単体テスト (WC-676a53e1)。
// current↔backlog 不変条件「current にある=やる(todo) / backlog 状態=未所属」を退化入力で固める。
import { describe, it, expect } from 'vitest';
import { reconcileSprintStatus } from '../src/sprint-status';
import type { Status } from '../src/types';

const ACTIVE = 'SPRINT-active';

function tk(status: Status, sprintId?: string) {
  return { id: 't1', status, ...(sprintId !== undefined && { sprintId }) } as {
    id: string;
    status: Status;
    sprintId?: string;
  };
}

describe('reconcileSprintStatus (WC-676a53e1)', () => {
  describe('(a) demoteToBacklog: status を backlog にしたら sprint から外す', () => {
    it('current 所属 + backlog + demote → sprintId 解除 (Daily 非表示 / 未所属)', () => {
      const r = reconcileSprintStatus(tk('backlog', ACTIVE), {
        activeSprintId: ACTIVE,
        demoteToBacklog: true,
      });
      expect(r.status).toBe('backlog');
      expect('sprintId' in r).toBe(false);
    });

    it('next sprint 所属 + backlog + demote → sprintId 解除 (どの sprint からも外す)', () => {
      const r = reconcileSprintStatus(tk('backlog', 'SPRINT-next'), {
        activeSprintId: ACTIVE,
        demoteToBacklog: true,
      });
      expect('sprintId' in r).toBe(false);
    });

    it('既に未所属 + backlog + demote → no-op (解除済)', () => {
      const r = reconcileSprintStatus(tk('backlog'), { activeSprintId: ACTIVE, demoteToBacklog: true });
      expect(r.status).toBe('backlog');
      expect('sprintId' in r).toBe(false);
    });
  });

  describe('(b) current 所属で backlog のまま → todo に引き上げ (current にある=やる)', () => {
    it('current 所属 + backlog (demote でない / 既存矛盾データ) → todo', () => {
      const r = reconcileSprintStatus(tk('backlog', ACTIVE), { activeSprintId: ACTIVE });
      expect(r.status).toBe('todo');
      expect(r.sprintId).toBe(ACTIVE); // sprint は保持
    });

    it('current 所属 + backlog + sprint 割当 intent (demote=false) → todo (外さない)', () => {
      const r = reconcileSprintStatus(tk('backlog', ACTIVE), {
        activeSprintId: ACTIVE,
        demoteToBacklog: false,
      });
      expect(r.status).toBe('todo');
      expect(r.sprintId).toBe(ACTIVE);
    });
  });

  describe('no-op ケース', () => {
    it('current 所属 + todo → そのまま (整合済)', () => {
      const r = reconcileSprintStatus(tk('todo', ACTIVE), { activeSprintId: ACTIVE });
      expect(r.status).toBe('todo');
      expect(r.sprintId).toBe(ACTIVE);
    });

    it('current 所属 + done → そのまま (done は current に残る)', () => {
      const r = reconcileSprintStatus(tk('done', ACTIVE), { activeSprintId: ACTIVE });
      expect(r.status).toBe('done');
      expect(r.sprintId).toBe(ACTIVE);
    });

    it('未所属 + backlog (demote でない) → そのまま (正常な backlog)', () => {
      const r = reconcileSprintStatus(tk('backlog'), { activeSprintId: ACTIVE });
      expect(r.status).toBe('backlog');
      expect('sprintId' in r).toBe(false);
    });

    it('activeSprintId 未指定 + 別 sprint + backlog (demote でない) → そのまま', () => {
      const r = reconcileSprintStatus(tk('backlog', 'SPRINT-other'), {});
      expect(r.status).toBe('backlog');
      expect(r.sprintId).toBe('SPRINT-other');
    });
  });
});
