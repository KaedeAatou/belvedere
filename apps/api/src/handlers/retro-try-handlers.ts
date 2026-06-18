// Retro Try 積み上げ (carry-forward stack) CRUD ハンドラ (2026-06-11)。
//
// Retrospective で「次に試すこと (Try)」を d&d で積み上げると生成される RetroTry を永続化する。
// この積み上げはスプリントを跨いで蓄積され、各儀式 Agent のコンテキストになる。
//
// 設計方針 (ticket-handlers.ts と同形式):
// - 純粋関数として書く (repo / ctx / body を受け取り、ステータス + JSON を返す)。
// - workspaceId / createdBy は API caller が認証経由で確定したものを使う (body 経由の偽装を防ぐ)。
// - role ゲートなし: レトロは全メンバー参加なので積み上げ追加/削除に権限制限を設けない。
// - IDOR ガード: get → workspaceId 照合、別 workspace のものは 404 扱い。

import { z } from 'zod';
import type { RetroTry } from '@belvedere/shared';
import { stripUndefinedPartial, generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';
import { loadOwned, deleteOwned } from './crud-factory';

// ------- リクエスト body schema -------

// POST /api/retro-tries body — 必須: text / sprintNumber。sprintId は任意 (seed 由来は省略可)。
export const RetroTryCreateBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
  sprintNumber: z.number(),
  sprintId: z.string().optional(),
});

// PATCH /api/retro-tries/:id body — done トグル / text 編集 (部分更新)。
export const RetroTryPatchBodySchema = z.object({
  done: z.boolean().optional(),
  text: z.string().min(1).optional(),
});

// ------- 純粋関数ハンドラ -------

export async function listRetroTries(
  repo: RepoContainer,
  ctx: HandlerContext,
): Promise<HandlerResult<RetroTry[]>> {
  // repo 側で createdAt 昇順にソート済 (memory / firestore 双方で契約一致)。
  const xs = await repo.retroTries.list({ workspaceId: ctx.workspaceId });
  return { ok: true, status: 200, body: xs };
}

export async function createRetroTry(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<RetroTry>> {
  const parsed = RetroTryCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const now = new Date().toISOString();
  const t: RetroTry = {
    id: generateId('try'),
    workspaceId: ctx.workspaceId,
    text: parsed.data.text,
    sprintNumber: parsed.data.sprintNumber,
    ...(parsed.data.sprintId !== undefined && { sprintId: parsed.data.sprintId }),
    done: false,
    createdAt: now,
    createdBy: ctx.user.userId,
  };
  await repo.retroTries.upsert(t);
  return { ok: true, status: 201, body: t };
}

export async function patchRetroTry(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<RetroTry>> {
  const loaded = await loadOwned(repo.retroTries, ctx, id);
  if (!loaded.ok) return loaded.response;
  const existing = loaded.entity;
  const parsed = RetroTryPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const updated: RetroTry = {
    ...existing,
    ...stripUndefinedPartial(parsed.data),
    id: existing.id,                   // 変更不可
    workspaceId: existing.workspaceId, // 変更不可
    createdAt: existing.createdAt,     // 変更不可
    createdBy: existing.createdBy,     // 変更不可
  };
  await repo.retroTries.upsert(updated);
  return { ok: true, status: 200, body: updated };
}

export async function deleteRetroTry(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<{ deleted: string }>> {
  return deleteOwned(repo.retroTries, ctx, id);
}
