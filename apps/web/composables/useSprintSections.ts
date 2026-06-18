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
import { partitionTicketsBySections } from '@belvedere/shared';

export interface SprintSections {
  /** active sprint のチケット (compareTicketOrder 昇順)。 */
  current: ComputedRef<Ticket[]>;
  /** 次 planned sprint のチケット (compareTicketOrder 昇順)。 */
  next: ComputedRef<Ticket[]>;
  /** いずれの sprint にも属さないチケット (compareTicketOrder 昇順)。 */
  backlog: ComputedRef<Ticket[]>;
}

/**
 * 3 区画への振り分けは純粋関数 partitionTicketsBySections (@belvedere/shared) に委譲し、
 * 本 composable は active / next sprint の id を解決して渡す薄いラッパに徹する。
 * 分類ロジックの退化入力テストは packages/shared/test/sections.test.ts が直接担保する。
 *
 * @param tickets 全チケット配列 (ComputedRef)。フィルタ済みでも未フィルタでも可。
 */
export function useSprintSections(tickets: ComputedRef<Ticket[]>): SprintSections {
  const { activeSprint, nextPlanned } = useSprints();

  const sections = computed(() =>
    partitionTicketsBySections(tickets.value, {
      activeId: activeSprint.value?.id,
      nextPlannedId: nextPlanned.value?.id,
    }),
  );

  return {
    current: computed(() => sections.value.current),
    next: computed(() => sections.value.next),
    backlog: computed(() => sections.value.backlog),
  };
}
