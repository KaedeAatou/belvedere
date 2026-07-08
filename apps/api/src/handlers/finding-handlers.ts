// Phase 1-C findings handler (T4 / 2026-06-11)。
// ルールエンジン (packages/tools/ticket-rules.ts) を儀式単位で実行し、UI バッジ用に findings を返す。
// ticket-handlers.ts と同じ純粋関数 + workspaceId スコープのパターン。

import type { Ritual } from '@belvedere/shared';
import { runTicketRules, buildRuleContext, type TicketFinding } from '@belvedere/tools';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

const VALID_CEREMONIES: ReadonlyArray<Ritual> = [
  'planning',
  'daily',
  'refinement',
  'review',
  'retrospective',
];

/**
 * GET /api/findings?ceremony=refinement
 * workspace 内の tickets / sprints / estimations からルールを実行して findings を返す。
 * now はサーバ時刻を注入 (停滞・タイムボックス判定の基準)。
 */
export async function getFindings(
  repo: RepoContainer,
  ctx: HandlerContext,
  ceremonyRaw: string | undefined,
): Promise<HandlerResult<{ ceremony: Ritual; findingCount: number; findings: TicketFinding[] }>> {
  const ceremony = (ceremonyRaw ?? 'refinement') as Ritual;
  if (!VALID_CEREMONIES.includes(ceremony)) {
    return { ok: false, status: 400, body: { error: 'invalid_ceremony', details: VALID_CEREMONIES } };
  }
  const [tickets, sprints, estimations, epics] = await Promise.all([
    repo.tickets.list({ workspaceId: ctx.workspaceId }),
    repo.sprints.list({ workspaceId: ctx.workspaceId }),
    repo.estimations.list({ workspaceId: ctx.workspaceId }),
    repo.epics.list({ workspaceId: ctx.workspaceId }),
  ]);
  const ruleCtx = buildRuleContext(new Date().toISOString(), tickets, sprints, estimations, epics);
  const findings = runTicketRules(ceremony, ruleCtx);
  return { ok: true, status: 200, body: { ceremony, findingCount: findings.length, findings } };
}
