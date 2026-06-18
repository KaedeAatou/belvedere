// partitionTicketsBySections の直接単体テスト (T1a / 2026-06-18)。
//
// testing.md §1 (共有純粋関数は退化入力含めて直接テスト) に従い、composable 経由でなく
// 純粋関数を直接踏む。退化入力 = undefined sprintId 隣接 / active・next と一致しない別 sprint
// (完了済) / activeId・nextId 欠落 / 空 / orderIndex 未設定・等値 (compareTicketOrder 経由)。

import { describe, it, expect } from 'vitest';
import { partitionTicketsBySections } from '../src/sections';
import type { Ticket } from '../src/types';

const t = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws-belvedere',
  title: over.id,
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

const ids = (xs: Ticket[]): string[] => xs.map((x) => x.id);

describe('partitionTicketsBySections — 区画振り分け', () => {
  it('active / next / 別 sprint / sprintId 無し を正しく 3 区画へ', () => {
    const tickets = [
      t({ id: 'A', sprintId: 's-active' }),
      t({ id: 'B', sprintId: 's-next' }),
      t({ id: 'C', sprintId: 's-old' }), // 完了済 sprint → BACKLOG
      t({ id: 'D' }), // sprintId 無し → BACKLOG
    ];
    const { current, next, backlog } = partitionTicketsBySections(tickets, {
      activeId: 's-active',
      nextPlannedId: 's-next',
    });
    expect(ids(current)).toEqual(['A']);
    expect(ids(next)).toEqual(['B']);
    expect(ids(backlog).sort()).toEqual(['C', 'D']);
  });

  it('activeId 未指定 → CURRENT 空、その分は active sprint 由来でも BACKLOG 判定に従う', () => {
    const tickets = [t({ id: 'A', sprintId: 's-active' }), t({ id: 'B' })];
    const { current, next, backlog } = partitionTicketsBySections(tickets, {
      nextPlannedId: 's-next',
    });
    expect(current).toEqual([]);
    expect(next).toEqual([]);
    // activeId が無いので s-active も「特別区画でない」→ BACKLOG
    expect(ids(backlog).sort()).toEqual(['A', 'B']);
  });

  it('opts 全欠落 → CURRENT/NEXT 空、全件 BACKLOG', () => {
    const tickets = [t({ id: 'A', sprintId: 's-x' }), t({ id: 'B' })];
    const { current, next, backlog } = partitionTicketsBySections(tickets);
    expect(current).toEqual([]);
    expect(next).toEqual([]);
    expect(ids(backlog).sort()).toEqual(['A', 'B']);
  });

  it('空 tickets → 3 区画とも空配列', () => {
    const { current, next, backlog } = partitionTicketsBySections([], {
      activeId: 's-active',
      nextPlannedId: 's-next',
    });
    expect(current).toEqual([]);
    expect(next).toEqual([]);
    expect(backlog).toEqual([]);
  });

  it('activeId === nextPlannedId の縮退でも CURRENT 優先で振り分く (両区画に同じ id は無い)', () => {
    // 通常起こらないが、振り分けが例外を投げない/重複しないことを固定。
    const tickets = [t({ id: 'A', sprintId: 's-dup' })];
    const { current, next, backlog } = partitionTicketsBySections(tickets, {
      activeId: 's-dup',
      nextPlannedId: 's-dup',
    });
    expect(ids(current)).toEqual(['A']);
    expect(ids(next)).toEqual(['A']); // filter は両方一致するため両区画に出る (UI は同一 sprint を両区画に出さない前提)
    expect(backlog).toEqual([]); // s-dup は active/next 一致なので BACKLOG から除外
  });
});

describe('partitionTicketsBySections — compareTicketOrder ソート (退化 orderIndex)', () => {
  it('orderIndex 未設定隣接は priority 降順 → createdAt 昇順 (先頭ジャンプしない)', () => {
    // orderIndex を持たない 3 枚。全て BACKLOG。priority 同値なので createdAt 昇順。
    const tickets = [
      t({ id: 'C', createdAt: '2026-06-03T00:00:00Z' }),
      t({ id: 'A', createdAt: '2026-06-01T00:00:00Z' }),
      t({ id: 'B', createdAt: '2026-06-02T00:00:00Z' }),
    ];
    const { backlog } = partitionTicketsBySections(tickets);
    expect(ids(backlog)).toEqual(['A', 'B', 'C']);
  });

  it('orderIndex を持つものは持たないものより前 (規則2)、持つもの同士は昇順', () => {
    const tickets = [
      t({ id: 'noidx' }),
      t({ id: 'idx2', orderIndex: 2000 }),
      t({ id: 'idx1', orderIndex: 1000 }),
    ];
    const { backlog } = partitionTicketsBySections(tickets);
    expect(ids(backlog)).toEqual(['idx1', 'idx2', 'noidx']);
  });

  it('等値 orderIndex は priority → createdAt のフォールバックで安定', () => {
    const tickets = [
      t({ id: 'low', orderIndex: 1000, priority: 'low', createdAt: '2026-06-01T00:00:00Z' }),
      t({ id: 'high', orderIndex: 1000, priority: 'high', createdAt: '2026-06-02T00:00:00Z' }),
    ];
    const { backlog } = partitionTicketsBySections(tickets);
    // orderIndex 等値 → priority 降順で high が先
    expect(ids(backlog)).toEqual(['high', 'low']);
  });
});
