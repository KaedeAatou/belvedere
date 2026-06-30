// Phase 1-C Ticket CRUD ハンドラ (2026-06-11)。
//
// 設計方針:
// - 純粋関数として書く (repo / user 情報 / body を受け取り、ステータス + JSON を返す)
//   → Hono context への依存を最小化し、vitest で repo モック + 直接呼出のみで test 可能。
// - workspaceId / createdBy は API caller が認証経由で確定したものを使う
//   (LLM / 攻撃者がリクエスト body 経由で偽装するのを防ぐ)。
// - zod でリクエスト body 検証 (Phase 1-B で導入した shared/schemas.ts を再利用)
// - IDOR ガード: get → workspaceId 照合、別 workspace のものは 404 扱い

import { z } from 'zod';
import type { Status, Ticket, WorkspaceRole } from '@belvedere/shared';
import {
  PrioritySchema,
  RitualSchema,
  StatusSchema,
  ValueImpactSchema,
  TicketTypeSchema,
  stripUndefinedPartial,
  generateId,
  applyStatusTransition,
  computeReorderUpdates,
} from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import { can, forbidden } from '../permissions';

export interface HandlerContext {
  workspaceId: string;
  /** authMiddleware で確定したログインユーザ (createdBy 採番 + audit 用) */
  user: { userId: string; email: string };
  /** workspaceMiddleware が normalize 済の正準 role (権限ゲート用)。省略時 (workspace 未解決) は権限なし扱い */
  role?: WorkspaceRole;
}

export type HandlerResult<T = unknown> =
  | { ok: true; status: 200 | 201; body: T }
  | { ok: false; status: 400 | 403 | 404 | 409; body: { error: string; details?: unknown } };

// stripUndefinedPartial / generateId は @belvedere/shared に集約 (R2 / 2026-06-10)。

// ------- リクエスト body schema -------

// POST /api/tickets body — 必須: title。残りはオプション (workspaceId は body に置かない)。
export const TicketCreateBodySchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  status: StatusSchema.optional(),
  priority: PrioritySchema.optional(),
  valueImpact: ValueImpactSchema.optional(),
  ritual: RitualSchema.optional(),
  sprintId: z.string().optional(),
  assigneeId: z.string().optional(),
  estimatePt: z.number().int().min(0).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  parentTicketId: z.string().optional(),
  blockedBy: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  // type==='story' の親 Epic。schema 上は optional のまま据え置く
  // (story 限定の必須化 + 実在検証は createTicket ハンドラ内の手続きチェックで行う。
  //  ここに .refine を掛けると .partial() 派生の TicketPatchBodySchema へ必須化が漏れるため)。
  epicId: z.string().optional(),
  type: TicketTypeSchema.optional(),
  timeboxHours: z.number().min(0).optional(),
  // Review 儀式の指摘ノート。create で渡すことは基本無いが、.partial() 派生の TicketPatchBodySchema で
  // PATCH が reviewNotes を受けられるようにするため create body にも optional で置く (配列まるごと replace 契約)。
  reviewNotes: z.array(z.string().min(1)).optional(),
  // 手動並び順 (fractional indexing)。PATCH は .partial() で自動的に optional になる。
  orderIndex: z.number().optional(),
});

// PATCH /api/tickets/:id body — 全フィールドオプション (部分更新)、id / workspaceId / createdBy / createdAt は変更不可。
// sprintId のみ null/空文字を許可する: 3 区画ビューの d&d で BACKLOG (未割当) へ戻す経路で
// 「sprintId フィールドを削除」を表現する (undefined は「変更なし」、null/'' は「解除」)。
export const TicketPatchBodySchema = TicketCreateBodySchema.partial().extend({
  sprintId: z.string().nullable().optional(),
});

export const TicketStatusChangeBodySchema = z.object({
  status: StatusSchema,
});

// POST /api/tickets/reorder body — 区画 d&d 確定時に「その区画の全 id を新並び順で」受け取り、
// orderIndex を (i+1)*ORDER_STEP で密に再採番する。区画跨ぎ移動は movedId 1 件だけ sprintId を
// 変更する (区画内の他チケット — 完了 sprint 紐付け等 — の sprintId は触らない)。
// sprintId: string=その sprint へ / null|'' で未割当(解除) / 省略=sprint 変更なし。
export const TicketReorderBodySchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, 'orderedIds is required'),
  movedId: z.string().optional(),
  sprintId: z.string().nullable().optional(),
});

// ------- 純粋関数ハンドラ -------

export async function createTicket(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Ticket>> {
  // Ticket CRUD は全役割可 (足场) だが role 未確定 (workspace 未解決) は弾く = MATRIX を honest に保つ
  // 防御の深さ (admin/po/sm/dev は通過 / undefined のみ 403 / permissions.ts)。
  if (!can('ticket.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('ticket.write') };
  }
  const parsed = TicketCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  // story 限定の親 Epic 必須化 + 実在検証 (案A / 2026-06-19)。
  // create 経路のみに掛ける (PATCH/list/read には波及させない = 既存 seed の epicId 無し story を壊さない)。
  // 実在チェックは repo 参照を伴う async なので zod .refine ではなくハンドラ内手続きで行う。
  if (parsed.data.type === 'story') {
    const epicId = parsed.data.epicId;
    if (epicId === undefined || epicId === '') {
      return { ok: false, status: 400, body: { error: 'epic_required' } };
    }
    // fabricated な EP-xxx / 他 workspace の epic は「存在しない」扱いで 400 (IDOR ガードと同方針)。
    const epic = await repo.epics.get(epicId);
    if (!epic || epic.workspaceId !== ctx.workspaceId) {
      return { ok: false, status: 400, body: { error: 'epic_not_found' } };
    }
  }
  const now = new Date().toISOString();
  // スプリント所属 ⟹ 最低 todo (backlog 状態 ⟺ 未所属 / WC-676a53e1)。sprintId 付きで status が
  // 未指定 or backlog のとき todo に引き上げる (client は既に todo を送るが API でも保証 = 矛盾状態防止)。
  const hasSprint = typeof parsed.data.sprintId === 'string' && parsed.data.sprintId !== '';
  const defaultedStatus = parsed.data.status ?? 'backlog';
  const initialStatus = hasSprint && defaultedStatus === 'backlog' ? 'todo' : defaultedStatus;
  const t: Ticket = {
    id: generateId('WC'),
    workspaceId: ctx.workspaceId,
    title: parsed.data.title,
    // Status / Priority のデフォルトは「backlog / medium」(POST 初期値の慣例)。
    // ただし sprintId 付きは todo 以上 (上記 initialStatus)。
    status: initialStatus,
    priority: parsed.data.priority ?? 'medium',
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.valueImpact !== undefined && { valueImpact: parsed.data.valueImpact }),
    ...(parsed.data.ritual !== undefined && { ritual: parsed.data.ritual }),
    ...(parsed.data.sprintId !== undefined && { sprintId: parsed.data.sprintId }),
    ...(parsed.data.assigneeId !== undefined && { assigneeId: parsed.data.assigneeId }),
    ...(parsed.data.estimatePt !== undefined && { estimatePt: parsed.data.estimatePt }),
    ...(parsed.data.acceptanceCriteria !== undefined && { acceptanceCriteria: parsed.data.acceptanceCriteria }),
    ...(parsed.data.labels !== undefined && { labels: parsed.data.labels }),
    ...(parsed.data.parentTicketId !== undefined && { parentTicketId: parsed.data.parentTicketId }),
    ...(parsed.data.blockedBy !== undefined && { blockedBy: parsed.data.blockedBy }),
    ...(parsed.data.projectId !== undefined && { projectId: parsed.data.projectId }),
    ...(parsed.data.epicId !== undefined && { epicId: parsed.data.epicId }),
    ...(parsed.data.type !== undefined && { type: parsed.data.type }),
    ...(parsed.data.timeboxHours !== undefined && { timeboxHours: parsed.data.timeboxHours }),
    ...(parsed.data.reviewNotes !== undefined && { reviewNotes: parsed.data.reviewNotes }),
    ...(parsed.data.orderIndex !== undefined && { orderIndex: parsed.data.orderIndex }),
    createdAt: now,
    updatedAt: now,
    createdBy: 'human',
  };
  await repo.tickets.upsert(t);
  return { ok: true, status: 201, body: t };
}

export async function patchTicket(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<Ticket>> {
  const existing = await repo.tickets.get(id);
  // IDOR: 別 workspace のものは「存在しない」扱い (情報漏えい防止)
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  // Ticket 編集も ticket.write (全役割可 / undefined のみ弾く)。IDOR(404) を先に。
  if (!can('ticket.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('ticket.write') };
  }
  const parsed = TicketPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const now = new Date().toISOString();
  // sprintId は null/空文字で「解除」(フィールド削除) を意味する。3 区画ビューの d&d で
  // BACKLOG (未割当) へ戻す経路で使う。merge から外して別途 delete する
  // (Ticket.sprintId は optional の string なので null を残すと exactOptionalPropertyTypes 違反)。
  const { sprintId: patchSprintId, ...restPatch } = parsed.data;
  const clearSprint = patchSprintId === null || patchSprintId === '';
  let updated: Ticket = {
    ...existing,
    ...stripUndefinedPartial(restPatch),
    ...(typeof patchSprintId === 'string' && patchSprintId !== '' && { sprintId: patchSprintId }),
    id: existing.id,                       // 変更不可
    workspaceId: existing.workspaceId,     // 変更不可
    createdAt: existing.createdAt,         // 変更不可
    createdBy: existing.createdBy,         // 変更不可
    updatedAt: now,
  };
  if (clearSprint) {
    delete updated.sprintId;
  }
  // patch に status 変更が含まれる場合は startedAt / completedAt も自動記録 (changeTicketStatus と同じ経路)
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    updated = applyStatusTransition(updated, parsed.data.status, now);
  }
  await repo.tickets.upsert(updated);
  return { ok: true, status: 200, body: updated };
}

/**
 * 区画 d&d 確定時の密再採番 (2026-06-16)。
 *
 * 旧方式 (近傍 2 行の中点を 1 件だけ patch) は、区画内に orderIndex 未設定 (seed 由来) や
 * 等値のチケットが 1 件でも在ると破綻した:
 *   - 未設定隣接同士 → orderBetween が固定値 ORDER_STEP を返し、compareTicketOrder 規則2
 *     「orderIndex あり が先」で**その 1 件だけ区画先頭へジャンプ**。
 *   - 等値隣接 → 中点が両隣と同値になり tie-break で**元位置へ復帰**。
 * → 区画全体を毎回 (i+1)*ORDER_STEP で密に振り直し、未設定/等値/精度枯渇を構造的に根絶する。
 *
 * orderedIds は「その区画の全チケット id を新並び順で」。movedId が在れば区画跨ぎ移動として
 * その 1 件だけ sprintId を set (string) / clear (null|'') する。
 *
 * 並行削除耐性: 受け取った id のうち **既に消えている (get→null) ものは黙って除外**し、生き残りだけを
 * 密再採番する。区画の無関係チケットが別タブ/並行 e2e run で消えても自分の並べ替えは通る (旧「1 件でも
 * 欠ければ全体 404」は本番の無言 revert と e2e flaky を生んだ)。別 workspace の id だけは IDOR として
 * 404 で中止する (正規クライアントでは起こり得ない)。書込は memory backend では同期 Map、firestore では
 * 単発 set ×N (真のトランザクションではない — 既定 memory では部分適用は起きない)。
 */
export async function reorderTickets(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Ticket[]>> {
  // バックログの並び順 = 優先順位は PO の専権 (admin は bypass / permissions.ts)。
  if (!can('backlog.reorder', ctx)) {
    return { ok: false, status: 403, body: forbidden('backlog.reorder') };
  }
  const parsed = TicketReorderBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const { orderedIds, movedId, sprintId } = parsed.data;
  // 重複 id があると再採番が崩れる (同 id を 2 度書く)。
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, status: 400, body: { error: 'duplicate_ids' } };
  }
  // movedId は並び順の中に含まれていなければならない (移動先区画の id 列に居る前提)。
  if (movedId !== undefined && !orderedIds.includes(movedId)) {
    return { ok: false, status: 400, body: { error: 'moved_id_not_in_order' } };
  }
  // id を一括取得 (firestore で逐次 N 往復にしない)。
  const fetched = await Promise.all(orderedIds.map((id) => repo.tickets.get(id)));
  // 生存チケットだけを new 並び順で集める。不在 (並行削除) は skip、別 workspace は IDOR 404。
  const survivors: Ticket[] = [];
  for (let i = 0; i < fetched.length; i++) {
    const existing = fetched[i];
    if (!existing) continue; // 並行削除済 — 静かに除外して残りを再採番する
    if (existing.workspaceId !== ctx.workspaceId) {
      return { ok: false, status: 404, body: { error: 'not_found', details: { id: orderedIds[i]! } } };
    }
    survivors.push(existing);
  }
  // 生存分を 1..N で密再採番 (skip した穴は詰める)。movedId が生存していれば sprintId も変更。
  // **実際に orderIndex/sprintId が変わる行だけ** を返す算術は純粋関数 computeReorderUpdates
  // (@belvedere/shared) に委譲する (退化入力テストは packages/shared/test/order.test.ts が担保)。
  const now = new Date().toISOString();
  // current↔backlog の status 整合 (WC-676a53e1): current へ入れたら todo / BACKLOG へ戻したら backlog。
  // active sprint を解決して渡す (movedId 移動時のみ必要 = 余計な読みを避ける)。
  let activeSprintId: string | undefined;
  if (movedId !== undefined) {
    const sprints = await repo.sprints.list({ workspaceId: ctx.workspaceId });
    activeSprintId = sprints.find((s) => s.status === 'active')?.id;
  }
  const updates = computeReorderUpdates(survivors, { movedId, sprintId, activeSprintId, now });
  // 変わった行だけ書込 + 返す (frontend は id でマージし未変更行は現状維持)。
  await Promise.all(updates.map((t) => repo.tickets.upsert(t)));
  return { ok: true, status: 200, body: updates };
}

export async function changeTicketStatus(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<{ from: Status; to: Status; ticket: Ticket }>> {
  const existing = await repo.tickets.get(id);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  // ステータス変更も ticket.write (全役割可 / undefined のみ弾く)。
  if (!can('ticket.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('ticket.write') };
  }
  const parsed = TicketStatusChangeBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  // applyStatusTransition が startedAt (初回 in-progress) / completedAt (初回 done) を自動記録
  const updated = applyStatusTransition(existing, parsed.data.status, new Date().toISOString());
  await repo.tickets.upsert(updated);
  return { ok: true, status: 200, body: { from: existing.status, to: parsed.data.status, ticket: updated } };
}

export async function deleteTicket(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<{ deleted: string }>> {
  const existing = await repo.tickets.get(id);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  // 削除も ticket.write (全役割可 / undefined のみ弾く)。
  if (!can('ticket.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('ticket.write') };
  }
  await repo.tickets.delete(id);
  return { ok: true, status: 200, body: { deleted: id } };
}

