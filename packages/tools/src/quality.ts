// チケット品質診断の純粋関数 (2026-06-17)。
//
// 元は buildTools 内の ticketQualityCheckTool に inline で書いていたロジックを、
// 純粋関数として切り出した。これにより:
//   - Agent の Tool 経由 (packages/tools の ticketQualityCheckTool)
//   - HTTP API 経由 (apps/api GET /api/tickets/:id/quality → MCP belvedere_quality_check)
// の両方が「単一ソースの同じ診断ロジック」を使う。診断基準のドリフトを防ぐ。
//
// IDOR ガード (別 workspace の ticket を弾く) は呼び出し側の責務 (ここは ticket 単体の純粋判定)。

import type { Ticket } from '@belvedere/shared';

export interface TicketQualityResult {
  ticketId: string;
  title: string;
  /** 検出された不足項目 (人間可読の日本語メッセージ) */
  issues: string[];
  /** 0..1。title/DoD/SP/US 紐付けの 4 軸の充足率 */
  qualityRate: number;
  /** issues が 0 件なら true */
  ok: boolean;
}

/**
 * チケット品質診断。Definition of Done (acceptanceCriteria) / Story Point (estimatePt) /
 * User Story 紐付け (parentTicketId が US- 始まり) の不足を検出する純粋関数。
 */
export function checkTicketQuality(t: Ticket): TicketQualityResult {
  const issues: string[] = [];
  if (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0) {
    issues.push('DoD (acceptanceCriteria) が空');
  }
  if (t.estimatePt === undefined) {
    issues.push('Story Point (estimatePt) 未定');
  }
  // User Story 紐付けは parentTicketId が US- で始まるかで判定 (将来は専用フィールド)
  const hasStoryLink = (t.parentTicketId ?? '').startsWith('US-');
  if (!hasStoryLink) {
    issues.push('User Story 紐付けなし');
  }
  const qualityRate = (4 - issues.length - (t.title ? 0 : 1)) / 4;
  return {
    ticketId: t.id,
    title: t.title,
    issues,
    qualityRate: Math.max(0, qualityRate),
    ok: issues.length === 0,
  };
}
