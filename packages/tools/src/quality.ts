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
  /** 0..1。title/DoD/SP/親紐付けの 4 軸の充足率 */
  qualityRate: number;
  /** issues が 0 件なら true */
  ok: boolean;
}

/**
 * チケット品質診断。Definition of Done (acceptanceCriteria) / Story Point (estimatePt) /
 * 親紐付けの不足を検出する純粋関数。
 * 親紐付けの基準は種別で異なる (F-07/F-11 category confusion 修正 / 2026-07-08):
 *   - story は親 Epic (epicId) に紐付く。story は User Story そのものなので「別の User Story へ
 *     紐付けよ」とは指摘しない (旧実装は全種別に parentTicketId の US- 前方一致を求め、全 story を
 *     「User Story 紐付けなし」と誤指摘していた = ドッグフード F-07 の真因)。
 *   - task / spike / bug / incident は親 Story (parentTicketId / US- でも WC- 形式でも可) に紐付く。
 */
export function checkTicketQuality(t: Ticket): TicketQualityResult {
  const issues: string[] = [];
  if (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0) {
    issues.push('DoD (acceptanceCriteria) が空');
  }
  if (t.estimatePt === undefined) {
    issues.push('Story Point (estimatePt) 未定');
  }
  // 親紐付け: story は epicId (親 Epic)、それ以外は parentTicketId (親 Story) の有無で判定。
  const hasParentLink = t.type === 'story' ? !!t.epicId : (t.parentTicketId ?? '').length > 0;
  if (!hasParentLink) {
    issues.push(t.type === 'story' ? '親 Epic 紐付けなし' : '親 Story 紐付けなし');
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
