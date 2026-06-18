// 3 区画 (CURRENT / NEXT / BACKLOG) へのチケット振り分け純粋関数 (T1a / 2026-06-18)。
//
// 旧: 分類ロジックが apps/web/composables/useSprintSections.ts の Vue computed に埋もれ、
// 退化入力 (undefined sprintId 隣接 / active・next と一致しない別 sprint = 完了済) を最安レイヤで
// 直接テストできなかった。2026-06-16 の d&d 先頭ジャンプバグ (緑なのに本番発症) の反省を受け、
// 分類を純粋関数として shared に出し packages/shared/test/sections.test.ts で退化入力を直接固定する。
// composable は本関数を computed で呼ぶ薄いラッパに変わる (挙動不変)。

import type { Ticket } from './types';
import { compareTicketOrder } from './utils';

export interface TicketSections {
  /** active sprint のチケット (compareTicketOrder 昇順)。 */
  current: Ticket[];
  /** 次 planned sprint のチケット (compareTicketOrder 昇順)。 */
  next: Ticket[];
  /** いずれの特別区画 (CURRENT/NEXT) にも属さないチケット (compareTicketOrder 昇順)。 */
  backlog: Ticket[];
}

export interface PartitionOptions {
  /** active sprint の id。無い (undefined / 空) なら CURRENT は空。 */
  activeId?: string | undefined;
  /** 次 planned sprint の id。無いなら NEXT は空。 */
  nextPlannedId?: string | undefined;
}

/**
 * tickets を CURRENT / NEXT / BACKLOG の 3 区画に振り分ける。各区画は compareTicketOrder
 * (orderIndex 昇順 → priority → createdAt) でソートして返す。
 *
 *   CURRENT  = sprintId === activeId
 *   NEXT     = sprintId === nextPlannedId
 *   BACKLOG  = sprintId 無し / active・next のどちらにも一致しない (完了済 sprint 含む)
 *
 * @param tickets 対象チケット (フィルタ済みでも未フィルタでも可)
 */
export function partitionTicketsBySections(
  tickets: Ticket[],
  opts: PartitionOptions = {},
): TicketSections {
  const { activeId, nextPlannedId } = opts;

  // CURRENT: activeId が無ければ空 (composable の `if (!id) return []` を踏襲)。
  const current = !activeId
    ? []
    : [...tickets.filter((t) => t.sprintId === activeId)].sort(compareTicketOrder);

  const next = !nextPlannedId
    ? []
    : [...tickets.filter((t) => t.sprintId === nextPlannedId)].sort(compareTicketOrder);

  // BACKLOG: sprintId 無し (undefined) は当然 BACKLOG。active / next のどちらにも一致しない
  // ものも BACKLOG (完了済 sprint に属す古いチケットを含む。CURRENT/NEXT のみが特別区画)。
  const backlog = [
    ...tickets.filter((t) => {
      const sid = t.sprintId;
      if (sid === undefined) return true;
      if (activeId !== undefined && sid === activeId) return false;
      if (nextPlannedId !== undefined && sid === nextPlannedId) return false;
      return true;
    }),
  ].sort(compareTicketOrder);

  return { current, next, backlog };
}
