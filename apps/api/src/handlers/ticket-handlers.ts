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
import type { Status, Ticket } from '@belvedere/shared';
import {
  PrioritySchema,
  RitualSchema,
  StatusSchema,
  ValueImpactSchema,
  TicketTypeSchema,
  stripUndefinedPartial,
  generateId,
  applyStatusTransition,
} from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';

export interface HandlerContext {
  workspaceId: string;
  /** authMiddleware で確定したログインユーザ (createdBy 採番 + audit 用) */
  user: { userId: string; email: string };
  /** workspaceMiddleware が解決した role (見積もりポーカーの開示/採用ゲート用、T6)。省略時は権限なし扱い */
  role?: 'owner' | 'sm' | 'po' | 'dev' | 'guest';
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
  type: TicketTypeSchema.optional(),
  timeboxHours: z.number().min(0).optional(),
  // 手動並び順 (fractional indexing)。PATCH は .partial() で自動的に optional になる。
  orderIndex: z.number().optional(),
});

// PATCH /api/tickets/:id body — 全フィールドオプション (部分更新)、id / workspaceId / createdBy / createdAt は変更不可
export const TicketPatchBodySchema = TicketCreateBodySchema.partial();

export const TicketStatusChangeBodySchema = z.object({
  status: StatusSchema,
});

// ------- 純粋関数ハンドラ -------

export async function createTicket(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Ticket>> {
  const parsed = TicketCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const now = new Date().toISOString();
  const t: Ticket = {
    id: generateId('WC'),
    workspaceId: ctx.workspaceId,
    title: parsed.data.title,
    // Status / Priority のデフォルトは「backlog / medium」(POST 初期値の慣例)
    status: parsed.data.status ?? 'backlog',
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
    ...(parsed.data.type !== undefined && { type: parsed.data.type }),
    ...(parsed.data.timeboxHours !== undefined && { timeboxHours: parsed.data.timeboxHours }),
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
  const parsed = TicketPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const now = new Date().toISOString();
  let updated: Ticket = {
    ...existing,
    ...stripUndefinedPartial(parsed.data),
    id: existing.id,                       // 変更不可
    workspaceId: existing.workspaceId,     // 変更不可
    createdAt: existing.createdAt,         // 変更不可
    createdBy: existing.createdBy,         // 変更不可
    updatedAt: now,
  };
  // patch に status 変更が含まれる場合は startedAt / completedAt も自動記録 (changeTicketStatus と同じ経路)
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    updated = applyStatusTransition(updated, parsed.data.status, now);
  }
  await repo.tickets.upsert(updated);
  return { ok: true, status: 200, body: updated };
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
  await repo.tickets.delete(id);
  return { ok: true, status: 200, body: { deleted: id } };
}

