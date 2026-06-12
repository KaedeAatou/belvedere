// 3 区画 (CURRENT / NEXT / BACKLOG) へのチケット振り分け composable (Wave 1 / 2026-06-13)。
//
// Backlog / Refinement / Planning の 3 画面共通ビュー (SprintSectionedList) の心臓部。
// 各区画は compareTicketOrder (orderIndex 昇順 → priority → createdAt) でソートして返す。
//
//   CURRENT  = active sprint (status==='active') のチケット
//   NEXT     = 次の planned sprint (最小 number の planned) のチケット
//   BACKLOG  = どちらの sprint にも属さない (sprintId 無し / 別 sprint) チケット
//
// 使い方:
//   const { current, next, backlog, activeSprint, nextPlanned } = useSprintSections(
//     computed(() => props.tickets),
//   );

import type { ComputedRef } from 'vue';
import type { Ticket } from '@belvedere/shared';
import { compareTicketOrder } from '@belvedere/shared';

export interface SprintSections {
  /** active sprint のチケット (compareTicketOrder 昇順)。 */
  current: ComputedRef<Ticket[]>;
  /** 次 planned sprint のチケット (compareTicketOrder 昇順)。 */
  next: ComputedRef<Ticket[]>;
  /** いずれの sprint にも属さないチケット (compareTicketOrder 昇順)。 */
  backlog: ComputedRef<Ticket[]>;
}

/**
 * @param tickets 全チケット配列 (ComputedRef)。フィルタ済みでも未フィルタでも可。
 */
export function useSprintSections(tickets: ComputedRef<Ticket[]>): SprintSections {
  const { activeSprint, nextPlanned } = useSprints();

  const current = computed<Ticket[]>(() => {
    const id = activeSprint.value?.id;
    if (!id) return [];
    return [...tickets.value.filter((t) => t.sprintId === id)].sort(compareTicketOrder);
  });

  const next = computed<Ticket[]>(() => {
    const id = nextPlanned.value?.id;
    if (!id) return [];
    return [...tickets.value.filter((t) => t.sprintId === id)].sort(compareTicketOrder);
  });

  const backlog = computed<Ticket[]>(() => {
    const activeId = activeSprint.value?.id;
    const nextId = nextPlanned.value?.id;
    // sprintId が active / next のどちらにも一致しないものが BACKLOG。
    // sprintId 無し (undefined) は当然 BACKLOG。完了済 sprint に属す古いチケットも BACKLOG に出す
    // (CURRENT/NEXT のみが特別区画で、それ以外は全部「未スケジュール」扱い)。
    return [...tickets.value.filter((t) => {
      const sid = t.sprintId;
      if (sid === undefined) return true;
      if (activeId !== undefined && sid === activeId) return false;
      if (nextId !== undefined && sid === nextId) return false;
      return true;
    })].sort(compareTicketOrder);
  });

  return { current, next, backlog };
}
