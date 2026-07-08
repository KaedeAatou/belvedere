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

// ===== 観点ごとの純粋関数 (退化入力を最安レイヤで直接テストできるよう分離 / R2-F・2026-06-18) =====
//
// per-ticket 観点 (1〜4) は単一 Ticket を受けて 0/1 件の signal を返す。checkBacklogRefinement が
// 候補チケットをループしながら順に呼ぶことで「ticket ごとにグループ化された」元の出力順を保つ。
// SP 分散 (5) は候補集合全体、戦略意図 (6) は単一 Epic を受ける。各関数は self-contained で互いに
// 結果を参照しない (additive 合成可能)。detail 文言は外部契約 (API/MCP/Mock 応答) のため不変。

/** 観点1: 粒度過大 (Story Point > 8)。 */
export function detectOversizeStory(t: Ticket): RefinementSignal[] {
  if ((t.estimatePt ?? 0) > 8) {
    return [{
      ticketId: t.id,
      signal: 'oversize_story',
      detail: `Story Point ${t.estimatePt} (>8)。1スプリントに収まらない可能性、分割推奨。`,
    }];
  }
  return [];
}

/** 観点2: 依存未整理 (blockedBy も 親紐付けも無い孤立チケット)。
 *  親紐付けの基準は種別で異なる (F-11 category confusion 修正 / 2026-07-08):
 *    - story は epicId (親 Epic) に紐付くのが正しく、別 story (parentTicketId) には紐付かない。
 *      旧実装は story にも US- 紐付けを求め「Story を User Story に紐付けよ」という誤指摘を出していた。
 *    - task / spike / bug は parentTicketId (親 Story = US- 形式 or WC-story) に紐付く。
 *      旧実装は US- 前方一致のみ親と認め、WC-story を親に持つ task も誤警告していた。 */
export function detectUnstructuredDependency(t: Ticket): RefinementSignal[] {
  const hasBlockedBy = (t.blockedBy?.length ?? 0) > 0;
  const hasParentLink =
    t.type === 'story' ? !!t.epicId : (t.parentTicketId ?? '').length > 0;
  if (!hasBlockedBy && !hasParentLink) {
    const detail =
      t.type === 'story'
        ? 'blockedBy も 親 Epic (epicId) も未設定。親 Epic への紐付けと依存関係を整理してください。'
        : 'blockedBy / 親 Story (parentTicketId) のいずれも未設定。依存関係を整理してください。';
    return [{ ticketId: t.id, signal: 'unstructured_dependency', detail }];
  }
  return [];
}

/** 観点3: valueImpact 未設定。 */
export function detectValueImpactMissing(t: Ticket): RefinementSignal[] {
  if (t.valueImpact === undefined) {
    return [{
      ticketId: t.id,
      signal: 'value_impact_missing',
      detail: 'valueImpact (プロダクトゴール貢献度) が未設定。PO に確認推奨。',
    }];
  }
  return [];
}

/** 観点4: priority × valueImpact ミスマッチ (priority は排他なので 0/1 件)。 */
export function detectPriorityValueMismatch(t: Ticket): RefinementSignal[] {
  if (t.priority === 'urgent' && t.valueImpact === 'low') {
    return [{
      ticketId: t.id,
      signal: 'priority_value_mismatch',
      detail: 'priority=urgent だが valueImpact=low。緊急度の根拠を確認。',
    }];
  }
  if (t.priority === 'low' && t.valueImpact === 'high') {
    return [{
      ticketId: t.id,
      signal: 'priority_value_mismatch',
      detail: 'priority=low だが valueImpact=high。プロダクトゴール直結なので priority 引き上げ推奨。',
    }];
  }
  if (t.priority === 'medium' && t.valueImpact === 'high') {
    return [{
      ticketId: t.id,
      signal: 'priority_value_mismatch_soft',
      detail: 'priority=medium だが valueImpact=high。プロダクトゴール貢献度の高さに比して優先度が低い可能性。',
    }];
  }
  return [];
}

/** 観点5: SP 分散異常 (候補集合全体の変動係数 CV>0.6)。SP>0 が 3 件未満なら判定不能で空。 */
export function detectSpVariance(candidateTickets: Ticket[]): RefinementSignal[] {
  if (candidateTickets.length < 3) return [];
  const pts = candidateTickets.map((t) => t.estimatePt ?? 0).filter((p) => p > 0);
  if (pts.length < 3) return [];
  const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
  const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;
  if (cv > 0.6) {
    return [{
      ticketId: '*',
      signal: 'sp_variance_high',
      detail: `Story Point の分散が大きい (CV=${cv.toFixed(2)})。粒度差を再見積推奨。`,
    }];
  }
  return [];
}

/** 観点6: 戦略整合性 — Epic.rationale (戦略意図 / Why) が空。 */
export function detectStrategicIntentMissing(e: Epic): RefinementSignal[] {
  if (!e.rationale || e.rationale.trim().length === 0) {
    return [{
      ticketId: e.id,
      signal: 'strategic_intent_missing',
      detail: `Epic ${e.id} (${e.name}) に rationale (戦略意図 / Why) が未設定。配下のチケットが「何のために?」を見失う形骸化サイン。`,
    }];
  }
  return [];
}

/**
 * バックログを 6 観点 (粒度過大 / 依存未整理 / valueImpact 未設定 / priority↔valueImpact /
 * SP 分散異常 / Epic.rationale 欠落) で診断し、種別ルールエンジンの findings も合成して返す。
 *
 * 6 観点は上の detect* 純粋関数を **元の出力順どおり** に additive 合成するだけ:
 * 候補チケットを 1 件ずつ観点1→4 の順に診断 (ticket グループ化) → SP 分散 → 候補 Epic の戦略意図。
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
  // per-ticket 観点 (1〜4) を ticket ごとにまとめて push (元の出力順を保持)。
  for (const t of candidateTickets) {
    findings.push(
      ...detectOversizeStory(t),
      ...detectUnstructuredDependency(t),
      ...detectValueImpactMissing(t),
      ...detectPriorityValueMismatch(t),
    );
  }
  // 観点5: SP 分散 (候補集合単位) → 観点6: 戦略意図 (Epic 単位)。
  findings.push(...detectSpVariance(candidateTickets));
  for (const e of candidateEpics) {
    findings.push(...detectStrategicIntentMissing(e));
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
