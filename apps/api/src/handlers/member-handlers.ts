// Phase 1-C Member handler (2026-06-11)。
// displayName 変更を「自分自身の Member だけ」許可する。role / workspaceId / userId / email は不変。
// ticket-handlers.ts と同じ純粋関数 + IDOR ガード + zod 検証パターン。

import { z } from 'zod';
import type { Member } from '@belvedere/shared';
import { stripUndefinedPartial } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

export const MemberPatchBodySchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
});

/**
 * GET /api/me — ログイン中ユーザ自身の Member を返す。
 * workspaceMiddleware が確定した workspaceId スコープで repo.members.get を引く。
 *
 * 注意: workspaceMiddleware の bootstrap 経路 (email-allowlist.ts) で
 * 既に upsert されているので、ここでは null になるケースは原則ない。
 * ただし bootstrap 直後 → 同リクエスト内で get は race 無し、別リクエストでは
 * eventual consistency (firestore) でズレうるので null 時は 404 を返す。
 */
export async function getMe(
  repo: RepoContainer,
  ctx: HandlerContext,
): Promise<HandlerResult<Member>> {
  // 複合キー (workspaceId, userId) でスコープ取得する。複合キー化前は workspaceId を
  // 無視して「唯一の member doc」を返していた = 別 ws の所属を取り違える潜在バグだった。
  const me = await repo.members.get(ctx.workspaceId, ctx.user.userId);
  if (!me) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  // get が複合キーでスコープ済なので workspaceId は必ず一致するが、データ破損の保険で照合を残す。
  if (me.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  return { ok: true, status: 200, body: me };
}

/**
 * PATCH /api/members/:userId — displayName のみ変更可。
 *
 * セキュリティ:
 * - 編集対象は自分自身のみ (ctx.user.userId === paramUserId)。他人の改変は 404 扱い
 *   (権限ない情報を漏らさないため 403 ではなく 404 で「存在しない」を返す)
 * - role / workspaceId / userId / email は body から上書き不可 (不変フィールド)
 * - IDOR: 別 workspace の member もここでは触らせない
 */
export async function patchMember(
  repo: RepoContainer,
  ctx: HandlerContext,
  paramUserId: string,
  body: unknown,
): Promise<HandlerResult<Member>> {
  // 他人の member 編集禁止 (Phase 1-E 招待 UI で role 変更を追加する時は、
  // 別 endpoint POST /api/members/:userId/role で owner 限定にする想定)。
  if (paramUserId !== ctx.user.userId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const existing = await repo.members.get(ctx.workspaceId, paramUserId);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const parsed = MemberPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const updated: Member = {
    ...existing,
    ...stripUndefinedPartial(parsed.data),
    userId: existing.userId,             // 不変
    workspaceId: existing.workspaceId,   // 不変
    email: existing.email,               // 不変
    role: existing.role,                 // 不変 (招待 UI Phase 1-E まで)
  };
  await repo.members.upsert(updated);
  return { ok: true, status: 200, body: updated };
}
