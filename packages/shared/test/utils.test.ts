// utils.ts の単体テスト (2026-06-10 / R2 で api/repo から移設・集約)。

import { describe, it, expect } from 'vitest';
import { stripUndefined, stripUndefinedPartial, generateId, applyStatusTransition, compareTicketOrder } from '../src/utils';
import type { Ticket } from '../src/types';

const baseTicket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'WC-T',
  workspaceId: 'ws-belvedere',
  title: 't',
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

describe('stripUndefined (型は T のまま / repo backend 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefined({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
  it('undefined を含まない object はそのまま', () => {
    expect(stripUndefined({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });
});

describe('stripUndefinedPartial (undefined union も型から除外 / api handler 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefinedPartial({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefinedPartial({ a: undefined, b: undefined })).toEqual({});
  });
});

describe('generateId', () => {
  it('prefix-短ランダム(8 hex) 形式で返す', () => {
    const id = generateId('WC');
    expect(id).toMatch(/^WC-[0-9a-f]{8}$/);
  });
  it('prefix が変われば接頭辞も変わる', () => {
    expect(generateId('EP').startsWith('EP-')).toBe(true);
    expect(generateId('EST').startsWith('EST-')).toBe(true);
  });
  it('同一ミリ秒に連続採番しても衝突しない (ランダム id の本旨)', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId('WC')));
    expect(ids.size).toBe(1000);
  });
});

// compareTicketOrder は memory / firestore / web の 3 層で共有される並び順の核。
// 規則2「orderIndex を持つ行は持たない行より前」が d&d 並び替えバグ (区画密再採番で根治
// / 2026-06-16) の中心だった。seed/新規が orderIndex 未設定 → 1件だけ値が付くと規則2で
// 区画先頭へジャンプする、という退化入力をここで直接固定する (= 最安レイヤの回帰ガード)。
describe('compareTicketOrder', () => {
  const sgn = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0);

  it('規則1: 両方 orderIndex あり → 昇順', () => {
    expect(sgn(compareTicketOrder(baseTicket({ orderIndex: 1000 }), baseTicket({ orderIndex: 2000 })))).toBe(-1);
    expect(sgn(compareTicketOrder(baseTicket({ orderIndex: 3000 }), baseTicket({ orderIndex: 2000 })))).toBe(1);
  });

  it('規則2 (バグの核): orderIndex あり は 未設定 より前', () => {
    const withOrder = baseTicket({ orderIndex: 1000 });
    const withoutOrder = baseTicket();
    expect(sgn(compareTicketOrder(withOrder, withoutOrder))).toBe(-1);
    expect(sgn(compareTicketOrder(withoutOrder, withOrder))).toBe(1);
  });

  it('規則3: 両方未設定 → priority 降順 (urgent>high>medium>low)', () => {
    const high = baseTicket({ priority: 'high' });
    const low = baseTicket({ priority: 'low' });
    expect(sgn(compareTicketOrder(high, low))).toBe(-1);
    expect(sgn(compareTicketOrder(low, high))).toBe(1);
  });

  it('規則3: 両方未設定 + 同 priority → createdAt 昇順', () => {
    const older = baseTicket({ createdAt: '2026-06-01T00:00:00Z' });
    const newer = baseTicket({ createdAt: '2026-06-02T00:00:00Z' });
    expect(sgn(compareTicketOrder(older, newer))).toBe(-1);
  });

  it('規則1: 等値 orderIndex → fallback (priority) で決まる (中点衝突=症状2 の core)', () => {
    const a = baseTicket({ orderIndex: 1000, priority: 'urgent' });
    const b = baseTicket({ orderIndex: 1000, priority: 'medium' });
    expect(sgn(compareTicketOrder(a, b))).toBe(-1); // 同値なら priority で安定区別 (tie で 0 にしない)
  });

  it('回帰ガード: 未設定群に1件だけ orderIndex を付けると先頭へ来る (= 旧バグの先頭ジャンプ機序)', () => {
    // この挙動自体は仕様 (規則2)。だからこそ「区画は密再採番で全件 distinct にする」必要がある、を固定。
    const a = baseTicket({ id: 'WC-A', priority: 'high', createdAt: '2026-06-01T00:00:00Z' });
    const b = baseTicket({ id: 'WC-B', priority: 'medium', createdAt: '2026-06-02T00:00:00Z' });
    const c = baseTicket({ id: 'WC-C', priority: 'low', createdAt: '2026-06-03T00:00:00Z', orderIndex: 1000 });
    const sorted = [a, b, c].sort(compareTicketOrder).map((t) => t.id);
    expect(sorted[0]).toBe('WC-C'); // 優先度最低でも orderIndex 持ちが先頭
  });
});

describe('applyStatusTransition', () => {
  const NOW = '2026-06-11T09:00:00Z';

  it('初回 in-progress で startedAt を刻む', () => {
    const r = applyStatusTransition(baseTicket(), 'in-progress', NOW);
    expect(r.status).toBe('in-progress');
    expect(r.startedAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW);
  });
  it('初回 done で completedAt を刻む', () => {
    const r = applyStatusTransition(baseTicket(), 'done', NOW);
    expect(r.completedAt).toBe(NOW);
  });
  it('既に startedAt があれば in-progress 再遷移で上書きしない', () => {
    const r = applyStatusTransition(
      baseTicket({ startedAt: '2026-06-01T00:00:00Z', status: 'review' }),
      'in-progress',
      NOW,
    );
    expect(r.startedAt).toBe('2026-06-01T00:00:00Z');
  });
  it('既に completedAt があれば done 再遷移で上書きしない', () => {
    const r = applyStatusTransition(
      baseTicket({ completedAt: '2026-06-02T00:00:00Z', status: 'review' }),
      'done',
      NOW,
    );
    expect(r.completedAt).toBe('2026-06-02T00:00:00Z');
  });
  it('todo 等への遷移では startedAt/completedAt を刻まない', () => {
    const r = applyStatusTransition(baseTicket({ status: 'backlog' }), 'todo', NOW);
    expect(r.startedAt).toBeUndefined();
    expect(r.completedAt).toBeUndefined();
  });
});
