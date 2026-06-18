// applyEquFilters の直接 unit test (R2-E / 2026-06-18)。
//
// testing.md §1: 複数 entity の list が共有する純粋関数。退化入力 (undefined スキップ / 空 spec /
// 該当なし / falsy=0・false・'' を undefined と区別) を最安レイヤで固定する。

import { describe, it, expect } from 'vitest';
import { applyEquFilters } from '../src/query';

type Row = { ws: string; status?: string; count?: number; flag?: boolean; tag?: string };

const rows: Row[] = [
  { ws: 'a', status: 'open', count: 0, flag: false, tag: '' },
  { ws: 'a', status: 'closed', count: 5, flag: true, tag: 'x' },
  { ws: 'b', status: 'open', count: 0, flag: true, tag: '' },
];

describe('applyEquFilters', () => {
  it('期待値 undefined のエントリはスキップする (= 絞らない)', () => {
    const r = applyEquFilters(rows, [
      ['ws', 'a'],
      ['status', undefined], // 未指定 → status では絞らない
    ]);
    expect(r.map((x) => x.status)).toEqual(['open', 'closed']);
  });

  it('複数 spec は AND で連鎖する', () => {
    const r = applyEquFilters(rows, [
      ['ws', 'a'],
      ['status', 'open'],
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.status).toBe('open');
  });

  it('空 spec → 全件素通し かつ 新しい配列を返す (元 store を汚さない)', () => {
    const r = applyEquFilters(rows, []);
    expect(r).toEqual(rows);
    expect(r).not.toBe(rows); // 参照は別 (新配列)
  });

  it('該当なし → 空配列', () => {
    expect(applyEquFilters(rows, [['ws', 'zzz']])).toEqual([]);
  });

  it('falsy: 0 は undefined と区別して等値マッチ (スキップしない)', () => {
    const r = applyEquFilters(rows, [['count', 0]]);
    expect(r.map((x) => x.ws).sort()).toEqual(['a', 'b']); // count=0 の 2 件
  });

  it('falsy: false も等値マッチ', () => {
    const r = applyEquFilters(rows, [['flag', false]]);
    expect(r).toHaveLength(1);
    expect(r[0]!.ws).toBe('a');
  });

  it("falsy: 空文字 '' も等値マッチ (truthy 判定 if(x) との差分)", () => {
    const r = applyEquFilters(rows, [['tag', '']]);
    expect(r.map((x) => x.ws).sort()).toEqual(['a', 'b']);
  });

  it('query 名 ≠ 行キーのマッピングは呼出側で吸収 ([行キー, query値] を渡す)', () => {
    // TicketQuery.storyId → Ticket.parentTicketId は呼出側で ['parentTicketId', q.storyId] にする。
    type T = { id: string; parentTicketId?: string };
    const ts: T[] = [{ id: '1', parentTicketId: 'US-1' }, { id: '2', parentTicketId: 'US-2' }];
    expect(applyEquFilters(ts, [['parentTicketId', 'US-1']]).map((x) => x.id)).toEqual(['1']);
  });

  it('元配列を破壊しない (filter は非破壊)', () => {
    const before = [...rows];
    applyEquFilters(rows, [['ws', 'a'], ['count', 0]]);
    expect(rows).toEqual(before);
  });
});
