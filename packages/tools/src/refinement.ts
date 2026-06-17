// バックログリファインメント 6 観点診断の純粋関数 (2026-06-17)。
//
// 元は buildTools 内の backlogRefinementCheckTool に inline で書いていた 6 観点ロジックを
// 純粋関数に切り出した。これにより:
//   - Agent の Tool 経由 (packages/tools の backlogRefinementCheckTool)
//   - HTTP API 経由 (apps/api GET /api/refinement → MCP belvedere_refinement_check)
// が同じ診断ロジックを共有する。Belvedere の差別化機能 (リファインメント 6 観点) を
// MCP からも欠落なく使えるようにするため。
//
// runTicketRules('refinement') は種別ルール (TYPE_MISSING / STORY_DOD_* / BUG_* 等) のみで
// 6 観点は含まないので、両者を additive に合成する (元の tool と同じ構成)。

import type { Ticket, Epic, Sprint, EstimationSession } from '@belvedere/shared';
import { runTicketRules, buildRuleContext, type TicketFinding } from './ticket-rules';

export interface BacklogRefinementInput {
  /** workspace スコープ済の全 ticket (候補の絞り込みは filter 引数で内部実行) */
  tickets: Ticket[];
  /** workspace スコープ済の全 epic */
  epics: Epic[];
  sprints: Sprint[];
  estimations: EstimationSession[];
  /** ISO8601。呼出側が注入 (ルールエンジンの停滞・タイムボックス判定基準) */
  now: string;
}

export interface RefinementSignal {
  ticketId: string;
  signal: string;
  detail: string;
}

export interface BacklogRefinementResult {
  /** 6 観点の走査対象になった ticket 数 (filter 適用後) */
  scanned: number;
  /** 戦略意図観点の走査対象になった epic 数 (filter 適用後) */
  scannedEpics: number;
  findingCount: number;
  /** 6 観点 findings */
  findings: RefinementSignal[];
  /** 種別ルールエンジン由来 (ruleId / severity / action 付き)。全 ticket を対象に実行 */
  ruleFindings: TicketFinding[];
}

/**
 * バックログを 6 観点 (粒度過大 / 依存未整理 / valueImpact 未設定 / priority↔valueImpact /
 * SP 分散異常 / Epic.rationale 欠落) で診断し、種別ルールエンジンの findings も合成して返す。
 *
 * @param filter 候補チケット/Epic の絞り込み (sprintId / projectId)。省略時は workspace 全件。
 *               ※ ruleFindings は filter に関係なく workspace 全 ticket を対象にする (元の tool と同じ)。
 */
export function checkBacklogRefinement(
  input: BacklogRefinementInput,
  filter: { sprintId?: string; projectId?: string } = {},
): BacklogRefinementResult {
  const candidateTickets = input.tickets.filter(
    (t) =>
      (filter.sprintId === undefined || t.sprintId === filter.sprintId) &&
      (filter.projectId === undefined || t.projectId === filter.projectId),
  );
  const candidateEpics = input.epics.filter(
    (e) => filter.projectId === undefined || e.projectId === filter.projectId,
  );

  const findings: RefinementSignal[] = [];

  for (const t of candidateTickets) {
    if ((t.estimatePt ?? 0) > 8) {
      findings.push({
        ticketId: t.id,
        signal: 'oversize_story',
        detail: `Story Point ${t.estimatePt} (>8)。1スプリントに収まらない可能性、分割推奨。`,
      });
    }
    const hasBlockedBy = (t.blockedBy?.length ?? 0) > 0;
    const hasStoryLink = (t.parentTicketId ?? '').startsWith('US-');
    if (!hasBlockedBy && !hasStoryLink) {
      findings.push({
        ticketId: t.id,
        signal: 'unstructured_dependency',
        detail: 'blockedBy / parentTicketId (US-紐付け) のいずれも未設定。依存関係を整理してください。',
      });
    }
    if (t.valueImpact === undefined) {
      findings.push({
        ticketId: t.id,
        signal: 'value_impact_missing',
        detail: 'valueImpact (プロダクトゴール貢献度) が未設定。PO に確認推奨。',
      });
    }
    if (t.priority === 'urgent' && t.valueImpact === 'low') {
      findings.push({
        ticketId: t.id,
        signal: 'priority_value_mismatch',
        detail: 'priority=urgent だが valueImpact=low。緊急度の根拠を確認。',
      });
    }
    if (t.priority === 'low' && t.valueImpact === 'high') {
      findings.push({
        ticketId: t.id,
        signal: 'priority_value_mismatch',
        detail: 'priority=low だが valueImpact=high。プロダクトゴール直結なので priority 引き上げ推奨。',
      });
    }
    if (t.priority === 'medium' && t.valueImpact === 'high') {
      findings.push({
        ticketId: t.id,
        signal: 'priority_value_mismatch_soft',
        detail: 'priority=medium だが valueImpact=high。プロダクトゴール貢献度の高さに比して優先度が低い可能性。',
      });
    }
  }

  // SP 分散異常 (候補チケット単位)
  if (candidateTickets.length >= 3) {
    const pts = candidateTickets.map((t) => t.estimatePt ?? 0).filter((p) => p > 0);
    if (pts.length >= 3) {
      const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
      const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length;
      const stddev = Math.sqrt(variance);
      const cv = mean > 0 ? stddev / mean : 0;
      if (cv > 0.6) {
        findings.push({
          ticketId: '*',
          signal: 'sp_variance_high',
          detail: `Story Point の分散が大きい (CV=${cv.toFixed(2)})。粒度差を再見積推奨。`,
        });
      }
    }
  }

  // 第6観点: 戦略整合性 — Epic.rationale (戦略意図 / Why) が空のものを警告
  for (const e of candidateEpics) {
    if (!e.rationale || e.rationale.trim().length === 0) {
      findings.push({
        ticketId: e.id,
        signal: 'strategic_intent_missing',
        detail: `Epic ${e.id} (${e.name}) に rationale (戦略意図 / Why) が未設定。配下のチケットが「何のために?」を見失う形骸化サイン。`,
      });
    }
  }

  // 種別ルールエンジン (refinement) は workspace 全 ticket を対象に実行して additive に合成する。
  const ruleCtx = buildRuleContext(input.now, input.tickets, input.sprints, input.estimations);
  const ruleFindings = runTicketRules('refinement', ruleCtx);

  return {
    scanned: candidateTickets.length,
    scannedEpics: candidateEpics.length,
    findingCount: findings.length,
    findings,
    ruleFindings,
  };
}
