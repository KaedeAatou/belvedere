// Phase 1-C 見積もりポーカー handler (T6 / 2026-06-11)。
// 隠蔽投票 → 一斉開示 → 採用。隠蔽はサーバ側で強制する (§4-3): voting 中の GET は
// 他人の value を一切返さない。開示/採用は owner/sm/po のみ。
// ticket-handlers と同じ純粋関数 + workspaceId IDOR ガードのパターン。

import { z } from 'zod';
import type { EstimationSession, EstimationValue } from '@belvedere/shared';
import { FIBONACCI_POINTS, generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

const PRIVILEGED: ReadonlyArray<string> = ['owner', 'sm', 'po'];
/** voting / revealed = まだ生きているセッション (adopted / discarded は終了済) */
const ACTIVE_STATUS: ReadonlyArray<EstimationSession['status']> = ['voting', 'revealed'];

const VoteBodySchema = z.object({
  value: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8), z.literal(13), z.literal('?'),
  ]),
});
const AdoptBodySchema = z.object({
  value: z.number().refine((v) => (FIBONACCI_POINTS as readonly number[]).includes(v), 'must be a fibonacci point'),
});

// ------- 隠蔽シリアライズ (§4-3) -------

type VotingView = { status: 'voting'; myVote: EstimationValue | null; votedUserIds: string[]; voteCount: number };
type RevealedView = {
  status: 'revealed' | 'adopted' | 'discarded';
  votes: { userId: string; value: EstimationValue }[];
  adoptedValue?: number;
  revealedAt?: string;
};
export type EstimationView = VotingView | RevealedView;

/** viewer から見えるセッション表現。voting 中は他人の value をレスポンスに含めない (フロント改造でも漏れない)。 */
export function serializeForViewer(s: EstimationSession, viewerUserId: string): EstimationView {
  if (s.status === 'voting') {
    const mine = s.votes.find((v) => v.userId === viewerUserId);
    return {
      status: 'voting',
      myVote: mine ? mine.value : null,
      votedUserIds: s.votes.map((v) => v.userId),
      voteCount: s.votes.length,
    };
  }
  return {
    status: s.status,
    votes: s.votes.map((v) => ({ userId: v.userId, value: v.value })),
    ...(s.adoptedValue !== undefined && { adoptedValue: s.adoptedValue }),
    ...(s.revealedAt !== undefined && { revealedAt: s.revealedAt }),
  };
}

// ------- 共通ガード -------

async function ensureTicket(repo: RepoContainer, ctx: HandlerContext, ticketId: string) {
  const t = await repo.tickets.get(ticketId);
  if (!t || t.workspaceId !== ctx.workspaceId) return null; // IDOR: 別 workspace は「無い」
  return t;
}
function isPrivileged(ctx: HandlerContext): boolean {
  return !!ctx.role && PRIVILEGED.includes(ctx.role);
}
async function activeSession(repo: RepoContainer, ctx: HandlerContext, ticketId: string): Promise<EstimationSession | null> {
  const list = await repo.estimations.list({ workspaceId: ctx.workspaceId, ticketId });
  return list.find((s) => ACTIVE_STATUS.includes(s.status)) ?? null;
}

// ------- handlers -------

/** POST /api/tickets/:id/estimation — owner/sm/po。voting 中があれば 409、revealed 残存は discard して新規。 */
export async function startEstimation(
  repo: RepoContainer,
  ctx: HandlerContext,
  ticketId: string,
  now: string,
): Promise<HandlerResult<EstimationView>> {
  if (!(await ensureTicket(repo, ctx, ticketId))) return { ok: false, status: 404, body: { error: 'not_found' } };
  if (!isPrivileged(ctx)) return { ok: false, status: 403, body: { error: 'forbidden' } };

  const existing = await activeSession(repo, ctx, ticketId);
  if (existing?.status === 'voting') {
    return { ok: false, status: 409, body: { error: 'voting_already_in_progress' } };
  }
  if (existing?.status === 'revealed') {
    await repo.estimations.upsert({ ...existing, status: 'discarded' });
  }
  const session: EstimationSession = {
    id: generateId('EST'),
    workspaceId: ctx.workspaceId,
    ticketId,
    status: 'voting',
    votes: [],
    createdAt: now,
    createdBy: ctx.user.userId,
  };
  await repo.estimations.upsert(session);
  return { ok: true, status: 201, body: serializeForViewer(session, ctx.user.userId) };
}

/** GET /api/tickets/:id/estimation — member。アクティブセッションを隠蔽形式で返す。 */
export async function getEstimation(
  repo: RepoContainer,
  ctx: HandlerContext,
  ticketId: string,
): Promise<HandlerResult<EstimationView>> {
  if (!(await ensureTicket(repo, ctx, ticketId))) return { ok: false, status: 404, body: { error: 'not_found' } };
  const s = await activeSession(repo, ctx, ticketId);
  if (!s) return { ok: false, status: 404, body: { error: 'no_active_session' } };
  return { ok: true, status: 200, body: serializeForViewer(s, ctx.user.userId) };
}

/** PUT /api/tickets/:id/estimation/vote — member。自分の票を upsert。revealed 後は 409。 */
export async function voteEstimation(
  repo: RepoContainer,
  ctx: HandlerContext,
  ticketId: string,
  body: unknown,
  now: string,
): Promise<HandlerResult<EstimationView>> {
  if (!(await ensureTicket(repo, ctx, ticketId))) return { ok: false, status: 404, body: { error: 'not_found' } };
  const s = await activeSession(repo, ctx, ticketId);
  if (!s) return { ok: false, status: 404, body: { error: 'no_active_session' } };
  if (s.status !== 'voting') return { ok: false, status: 409, body: { error: 'voting_closed' } };
  const parsed = VoteBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };

  const others = s.votes.filter((v) => v.userId !== ctx.user.userId);
  const updated: EstimationSession = {
    ...s,
    votes: [...others, { userId: ctx.user.userId, value: parsed.data.value, submittedAt: now }],
  };
  await repo.estimations.upsert(updated);
  return { ok: true, status: 200, body: serializeForViewer(updated, ctx.user.userId) };
}

/** POST /api/tickets/:id/estimation/reveal — owner/sm/po。投票 0 件なら 409。 */
export async function revealEstimation(
  repo: RepoContainer,
  ctx: HandlerContext,
  ticketId: string,
  now: string,
): Promise<HandlerResult<EstimationView>> {
  if (!(await ensureTicket(repo, ctx, ticketId))) return { ok: false, status: 404, body: { error: 'not_found' } };
  if (!isPrivileged(ctx)) return { ok: false, status: 403, body: { error: 'forbidden' } };
  const s = await activeSession(repo, ctx, ticketId);
  if (!s || s.status !== 'voting') return { ok: false, status: 404, body: { error: 'no_voting_session' } };
  if (s.votes.length === 0) return { ok: false, status: 409, body: { error: 'no_votes' } };
  const updated: EstimationSession = { ...s, status: 'revealed', revealedAt: now };
  await repo.estimations.upsert(updated);
  return { ok: true, status: 200, body: serializeForViewer(updated, ctx.user.userId) };
}

/** POST /api/tickets/:id/estimation/adopt — owner/sm/po。ticket.estimatePt を更新しセッションを adopted に。 */
export async function adoptEstimation(
  repo: RepoContainer,
  ctx: HandlerContext,
  ticketId: string,
  body: unknown,
  now: string,
): Promise<HandlerResult<{ ticketId: string; adoptedValue: number }>> {
  const ticket = await ensureTicket(repo, ctx, ticketId);
  if (!ticket) return { ok: false, status: 404, body: { error: 'not_found' } };
  if (!isPrivileged(ctx)) return { ok: false, status: 403, body: { error: 'forbidden' } };
  const s = await activeSession(repo, ctx, ticketId);
  if (!s || s.status !== 'revealed') return { ok: false, status: 409, body: { error: 'not_revealed' } };
  const parsed = AdoptBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };

  await repo.estimations.upsert({ ...s, status: 'adopted', adoptedValue: parsed.data.value, adoptedAt: now });
  await repo.tickets.upsert({ ...ticket, estimatePt: parsed.data.value, updatedAt: now });
  return { ok: true, status: 200, body: { ticketId, adoptedValue: parsed.data.value } };
}
