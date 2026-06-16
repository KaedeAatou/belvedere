// 共通ユーティリティ (2026-06-10 / R2 重複排除で新設)。
// repo backend と api handler に重複していた stripUndefined、
// および 3 箇所に散っていた ID 採番ロジックをここに集約する。

import type { Priority, Status, Ticket } from './types';

/** priority 降順用の重み (urgent が最も先頭)。フォールバックソートで使う。 */
const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

/**
 * 手動並び替え orderIndex の刻み幅 (1000)。
 *
 * 区画の d&d 確定時は区画全体を `(i + 1) * ORDER_STEP` で密に再採番する (reorderTickets)。
 * 「近傍 2 行の中点を 1 件だけ patch」方式は、区画内に orderIndex 未設定 (seed 由来) や
 * 等値のチケットが 1 件でも在ると破綻した (未設定隣接→固定値で先頭ジャンプ / 等値隣接→中点衝突で
 * 元位置へ復帰) ため、区画全体を毎回密再採番する方式に統一した。
 * api (reorderTickets handler) と web (composables) で同じ刻み幅を共有する。
 */
export const ORDER_STEP = 1000;

/**
 * バックログ表示順の比較関数 (memory / firestore 両 backend で共有 / 2026-06-12)。
 *
 * 規則:
 * 1. orderIndex を持つチケット同士は orderIndex 昇順 (手動 d&d で決めた順)。
 * 2. orderIndex を持つものは持たないものより前。
 * 3. orderIndex を持たないチケット同士は priority 降順 (urgent>high>medium>low) → createdAt 昇順。
 *
 * 同一規則を両 backend の tickets.list() の末尾で適用し、全 consumer が同じ並びを得る。
 */
export function compareTicketOrder(a: Ticket, b: Ticket): number {
  const ao = a.orderIndex;
  const bo = b.orderIndex;
  if (ao !== undefined && bo !== undefined) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== undefined) {
    return -1; // orderIndex あり が先
  } else if (bo !== undefined) {
    return 1;
  }
  // フォールバック: priority 降順 → createdAt 昇順
  const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (pr !== 0) return pr;
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

/**
 * status 遷移に伴う startedAt / completedAt の自動記録 (T2 / 2026-06-10)。
 * 全 status 変更経路 (api changeTicketStatus / patchTicket / mcp status_change) で必ず通すこと。
 * 初回 in-progress 着手時のみ startedAt、初回 done 時のみ completedAt を刻む (再遷移では上書きしない)。
 */
export function applyStatusTransition(t: Ticket, to: Status, now: string): Ticket {
  const next: Ticket = { ...t, status: to, updatedAt: now };
  if (to === 'in-progress' && !t.startedAt) next.startedAt = now;
  if (to === 'done' && !t.completedAt) next.completedAt = now;
  return next;
}

/**
 * undefined フィールドをキーごと除去する (型はそのまま T)。
 *
 * 用途: memory backend の write 時 (`{ ...t }` の undefined を落として
 * Firestore の ignoreUndefinedProperties: true と shape を揃える)。
 * 戻り値は T のまま — 完全な entity を渡して同じ entity 型で受けるケース。
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

type NoUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * undefined フィールドを除去し、戻り値の型からも undefined union を外す。
 *
 * 用途: api handler の patch merge (`{ ...existing, ...stripUndefinedPartial(patch) }`)。
 * zod `.partial()` は `string | undefined` を返すため、そのまま spread すると
 * exactOptionalPropertyTypes に違反する。これで undefined を型レベルでも除去して安全に merge。
 */
export function stripUndefinedPartial<T extends Record<string, unknown>>(
  obj: T,
): Partial<NoUndefined<T>> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as Partial<NoUndefined<T>>;
}

/**
 * チケット / Epic 等の ID を採番する。`${prefix}-${ランダム 8 hex}` 形式 (例 `WC-345ab9ad`)。
 *
 * ランダム由来なので同一ミリ秒に連続採番しても衝突しない (旧実装は Date.now() base36 のみで
 * 同一 ms 衝突したため各所に回避ハックが要った)。8 hex = 約 43 億通りでデモ用途では実質衝突ゼロ。
 *
 * **長さは旧 base36 (`WC-MQB14T63` ≒ 11 字) と同等に保つ**: 一度フル UUID 36 字で採番したところ、
 * 長い id を持つチケット行で実マウス d&d (sections.spec の区画間移動) が CI で壊れる回帰が出た
 * (`.trow-id` 列 80px に収まらない長 id がレイアウト/ヒットテストに干渉した疑い)。短い id なら回避できる。
 *
 * Node 20.10+ / モダンブラウザ双方で `globalThis.crypto` が使える。このモジュールは
 * compareTicketOrder 経由で web client bundle にも入るため `node:crypto` は import しない。
 * Project.idPrefix からの連番採番 (例: BV-101 → BV-102) は Firestore トランザクションが要るため保留。
 *
 * @param prefix 'WC' (Task/Ticket) / 'EP' (Epic) / 'EST' 等
 */
export function generateId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
