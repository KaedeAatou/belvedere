// チケット並び替え (fractional orderIndex / Linear 方式) の共通ロジック。
// BacklogScreen / PlanningScreen / RefinementScreen で共有する。
//
// 使い方:
//   const sorted = computed(() => [...myTickets].sort(compareTicketOrder));
//   const { draggingId, dropEdgeFor, onReorderStart, onReorderOver, onReorderDrop, onReorderEnd } =
//     useTicketReorder({ sorted, patch: (id, body) => patchTicket(id, body) });
//
// TicketRow 側の配線:
//   <TicketRow reorderable drag-handle :drop-edge="dropEdgeFor(t.id)"
//              @reorder-start="onReorderStart(t.id)"
//              @reorder-over="(e) => onReorderOver(t.id, e)"
//              @reorder-drop="onReorderDrop(t.id)"
//              @reorder-end="onReorderEnd" />

import type { ComputedRef } from 'vue';
import type { Ticket } from '@belvedere/shared';

// 端は ±1000、隣接は中間値。差が極小になったら一括リバランス。
const ORDER_STEP = 1000;
const ORDER_MIN_GAP = 1e-6;

/**
 * d&d ドロップ時の新しい orderIndex を算出する pure function。
 *
 * @param sorted   現在の表示順のチケット配列
 * @param draggedId ドラッグ中チケットの id
 * @param targetId  ドロップ対象の id
 * @param before    true = target の前 (上) / false = target の後 (下) に挿入
 * @returns 新しい orderIndex。null = リバランスが必要 (隣接 gap が枯渇)。
 */
export function computeOrderIndexBetween(
  sorted: Ticket[],
  draggedId: string,
  targetId: string,
  before: boolean,
): number | null {
  if (draggedId === targetId) return null;
  const targetIdx = sorted.findIndex((t) => t.id === targetId);
  if (targetIdx === -1) return null;

  // 挿入位置の「前の行」「後の行」を決める (ドラッグ中の行自身は無視)。
  const insertAt = before ? targetIdx : targetIdx + 1;
  const prevRow = sorted.slice(0, insertAt).reverse().find((t) => t.id !== draggedId) ?? null;
  const nextRow = sorted.slice(insertAt).find((t) => t.id !== draggedId) ?? null;

  // 各行の実効 orderIndex (未設定なら表示順 index ベースで仮想化)。
  const eff = (t: Ticket | null): number | null => {
    if (!t) return null;
    if (t.orderIndex !== undefined) return t.orderIndex;
    return (sorted.findIndex((x) => x.id === t.id) + 1) * ORDER_STEP;
  };
  const prev = eff(prevRow);
  const next = eff(nextRow);

  if (prev === null && next === null) return ORDER_STEP; // リストが実質空
  if (prev === null && next !== null) return next - ORDER_STEP; // 先頭へ
  if (prev !== null && next === null) return prev + ORDER_STEP; // 末尾へ
  // 中間値。gap が枯渇したら null を返してリバランスを要求。
  if (prev !== null && next !== null) {
    if (Math.abs(next - prev) < ORDER_MIN_GAP) return null;
    return (prev + next) / 2;
  }
  return null;
}

export interface UseTicketReorderOptions {
  /** 画面に表示している順序のチケット配列 (フィルタ後 / グループ後)。 */
  sorted: ComputedRef<Ticket[]>;
  /** API PATCH を呼び出す関数。成功したら Promise を resolve する。 */
  patch: (id: string, body: { orderIndex: number }) => Promise<unknown>;
  /**
   * リバランス時にベースとなる「フィルタ前の全チケット配列」。
   * 省略時は sorted をそのまま使う。
   * BacklogScreen のようにフィルタがある場合は未フィルタの配列を渡すことで
   * フィルタ中でも一貫した orderIndex に仕上がる。
   */
  sortedRaw?: ComputedRef<Ticket[]>;
}

export function useTicketReorder(opts: UseTicketReorderOptions) {
  const draggingId = ref<string | null>(null);
  // ドロップインジケータ: { id, edge }。edge='before' は行上端、'after' は行下端。
  const dropTarget = ref<{ id: string; edge: 'before' | 'after' } | null>(null);

  function dropEdgeFor(id: string): 'before' | 'after' | null {
    if (!dropTarget.value || dropTarget.value.id !== id) return null;
    return dropTarget.value.edge;
  }

  function onReorderStart(id: string): void {
    draggingId.value = id;
  }

  /** ドラッグ中を除いた実質的な最終行の id (末尾判定用)。 */
  function lastTargetId(): string | null {
    const list = opts.sorted.value;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (t && t.id !== draggingId.value) return t.id;
    }
    return null;
  }

  function onReorderOver(id: string, evt: DragEvent): void {
    if (!draggingId.value || draggingId.value === id) return;
    const el = evt.currentTarget as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (evt.clientY - rect.top) / rect.height;
    // 通常は上半分=before / 下半分=after。ただし最終行だけは threshold を下げて
    // after を出しやすくする。これで「一番下に落とす」が下半分を正確に狙わなくても
    // 末尾になり、行を越えて空白に落としても直前に通過した after が残るため
    // 「下から2番目に入る」現象を防ぐ。
    const isLast = lastTargetId() === id;
    const edge: 'before' | 'after' = ratio < (isLast ? 0.3 : 0.5) ? 'before' : 'after';
    dropTarget.value = { id, edge };
  }

  async function onReorderDrop(targetId: string): Promise<void> {
    const dragged = draggingId.value;
    const target = dropTarget.value;
    draggingId.value = null;
    dropTarget.value = null;
    if (!dragged || !target || dragged === targetId) return;

    // リバランスのベースは sortedRaw (フィルタ前) があればそちらを優先する。
    const base = opts.sortedRaw?.value ?? opts.sorted.value;
    const newIndex = computeOrderIndexBetween(base, dragged, targetId, target.edge === 'before');
    if (newIndex === null) {
      // gap 枯渇 or 算出不能 → 一括リバランス後に再配置。
      await rebalance(base, dragged, targetId, target.edge === 'before');
      return;
    }
    await opts.patch(dragged, { orderIndex: newIndex });
  }

  function onReorderEnd(): void {
    draggingId.value = null;
    dropTarget.value = null;
  }

  /**
   * orderIndex の gap が枯渇したときの一括リバランス。
   * 現在の表示順にドラッグ行を希望位置へ差し込んだ並びを作り、ORDER_STEP 刻みで
   * 全件 PATCH する (件数は数十なので連発で許容)。
   */
  async function rebalance(
    current: Ticket[],
    draggedId: string,
    targetId: string,
    before: boolean,
  ): Promise<void> {
    const without = current.filter((t) => t.id !== draggedId);
    const dragged = current.find((t) => t.id === draggedId);
    if (!dragged) return;
    const targetIdx = without.findIndex((t) => t.id === targetId);
    const insertAt = targetIdx === -1 ? without.length : before ? targetIdx : targetIdx + 1;
    const reordered = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
    for (let i = 0; i < reordered.length; i++) {
      const t = reordered[i];
      if (!t) continue;
      await opts.patch(t.id, { orderIndex: (i + 1) * ORDER_STEP });
    }
  }

  return {
    draggingId,
    dropEdgeFor,
    onReorderStart,
    onReorderOver,
    onReorderDrop,
    onReorderEnd,
  };
}
