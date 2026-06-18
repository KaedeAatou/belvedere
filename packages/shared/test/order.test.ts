// computeReorderUpdates の直接単体テスト (T1a / 2026-06-18)。
//
// なぜ最安レイヤで固定するか: 2026-06-16 の d&d 先頭ジャンプバグ (区画密再採番で根治) は
// 単体・e2e 全緑なのに本番発症した。算術が api handler に inline で埋もれ「orderIndex 未設定/等値
// 隣接」という退化入力を直接テストできなかったのが根因。本テストは survivors (新並び順) を渡して
// (i+1)*1000 の密再採番・set/clear・変化行のみ返す挙動を退化入力ごと固定する。

import { describe, it, expect } from 'vitest';
import { computeReorderUpdates } from '../src/order';
import type { Ticket } from '../src/types';

const NOW = '2026-06-18T00:00:00Z';

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

const orderOf = (xs: Ticket[]): Array<[string, number | undefined]> =>
  xs.map((x) => [x.id, x.orderIndex]);

describe('computeReorderUpdates — 密再採番 (退化 orderIndex)', () => {
  it('orderIndex 未設定 3 枚 → 1000/2000/3000 に密採番 (全件変化)', () => {
    const survivors = [t({ id: 'A' }), t({ id: 'B' }), t({ id: 'C' })];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    expect(orderOf(updates)).toEqual([
      ['A', 1000],
      ['B', 2000],
      ['C', 3000],
    ]);
  });

  it('先頭ジャンプ回帰: 先頭 A を中段へ ([B,A,C]) → 位置どおり 1000/2000/3000 (A が先頭化しない)', () => {
    // 旧バグ: 1 件だけ orderIndex が付くと compareTicketOrder 規則2 で先頭ジャンプ。
    // 密再採番は survivors の位置で決まるので、中段に置けば必ず中段 (2000) になる。
    const survivors = [t({ id: 'B' }), t({ id: 'A' }), t({ id: 'C' })];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    const a = updates.find((u) => u.id === 'A')!;
    expect(a.orderIndex).toBe(2000); // 先頭 (1000) ではなく中段
    expect(orderOf(updates)).toEqual([
      ['B', 1000],
      ['A', 2000],
      ['C', 3000],
    ]);
  });

  it('等値 orderIndex 隣接 → 位置で一意に密採番 (中点衝突しない)', () => {
    const survivors = [
      t({ id: 'X', orderIndex: 1000 }),
      t({ id: 'Y', orderIndex: 1000 }),
      t({ id: 'Z', orderIndex: 1000 }),
    ];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    // X は i=0 → 1000 で変化なし (skip)、Y→2000 / Z→3000 が変化
    expect(orderOf(updates)).toEqual([
      ['Y', 2000],
      ['Z', 3000],
    ]);
  });

  it('混在 orderIndex (一部未設定) → 全て位置どおり密採番', () => {
    const survivors = [t({ id: 'A', orderIndex: 500 }), t({ id: 'B', orderIndex: 999 }), t({ id: 'C' })];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    expect(orderOf(updates)).toEqual([
      ['A', 1000],
      ['B', 2000],
      ['C', 3000],
    ]);
  });
});

describe('computeReorderUpdates — 変化行のみ返す (write 増幅回避)', () => {
  it('既に正しい orderIndex の行は skip (updatedAt 温存)', () => {
    const survivors = [t({ id: 'A', orderIndex: 1000 }), t({ id: 'B', orderIndex: 5000 })];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    // A は i=0 → 1000 で不変 → skip。B のみ 5000→2000 で変化。
    expect(updates.map((u) => u.id)).toEqual(['B']);
    expect(updates[0]!.orderIndex).toBe(2000);
    expect(updates[0]!.updatedAt).toBe(NOW);
  });

  it('全行が既に密採番済 → updates 空 (no-op で書込ゼロ)', () => {
    const survivors = [t({ id: 'A', orderIndex: 1000 }), t({ id: 'B', orderIndex: 2000 })];
    const updates = computeReorderUpdates(survivors, { now: NOW });
    expect(updates).toEqual([]);
  });
});

describe('computeReorderUpdates — movedId の sprint set / clear', () => {
  it('movedId に sprintId(string) → その行だけ sprint 変更 (区画跨ぎ移動)', () => {
    const survivors = [
      t({ id: 'A', sprintId: 's1', orderIndex: 1000 }),
      t({ id: 'M', orderIndex: 2000 }),
    ];
    const updates = computeReorderUpdates(survivors, { movedId: 'M', sprintId: 's1', now: NOW });
    // A: i=0→1000 不変 + 非 moved → skip。M: i=1→2000 不変だが sprintId undefined→s1 変化 → 含む。
    expect(updates.map((u) => u.id)).toEqual(['M']);
    expect(updates[0]!.sprintId).toBe('s1');
  });

  it('movedId に sprintId=null → その行の sprintId をキーごと削除 (BACKLOG へ)', () => {
    const survivors = [t({ id: 'M', sprintId: 's1', orderIndex: 1000 })];
    const updates = computeReorderUpdates(survivors, { movedId: 'M', sprintId: null, now: NOW });
    expect(updates).toHaveLength(1);
    expect('sprintId' in updates[0]!).toBe(false);
  });

  it("movedId に sprintId='' → null と同様に未割当化 (clear)", () => {
    const survivors = [t({ id: 'M', sprintId: 's1', orderIndex: 1000 })];
    const updates = computeReorderUpdates(survivors, { movedId: 'M', sprintId: '', now: NOW });
    expect(updates).toHaveLength(1);
    expect('sprintId' in updates[0]!).toBe(false);
  });

  it('movedId に sprintId=undefined → sprint 変更なし (orderIndex 変化のみで判定)', () => {
    const survivors = [t({ id: 'M', sprintId: 's1', orderIndex: 1000 })];
    // sprintId undefined = 移動指定なし。orderIndex も 1000 で不変 → skip。
    const updates = computeReorderUpdates(survivors, { movedId: 'M', now: NOW });
    expect(updates).toEqual([]);
  });

  it('moved 行が別 sprint へ (s1→s2) → sprintId 置換', () => {
    const survivors = [t({ id: 'M', sprintId: 's1', orderIndex: 1000 })];
    const updates = computeReorderUpdates(survivors, { movedId: 'M', sprintId: 's2', now: NOW });
    expect(updates[0]!.sprintId).toBe('s2');
  });
});
