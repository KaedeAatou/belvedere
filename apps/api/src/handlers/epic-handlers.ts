// Phase 1-C Epic CRUD ハンドラ (2026-06-11)。
// ticket-handlers.ts と同じ設計方針 (純粋関数 + IDOR ガード + zod 検証)。

import { z } from 'zod';
import type { Epic } from '@belvedere/shared';
import { ValueImpactSchema, stripUndefinedPartial, generateId, computeOrderIndexUpdates, ORDER_STEP } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';
import { loadOwned } from './crud-factory';
import { can, forbidden } from '../permissions';

export const EpicCreateBodySchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
  valueImpact: ValueImpactSchema.optional(),
  rationale: z.string().optional(),
  successMetric: z.string().optional(),
  strategicTheme: z.string().optional(),
  orderIndex: z.number().optional(),
  projectId: z.string().optional(),
});

export const EpicPatchBodySchema = EpicCreateBodySchema.partial();

export async function createEpic(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Epic>> {
  // Epic/Story の価値・優先度の設定は PO の専権 (admin は bypass / permissions.ts)。
  if (!can('epic.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('epic.write') };
  }
  const parsed = EpicCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  // WC-24: 新規 Epic は末尾へ (既存 max orderIndex + STEP)。Backlog の d&d で後から並べ替え可能。
  const existingEpics = await repo.epics.list({ workspaceId: ctx.workspaceId });
  const maxOrder = existingEpics.reduce((m, ep) => Math.max(m, ep.orderIndex ?? 0), 0);
  const e: Epic = {
    id: generateId('EP'),
    workspaceId: ctx.workspaceId,
    name: parsed.data.name,
    status: parsed.data.status ?? 'planned',
    orderIndex: parsed.data.orderIndex ?? maxOrder + ORDER_STEP,
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.ownerId !== undefined && { ownerId: parsed.data.ownerId }),
    ...(parsed.data.valueImpact !== undefined && { valueImpact: parsed.data.valueImpact }),
    ...(parsed.data.rationale !== undefined && { rationale: parsed.data.rationale }),
    ...(parsed.data.successMetric !== undefined && { successMetric: parsed.data.successMetric }),
    ...(parsed.data.strategicTheme !== undefined && { strategicTheme: parsed.data.strategicTheme }),
    ...(parsed.data.projectId !== undefined && { projectId: parsed.data.projectId }),
    createdAt: new Date().toISOString(),
  };
  await repo.epics.upsert(e);
  return { ok: true, status: 201, body: e };
}

export async function patchEpic(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<Epic>> {
  const loaded = await loadOwned(repo.epics, ctx, id);
  if (!loaded.ok) return loaded.response;
  // IDOR (別 ws → 404) を先に、その後 epic.write (PO/admin) ゲート。patchSprint と同じ順序。
  if (!can('epic.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('epic.write') };
  }
  const existing = loaded.entity;
  const parsed = EpicPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const updated: Epic = {
    ...existing,
    ...stripUndefinedPartial(parsed.data),
    id: existing.id,                       // 変更不可
    workspaceId: existing.workspaceId,     // 変更不可
    createdAt: existing.createdAt,         // 変更不可
  };
  await repo.epics.upsert(updated);
  return { ok: true, status: 200, body: updated };
}

// POST /api/epics/reorder body — Backlog の Epic d&d 確定時に「新並び順の全 id」を受け取り密再採番する。
export const EpicReorderBodySchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

/**
 * POST /api/epics/reorder — Backlog で Epic を d&d 並び替えした順に orderIndex を密再採番する (WC-24)。
 * ticket の reorderTickets と同型だが、Epic は区画跨ぎが無いので computeOrderIndexUpdates (素の密再採番)
 * を使う。並び替え = 優先順位付けなので backlog.reorder (PO/admin) 権限。IDOR: ws 内の実在 Epic のみ対象。
 */
export async function reorderEpics(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Epic[]>> {
  if (!can('backlog.reorder', ctx)) {
    return { ok: false, status: 403, body: forbidden('backlog.reorder') };
  }
  const parsed = EpicReorderBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const all = await repo.epics.list({ workspaceId: ctx.workspaceId });
  const byId = new Map(all.map((ep) => [ep.id, ep]));
  const survivors = parsed.data.orderedIds
    .map((id) => byId.get(id))
    .filter((ep): ep is Epic => ep !== undefined);
  const updates = computeOrderIndexUpdates(survivors);
  for (const u of updates) await repo.epics.upsert(u);
  return { ok: true, status: 200, body: updates };
}
