// 共通ユーティリティ (2026-06-10 / R2 重複排除で新設)。
// repo backend と api handler に重複していた stripUndefined、
// および 3 箇所に散っていた ID 採番ロジックをここに集約する。

import type { Priority, Status, Ticket } from './types';

/** priority 降順用の重み (urgent が最も先頭)。フォールバックソートで使う。 */
const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

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
 * チケット / Epic 等の ID を採番する。`${prefix}-${UUID v4}` 形式。
 *
 * 衝突確率は実質ゼロ (Web Crypto randomUUID)。同一ミリ秒に連続採番しても安全なので、
 * 呼び出し側で番号やインデックスを混ぜて衝突回避する必要はない (旧実装は Date.now()
 * base36 のみで同一 ms 衝突したため各所に回避ハックが要った)。
 * Node 20.10+ / モダンブラウザ双方で `globalThis.crypto` が使える。このモジュールは
 * compareTicketOrder 経由で web client bundle にも入るため `node:crypto` は import しない。
 *
 * Project.idPrefix からの連番採番 (例: BV-101 → BV-102) は Firestore トランザクションが
 * 要るためパーキングロット。
 *
 * @param prefix 'WC' (Task/Ticket) / 'EP' (Epic) / 'EST' 等
 */
export function generateId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
