// Workspace 管理ハンドラ (Phase 1-E 前倒し / 2026-06-12)。
//
// a社/b社単位の管理者画面、および c社 Workspace を 0 から作ってドッグフードするための入口。
// ticket-handlers.ts と同じ設計方針 (純粋関数 + IDOR ガード + zod 検証 + role ゲート)。
//
// 重要な前提:
// - POST/GET /api/workspaces は「所属 Workspace ゼロ」でも呼べる (workspaceMiddleware を skip)。
//   よって createWorkspace / listMyWorkspaces は ctx.workspaceId / ctx.role に依存しない。
//   認証 (ctx.user) のみ必須。
// - inviteMember / cancelInvite は workspaceMiddleware を通った後 (= 所属 ws 確定済) に呼ばれ、
//   ctx.workspaceId / ctx.role を使う。

import { z } from 'zod';
import type { Member, Workspace, WorkspaceRole } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerResult } from './ticket-handlers';
import { inviteSentinelId, isInviteSentinel } from '../config/invite-bind';
import { can, forbidden } from '../permissions';

/** workspace 未確定でも呼べるハンドラ用の最小 ctx (認証のみ)。 */
export interface AuthCtx {
  user: { userId: string; email: string };
}

/** workspace 確定後に呼ばれるハンドラ用の ctx。 */
export interface WorkspaceCtx extends AuthCtx {
  workspaceId: string;
  role?: WorkspaceRole;
}

// ------- body schema -------

export const WorkspaceCreateBodySchema = z.object({
  name: z.string().min(1, 'name is required').max(80),
  productGoal: z.string().max(280).optional(),
});

// PATCH /api/workspaces/:id body — 今は productGoal のみ編集可 (Product Goal / WC-23)。
export const WorkspacePatchBodySchema = z.object({
  productGoal: z.string().max(280),
});

// admin は招待で付与できない (workspace 作成者だけが admin になる設計)。
export const InviteBodySchema = z.object({
  email: z.string().email('valid email is required'),
  role: z.enum(['po', 'sm', 'dev']),
  displayName: z.string().min(1).max(80).optional(),
});

// ------- helpers -------

/** email の local part を displayName のデフォルトに使う (例: a@b.com → a)。 */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** name から slug を作る (英数字 + ハイフン、小文字)。空になる場合は乱数 fallback。 */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : Math.random().toString(36).slice(2, 8);
}

// ------- handlers -------

/**
 * POST /api/workspaces — 新規 Workspace を作成し、作成者を owner として Member 登録する。
 * 所属 Workspace ゼロでも呼べる (workspaceMiddleware skip)。認証のみ必須。
 *
 * id は `ws-<slug>`。slug が既存 Workspace と衝突する場合は generateId サフィックスで一意化。
 */
export async function createWorkspace(
  repo: RepoContainer,
  ctx: AuthCtx,
  body: unknown,
): Promise<HandlerResult<{ workspace: Workspace; member: Member }>> {
  const parsed = WorkspaceCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const slug = slugify(parsed.data.name);
  let id = `ws-${slug}`;
  // slug 衝突は乱数サフィックスで回避 (seed ws-belvedere や既存ユーザ作成分との衝突対策)。
  // workspace id は人が見るため UUID 全体ではなく先頭 8 hex に短縮する。
  if (await repo.workspaces.get(id)) {
    id = `ws-${slug}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id,
    name: parsed.data.name,
    slug,
    productGoal: parsed.data.productGoal ?? '',
    ownerId: ctx.user.userId,
    createdAt: now,
  };
  await repo.workspaces.upsert(workspace);

  const member: Member = {
    userId: ctx.user.userId,
    workspaceId: id,
    email: ctx.user.email,
    displayName: localPart(ctx.user.email),
    // 作成者は admin (= その workspace でなんでもできる / 全 action bypass)。
    role: 'admin',
  };
  await repo.members.upsert(member);

  return { ok: true, status: 201, body: { workspace, member } };
}

/** listMyWorkspaces の 1 要素。Workspace doc が無い既存 ws も name フォールバックで返す。 */
export interface MyWorkspace {
  id: string;
  name: string;
  /** ログインユーザの当該 ws での role (UI の管理操作可否判定に使う)。 */
  role: Member['role'];
  /** Workspace の Product Goal (WC-23)。doc が無い既存 ws は空文字。 */
  productGoal: string;
}

/**
 * GET /api/workspaces — ログインユーザが Member である全 Workspace を返す。
 * 所属 Workspace ゼロでも呼べる (workspaceMiddleware skip)。認証のみ必須。
 *
 * members を userId で横断検索 → その workspaceId 群の Workspace doc を引く。
 * Workspace doc が無い既存 ws (seed の ws-belvedere 等) は { id, name: id } で
 * フォールバック (壊さない)。招待センチネル (`invite:<email>`) は userId が実 uid と
 * 一致しないので listByUserId には引っかからない (= 招待中の人には表示されない)。
 */
export async function listMyWorkspaces(
  repo: RepoContainer,
  ctx: AuthCtx,
): Promise<HandlerResult<MyWorkspace[]>> {
  const memberships = await repo.members.listByUserId(ctx.user.userId);
  const ids = memberships.map((m) => m.workspaceId);
  const docs = await repo.workspaces.listByIds(ids);
  const byId = new Map(docs.map((w) => [w.id, w]));

  // workspaceId 昇順で決定的に並べる。web (useWorkspaces) は先頭を既定 currentId に
  // するため、listByUserId の非決定的順だと既定 Workspace がブレる (workspaceMiddleware の
  // 既定選択と同じ規則に揃える)。
  const result: MyWorkspace[] = memberships
    .map((m) => ({
      id: m.workspaceId,
      name: byId.get(m.workspaceId)?.name ?? m.workspaceId,
      role: m.role,
      productGoal: byId.get(m.workspaceId)?.productGoal ?? '',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, status: 200, body: result };
}

/**
 * POST /api/workspaces/members/invite — 当該 Workspace にメンバーを招待する。
 * member.invite (PO/SM/admin) のみ実行可。admin role での招待は不可 (作成者のみが admin)。
 * 同 email が当該 ws に既存 (招待中含む) なら 409。
 *
 * Member doc を userId=`invite:<email>` のセンチネルで事前作成する。招待された人が
 * 初回ログインすると workspaceMiddleware が email 一致で bind する (invite-bind.ts)。
 */
export async function inviteMember(
  repo: RepoContainer,
  ctx: WorkspaceCtx,
  body: unknown,
): Promise<HandlerResult<Member>> {
  if (!can('member.invite', ctx)) {
    return { ok: false, status: 403, body: forbidden('member.invite') };
  }
  const parsed = InviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const email = parsed.data.email.toLowerCase();

  // 同 ws に同 email が既存 (招待中 or 加入済) なら 409。
  const existing = await repo.members.list({ workspaceId: ctx.workspaceId });
  if (existing.some((m) => m.email.toLowerCase() === email)) {
    return { ok: false, status: 409, body: { error: 'already_member' } };
  }

  const member: Member = {
    userId: inviteSentinelId(ctx.workspaceId, email),
    workspaceId: ctx.workspaceId,
    email,
    displayName: parsed.data.displayName ?? localPart(email),
    role: parsed.data.role,
  };
  await repo.members.upsert(member);
  return { ok: true, status: 201, body: member };
}

/**
 * DELETE /api/workspaces/members/:userId — 招待を取り消す。
 * member.invite (PO/SM/admin) のみ。招待センチネル (`invite:` 始まり) のみ削除可能 (加入済メンバーの
 * 退会は別途 Phase で扱う。ここで実 uid を消すと自分を消す事故が起きうるため塞ぐ)。
 * IDOR: 別 ws の Member は 404 扱い。
 */
export async function cancelInvite(
  repo: RepoContainer,
  ctx: WorkspaceCtx,
  paramUserId: string,
): Promise<HandlerResult<{ deleted: string }>> {
  if (!can('member.invite', ctx)) {
    return { ok: false, status: 403, body: forbidden('member.invite') };
  }
  // paramUserId は招待センチネル userId。複合キー = `${ctx.workspaceId}:${paramUserId}`。
  const existing = await repo.members.get(ctx.workspaceId, paramUserId);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  if (!isInviteSentinel(existing)) {
    // 加入済メンバーの削除はここでは許さない (招待取消専用)。
    return { ok: false, status: 409, body: { error: 'not_a_pending_invite' } };
  }
  await repo.members.delete(ctx.workspaceId, paramUserId);
  return { ok: true, status: 200, body: { deleted: paramUserId } };
}

/**
 * PATCH /api/workspaces/:id — Workspace の Product Goal を編集する (WC-23)。
 * product.goal (PO/admin) のみ。IDOR: 認証で確定した ctx.workspaceId 以外の id は 404。
 * 現状は productGoal のみ編集可 (name/slug/owner は別 Phase)。
 */
export async function patchWorkspace(
  repo: RepoContainer,
  ctx: WorkspaceCtx,
  id: string,
  body: unknown,
): Promise<HandlerResult<Workspace>> {
  // IDOR: 自分が認証された workspace 以外は編集させない (別 ws の id は「存在しない」扱い)。
  if (id !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  if (!can('product.goal', ctx)) {
    return { ok: false, status: 403, body: forbidden('product.goal') };
  }
  const parsed = WorkspacePatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const existing = await repo.workspaces.get(id);
  if (!existing) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const updated: Workspace = { ...existing, productGoal: parsed.data.productGoal };
  await repo.workspaces.upsert(updated);
  return { ok: true, status: 200, body: updated };
}
