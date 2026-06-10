// 共通ユーティリティ (2026-06-10 / R2 重複排除で新設)。
// repo backend と api handler に重複していた stripUndefined、
// および 3 箇所に散っていた ID 採番ロジックをここに集約する。

import type { Status, Ticket } from './types';

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
 * チケット / Epic 等の ID を採番する。`${prefix}-${base36 timestamp}` 形式。
 *
 * 現状は時刻ベースの衝突回避のみ (現挙動維持)。Project.idPrefix からの連番採番
 * (例: BV-101 → BV-102) は Firestore トランザクションが要るためパーキングロット。
 *
 * @param prefix 'WC' (Task/Ticket) / 'EP' (Epic) / 'EST' 等
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}
