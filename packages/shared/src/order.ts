// 区画 d&d 確定時の密再採番の算術 (純粋関数 / T1a / 2026-06-18)。
//
// 旧: この算術は apps/api/src/handlers/ticket-handlers.ts の reorderTickets に inline で埋もれ、
// repo の get/upsert (I/O) と混ざっていたため、2026-06-16 の先頭ジャンプバグの根因である
// 「区画密再採番」を最安レイヤで直接テストできなかった (api/test 経由の間接テストのみ)。
// 算術だけを shared に切り出し packages/shared/test/order.test.ts で退化入力 (orderIndex 未設定
// 隣接 / 等値 / 3 枚先頭→中段 / movedId set,clear / 変化なし行 skip) を直接固定する。
// reorderTickets は get/IDOR/upsert を担い、算術は本関数へ委譲する (挙動不変)。

import type { Ticket } from './types';
import { ORDER_STEP } from './utils';

export interface ReorderOptions {
  /** 区画跨ぎ移動したチケットの id。指定時、その 1 件だけ sprintId を変更する。 */
  movedId?: string | undefined;
  /** movedId の移動先 sprint。string=その sprint へ / null・''=未割当 (BACKLOG) へ / undefined=変更なし。 */
  sprintId?: string | null | undefined;
  /**
   * 現 active sprint の id (省略可)。current↔backlog の status 整合に使う (WC-676a53e1):
   *   - movedId を current (= activeSprintId) へ入れたら status=backlog を todo に引き上げる
   *     (「current にある=やる」/ Daily=current のみ表示なので backlog 状態を current に存在させない)。
   *   - movedId を BACKLOG (sprint 解除) へ戻したら status を backlog にする (backlog 状態 ⟺ 未所属)。
   *   - next への移動は対象外 (方針「current のみ」/ next は Daily に出ないので不整合なし)。
   */
  activeSprintId?: string | undefined;
  /** 変更行の updatedAt に刻む現在時刻 (ISO)。呼出側が new Date().toISOString() を渡す。 */
  now: string;
}

/**
 * survivors (移動先区画の「新並び順」に並んだ生存チケット列) を `(i + 1) * ORDER_STEP` で
 * 密に再採番し、**実際に orderIndex / sprintId が変わる行だけ** を返す。
 *
 * 「1 件移動では隣接帯しか index がずれない」ので、動かしていない無関係チケットへの write 増幅 +
 * updatedAt 汚染を避けるため変化行のみ返す。movedId が survivors に居れば sprintId も set/clear する。
 *
 * 注: survivors の生存フィルタ・IDOR チェック・並行削除の skip は呼出側 (reorderTickets handler) の
 * 責務。本関数は純粋な算術のみ (I/O なし)。
 */
export function computeReorderUpdates(survivors: Ticket[], opts: ReorderOptions): Ticket[] {
  const { movedId, sprintId, activeSprintId, now } = opts;
  const updates: Ticket[] = [];
  for (let i = 0; i < survivors.length; i++) {
    const existing = survivors[i]!;
    const newOrder = (i + 1) * ORDER_STEP;
    const isMoved = movedId !== undefined && existing.id === movedId && sprintId !== undefined;
    const clearSprint = isMoved && (sprintId === null || sprintId === '');
    const setSprint = isMoved && !clearSprint ? (sprintId as string) : undefined;
    const orderChanged = existing.orderIndex !== newOrder;
    const sprintChanged =
      isMoved && (clearSprint ? existing.sprintId !== undefined : existing.sprintId !== setSprint);
    if (!orderChanged && !sprintChanged) continue; // 変化なし — 触らない (write/updatedAt を温存)
    let next: Ticket = { ...existing, orderIndex: newOrder, updatedAt: now };
    if (clearSprint) {
      delete next.sprintId; // 未割当 (BACKLOG) へ。optional string なので key ごと削除。
      next.status = 'backlog'; // BACKLOG 区画へ戻したら status も backlog に (backlog 状態 ⟺ 未所属)
    } else if (setSprint !== undefined) {
      next = { ...next, sprintId: setSprint };
      // current (active sprint) へ入れたら未着手禁止: backlog 状態を todo に引き上げる (current にある=やる)。
      // next への移動は方針「current のみ」のため status は触らない。
      if (activeSprintId !== undefined && setSprint === activeSprintId && next.status === 'backlog') {
        next.status = 'todo';
      }
    }
    updates.push(next);
  }
  return updates;
}
