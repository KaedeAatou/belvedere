// Phase 1-C Epic CRUD ハンドラ (2026-06-11)。
// ticket-handlers.ts と同じ設計方針 (純粋関数 + IDOR ガード + zod 検証)。

import { z } from 'zod';
import type { Epic } from '@belvedere/shared';
import { ValueImpactSchema, stripUndefinedPartial, generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';
import { loadOwned } from './crud-factory';

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
