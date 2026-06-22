// 権限判定 can() と normalizeRole() の直接 unit テスト (2026-06-23 再設計)。
// 純粋関数なので repo 非依存で全組合せを固定する (.claude/rules/testing.md「共有純粋関数は直接テスト」)。

import { describe, it, expect } from 'vitest';
import { can, normalizeRole, rolesFor, forbidden, type Action } from '../src/permissions';
import type { WorkspaceRole } from '@belvedere/shared';

// permissions.ts の MATRIX とは独立に「期待される許可表」を二重管理する。
// 片方を直し忘れたらこのテストが落ちる = マトリクスのドリフト検出。admin は全許可。
const EXPECT: Record<Action, WorkspaceRole[]> = {
  'member.invite': ['admin', 'po', 'sm'],
  'backlog.reorder': ['admin', 'po'],
  'epic.write': ['admin', 'po'],
  'sprint.goal': ['admin', 'po', 'sm'],
  'sprint.manage': ['admin', 'sm'],
  'estimation.facilitate': ['admin', 'sm'],
  'estimation.vote': ['admin', 'dev'],
  'estimation.adopt': ['admin', 'sm', 'dev'],
  'ticket.write': ['admin', 'po', 'sm', 'dev'],
  'agent.invoke': ['admin', 'po', 'sm', 'dev'],
};

const ALL_ROLES: WorkspaceRole[] = ['admin', 'po', 'sm', 'dev'];
const ALL_ACTIONS = Object.keys(EXPECT) as Action[];

describe('can - 権限マトリクス全組合せ', () => {
  for (const action of ALL_ACTIONS) {
    for (const role of ALL_ROLES) {
      const expected = EXPECT[action].includes(role);
      it(`${action} × ${role} = ${expected}`, () => {
        expect(can(action, { role })).toBe(expected);
      });
    }
  }

  it('admin は全 action を bypass する (1人ドッグフード/審査員の肝)', () => {
    for (const action of ALL_ACTIONS) {
      expect(can(action, { role: 'admin' })).toBe(true);
    }
  });

  it('role 未確定 (undefined/欠落) は全 action で false (workspace 未解決を弾く)', () => {
    for (const action of ALL_ACTIONS) {
      expect(can(action, {})).toBe(false);
      expect(can(action, { role: undefined })).toBe(false);
    }
  });

  it('backlog.reorder / epic.write は po(と admin)のみ、sm/dev は不可', () => {
    for (const action of ['backlog.reorder', 'epic.write'] as Action[]) {
      expect(can(action, { role: 'po' })).toBe(true);
      expect(can(action, { role: 'sm' })).toBe(false);
      expect(can(action, { role: 'dev' })).toBe(false);
    }
  });

  it('estimation.vote は dev(と admin)のみ、po/sm は不可', () => {
    expect(can('estimation.vote', { role: 'dev' })).toBe(true);
    expect(can('estimation.vote', { role: 'po' })).toBe(false);
    expect(can('estimation.vote', { role: 'sm' })).toBe(false);
  });

  it('sprint.manage は sm(と admin)のみ、po は不可 (儀式運営は SM)', () => {
    expect(can('sprint.manage', { role: 'sm' })).toBe(true);
    expect(can('sprint.manage', { role: 'po' })).toBe(false);
    expect(can('sprint.manage', { role: 'dev' })).toBe(false);
  });
});

describe('normalizeRole - 旧値の grandfather (seed/本番 doc 互換)', () => {
  it('owner → admin (旧作成者 = 全権)', () => {
    expect(normalizeRole('owner')).toBe('admin');
  });
  it('guest → dev (最小権限)', () => {
    expect(normalizeRole('guest')).toBe('dev');
  });
  it('admin/po/sm/dev はそのまま通す', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('po')).toBe('po');
    expect(normalizeRole('sm')).toBe('sm');
    expect(normalizeRole('dev')).toBe('dev');
  });
  it('未知の値・空文字は安全側の dev に倒す (退化入力)', () => {
    expect(normalizeRole('')).toBe('dev');
    expect(normalizeRole('superuser')).toBe('dev');
    expect(normalizeRole('OWNER')).toBe('dev'); // 大文字は別物 (厳密一致)
  });
});

describe('rolesFor - 許可ロール一覧 (admin を必ず含む / can と整合)', () => {
  it('全 action で admin を含み、各ロールの包含が can() と一致する', () => {
    for (const action of ALL_ACTIONS) {
      const roles = rolesFor(action);
      expect(roles).toContain('admin');
      // rolesFor と can() は同じ MATRIX 由来 = ロールごとに一致する。
      for (const role of ALL_ROLES) {
        expect(roles.includes(role)).toBe(can(action, { role }));
      }
    }
  });

  it('代表例: backlog.reorder=[admin,po] / estimation.vote=[admin,dev] / sprint.manage=[admin,sm]', () => {
    expect(rolesFor('backlog.reorder')).toEqual(['admin', 'po']);
    expect(rolesFor('estimation.vote')).toEqual(['admin', 'dev']);
    expect(rolesFor('sprint.manage')).toEqual(['admin', 'sm']);
    expect(rolesFor('ticket.write')).toEqual(['admin', 'po', 'sm', 'dev']);
  });
});

describe('forbidden - 拒否レスポンス body (わかりやすく・誰なら可能か)', () => {
  it('全 action で error=forbidden / action 一致 / requiredRoles=rolesFor / message は非空', () => {
    for (const action of ALL_ACTIONS) {
      const body = forbidden(action);
      expect(body.error).toBe('forbidden');
      expect(body.action).toBe(action);
      expect(body.requiredRoles).toEqual(rolesFor(action));
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
      // 文末が句点で終わる読みやすい文 (UI トーストにそのまま出せる体裁)。
      expect(body.message.endsWith('。')).toBe(true);
    }
  });

  it('メッセージが操作内容を具体的に説明する (代表例)', () => {
    expect(forbidden('backlog.reorder').message).toContain('並び替え');
    expect(forbidden('sprint.manage').message).toContain('スプリント');
    expect(forbidden('estimation.vote').message).toContain('投票');
    expect(forbidden('member.invite').message).toContain('招待');
  });
});
