// Phase 1-C Epic CRUD ハンドラ (2026-06-11)。
// ticket-handlers.ts と同じ設計方針 (純粋関数 + IDOR ガード + zod 検証)。

import { z } from 'zod';
import type { Epic } from '@belvedere/shared';
import { ValueImpactSchema, stripUndefinedPartial, generateId } from '@belvedere/shared';
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
  const e: Epic = {
    id: generateId('EP'),
    workspaceId: ctx.workspaceId,
    name: parsed.data.name,
    status: parsed.data.status ?? 'planned',
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
  // Epic 完了/中止ガード (2026-07-09)。未完了 (done 以外) の子チケットが残る Epic を completed/
  // cancelled にはできない。Epic を閉じる = 配下の作業も片付いている、という不変条件を守る
  // (open な子を残したまま Epic を閉じると、その作業が宙に浮いて追えなくなる)。
  // status を新たに completed/cancelled にする変更のときだけ検査する (他フィールドの patch は素通し)。
  const closing = parsed.data.status === 'completed' || parsed.data.status === 'cancelled';
  if (closing && parsed.data.status !== existing.status) {
    const wsTickets = await repo.tickets.list({ workspaceId: ctx.workspaceId });
    const openChildren = wsTickets.filter((t) => t.epicId === id && t.status !== 'done');
    if (openChildren.length > 0) {
      return { ok: false, status: 409, body: { error: 'epic_has_open_tickets', details: { openCount: openChildren.length } } };
    }
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
