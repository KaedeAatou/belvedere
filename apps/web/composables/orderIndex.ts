// fractional orderIndex 並び替えの共有プリミティブ (定数 + 中点計算)。
//
// チケット行の d&d は vue-draggable-plus (SortableJS) が DOM 並びを確定し、その近傍 2 行の
// orderIndex から中間値を求めて 1 件だけ patch する方式に統一済 (SprintSectionedList /
// ReviewScreen)。旧 useTicketReorder の自前 pointer/native DnD ロジックは撤去したため、
// 全画面で共有するのはこの「端 ±ORDER_STEP / 隣接は中点」の算術だけになった。

import type { Ticket } from '@belvedere/shared';

/** 端は ±ORDER_STEP、隣接は中間値。float 中点詰めで十分な精度。 */
export const ORDER_STEP = 1000;

/**
 * 近傍 2 行の orderIndex から挿入位置の orderIndex を算出する。
 * prev/next が未設定 (リスト端) の場合は ±ORDER_STEP。
 */
export function orderBetween(prev: Ticket | undefined, next: Ticket | undefined): number {
  const p = prev?.orderIndex ?? null;
  const n = next?.orderIndex ?? null;
  if (p === null && n === null) return ORDER_STEP;
  if (p === null) return (n as number) - ORDER_STEP;
  if (n === null) return p + ORDER_STEP;
  return (p + n) / 2;
}
