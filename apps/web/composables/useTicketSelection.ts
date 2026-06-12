// チケット一括選択ロジック (複数選択 → 一括変更 / 一括削除)。
// 全チケット一覧画面 (Backlog / Planning / Refinement / Review) で同じ操作感にする横展開の中核。
//
// 設計意図:
//   - 画面ごとに独立した選択セットにしたい (画面切替で前画面の選択が残らない) ため、
//     useState ではなくローカル ref (ref(new Set())) を返す。画面 unmount で自動的に破棄される。
//   - patchTicket / deleteTicket / fetchTickets は useTickets (useState 共有) を内部で呼ぶ。
//     一括操作の後は fetchTickets で server と resync し、orderIndex 等の派生も整合させる。
//
// 使い方:
//   const sel = useTicketSelection();
//   sel.toggle(t.id);  sel.isSelected(t.id);
//   await sel.applyToSelected({ status: 'done' });  // 選択中全件に PATCH
//   await sel.removeSelected();                      // 選択中全件を削除

import type { PatchTicketInput } from '~/composables/useTickets';

export const useTicketSelection = () => {
  const { tickets, patchTicket, deleteTicket, fetchTickets } = useTickets();

  // 画面ローカルな選択セット (useState を使わない = 画面 unmount で破棄)。
  const ids = ref<Set<string>>(new Set());
  const isBusy = ref(false);

  const count = computed(() => ids.value.size);
  const selectedIds = computed(() => [...ids.value]);

  function isSelected(id: string): boolean {
    return ids.value.has(id);
  }

  function toggle(id: string): void {
    // Set の入れ替えで reactivity をトリガ (mutate だけだと computed が更新されない)。
    const next = new Set(ids.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ids.value = next;
  }

  /** 全選択用: 指定 id 群を選択セットに加える (既存選択は維持)。 */
  function selectMany(targetIds: string[]): void {
    const next = new Set(ids.value);
    for (const id of targetIds) next.add(id);
    ids.value = next;
  }

  function clear(): void {
    ids.value = new Set();
  }

  /** 選択中の存在しなくなった id を除去する (削除後の resync で迷子 id を残さない)。 */
  function prune(): void {
    const live = new Set(tickets.value.map((t) => t.id));
    const next = new Set([...ids.value].filter((id) => live.has(id)));
    if (next.size !== ids.value.size) ids.value = next;
  }

  /** 選択中の全チケットに同一 patch を適用 → resync → 選択解除。 */
  async function applyToSelected(patch: PatchTicketInput): Promise<void> {
    const targets = [...ids.value];
    if (targets.length === 0 || isBusy.value) return;
    isBusy.value = true;
    try {
      await Promise.all(targets.map((id) => patchTicket(id, patch)));
      await fetchTickets();
    } finally {
      clear();
      isBusy.value = false;
    }
  }

  /** 選択中の全チケットを削除 → resync → 選択解除。 */
  async function removeSelected(): Promise<void> {
    const targets = [...ids.value];
    if (targets.length === 0 || isBusy.value) return;
    isBusy.value = true;
    try {
      await Promise.all(targets.map((id) => deleteTicket(id)));
      await fetchTickets();
    } finally {
      clear();
      isBusy.value = false;
    }
  }

  return {
    isSelected,
    toggle,
    selectMany,
    clear,
    prune,
    count,
    selectedIds,
    isBusy,
    applyToSelected,
    removeSelected,
  };
};
