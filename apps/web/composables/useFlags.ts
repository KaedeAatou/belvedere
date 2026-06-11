// 暫定フラグ計算ヘルパ (Phase 1-C / R3 / 2026-06-11)。
//
// shared Ticket から既存 FLAG_DEFS の key を算出する。Designer 由来の DemoTicket.flags
// (静的配列) を置き換える橋渡し。FlagPill / FLAG_DEFS の見た目はそのまま温存する。
//
// ⚠ これは暫定実装。T5-3 で GET /api/findings (ルールエンジン 17 ルール) に差し替え、
//   本ファイルと FlagPill の flags ベース表示は削除する。それまでの繋ぎ。

import type { Ticket } from '@belvedere/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * shared Ticket から FLAG_DEFS の key 配列を算出する。
 * 算出する key: no-points / no-acceptance / oversized / stale / long-doing / missing-owner
 * (DemoTicket にあった no-actor 等は shared Ticket に対応フィールドが無いため算出しない)
 */
export function computeLocalFlags(t: Ticket, now: number = Date.now()): string[] {
  const flags: string[] = [];
  const estimatePt = t.estimatePt;
  const hasAcceptance = Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0;

  if (t.type === 'story' && (estimatePt === undefined || estimatePt === null)) flags.push('no-points');
  if (!hasAcceptance) flags.push('no-acceptance');
  if (estimatePt !== undefined && estimatePt > 8) flags.push('oversized');
  if (now - Date.parse(t.updatedAt) > 7 * DAY_MS) flags.push('stale');
  if (t.status === 'in-progress' && t.startedAt && now - Date.parse(t.startedAt) > 2 * DAY_MS) flags.push('long-doing');
  if (!t.assigneeId && t.sprintId) flags.push('missing-owner');

  return flags;
}

export const useFlags = () => ({ computeLocalFlags });
