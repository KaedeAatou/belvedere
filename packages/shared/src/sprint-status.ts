// current↔backlog 不変条件 (WC-676a53e1) の調停 — 純粋関数 (2026-06-30)。
//
// 背景: 「current にある=やる(todo 以上) / backlog 状態=どの sprint にも未所属」がユーザ確定モデル。
// Daily は current のみ・status 4 列 (todo/in-progress/review/done) を表示するため、現スプリントに
// 属したまま status=backlog のチケットが在ると Daily で消え、Planning CURRENT (sprint 所属で分類 =
// 全 status) と件数が食い違う (15 vs 13)。
//
// create / reorder 経路は元々この不変条件を inline で保っていた (createTicket: sprint 付きは todo /
// computeReorderUpdates: current 投入→todo・BACKLOG 戻し→backlog)。しかし PATCH (patchTicket) と
// status 変更 (changeTicketStatus) は未強制で、DetailSheet が status=backlog を sprintId(current) と
// 一緒に送る経路で矛盾状態 (current + backlog) を生んでいた。本関数を両経路の最終ネットとして通し、
// 全 write 経路で不変条件を一貫させる。

import type { Status } from './types';

export interface ReconcileSprintStatusOptions {
  /** 現 active sprint の id。current 所属判定に使う。無ければ rule (b) は無効。 */
  activeSprintId?: string | undefined;
  /**
   * 「status を新たに backlog にした」操作か (existing.status !== 'backlog' かつ new === 'backlog')。
   * true のとき rule (a) を適用し sprint から外す (= backlog にしたら Daily 非表示 / 未所属)。
   * これが rule (b) (current にある=やる) より優先される (ユーザの明示的な backlog 指定が支配的)。
   */
  demoteToBacklog?: boolean | undefined;
}

/**
 * チケットの最終状態に対し current↔backlog 不変条件を強制する。
 *
 *   (a) demoteToBacklog かつ status==='backlog' で sprint 所属あり → sprintId を解除する
 *       (status を backlog にする操作 = sprint から外す。backlog 状態 ⟺ 未所属)。
 *   (b) current(activeSprintId) 所属で status==='backlog' のまま (= sprint 割当 intent / 既存矛盾データ)
 *       → status を todo に引き上げる (current にある=やる。Daily に出す)。
 *
 * (a) と (b) は同じ「current + backlog」入力に対し逆方向だが、demoteToBacklog で意図を切り分ける:
 * status を変えて backlog にした → 外す(a) / sprint を割り当てた・既存矛盾 → 上げる(b)。
 *
 * I/O なし。sprintId は optional string なので解除はキーごと削除する (exactOptionalPropertyTypes)。
 */
export function reconcileSprintStatus<T extends { status: Status; sprintId?: string }>(
  ticket: T,
  opts: ReconcileSprintStatusOptions = {},
): T {
  // (a) status を新たに backlog にした → sprint から外す。
  if (opts.demoteToBacklog && ticket.status === 'backlog' && ticket.sprintId !== undefined) {
    const next = { ...ticket };
    delete (next as { sprintId?: string }).sprintId;
    return next;
  }
  // (b) current 所属で backlog のまま → todo に引き上げる。
  if (
    opts.activeSprintId !== undefined &&
    ticket.sprintId === opts.activeSprintId &&
    ticket.status === 'backlog'
  ) {
    return { ...ticket, status: 'todo' as Status };
  }
  return ticket;
}
