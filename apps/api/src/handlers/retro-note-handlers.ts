// Retro KPT ボードのノート CRUD + 投票ハンドラ (2026-06-13)。
//
// Retrospective を実際に開催するための実データ。メンバーが KPT (Keep/Problem/Try) の
// 各列にノートを貼り、投票で関心の高さを可視化する。Try 列のノートは UI 側で
// RetroTry (carry-forward 積み上げ) へ d&d 昇格できる。
//
// 設計方針 (retro-try-handlers.ts と同形式):
// - 純粋関数として書く (repo / ctx / body を受け取り、ステータス + JSON を返す)。
// - workspaceId / authorId / createdBy は API caller が認証経由で確定したものを使う
//   (body 経由の偽装を防ぐ)。
// - role ゲートなし: レトロは全メンバー参加なので追加/編集/投票/削除に権限制限を設けない。
// - IDOR ガード: get → workspaceId 照合、別 workspace のものは 404 扱い。
// - 投票は toggle: 現在ユーザーの userId が votes に居れば外す / 居なければ足す。

import { z } from 'zod';
import type { RetroNote } from '@belvedere/shared';
import { generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

// ------- リクエスト body schema -------

// POST /api/retro-notes body — 必須: column / text / sprintNumber。
export const RetroNoteCreateBodySchema = z.object({
  column: z.enum(['keep', 'problem', 'try']),
  text: z.string().min(1, 'text is required'),
  sprintNumber: z.number(),
});

// PATCH /api/retro-notes/:id body — text 編集のみ (column / votes は別経路)。
export const RetroNotePatchBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
});

// ------- 純粋関数ハンドラ -------

export async function listRetroNotes(
  repo: RepoContainer,
  ctx: HandlerContext,
): Promise<HandlerResult<RetroNote[]>> {
  // repo 側で createdAt 昇順にソート済 (memory / firestore 双方で契約一致)。
  const xs = await repo.retroNotes.list({ workspaceId: ctx.workspaceId });
  return { ok: true, status: 200, body: xs };
}

export async function createRetroNote(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<RetroNote>> {
  const parsed = RetroNoteCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const now = new Date().toISOString();
  const n: RetroNote = {
    id: generateId('note'),
    workspaceId: ctx.workspaceId,
    sprintNumber: parsed.data.sprintNumber,
    column: parsed.data.column,
    text: parsed.data.text,
    authorId: ctx.user.userId,
    votes: [],
    createdAt: now,
    createdBy: ctx.user.userId,
  };
  await repo.retroNotes.upsert(n);
  return { ok: true, status: 201, body: n };
}

export async function patchRetroNote(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<RetroNote>> {
  const existing = await repo.retroNotes.get(id);
  // IDOR: 別 workspace のものは「存在しない」扱い (情報漏えい防止)
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const parsed = RetroNotePatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const updated: RetroNote = {
    ...existing,
    text: parsed.data.text,
    id: existing.id,                   // 変更不可
    workspaceId: existing.workspaceId, // 変更不可
    createdAt: existing.createdAt,     // 変更不可
    createdBy: existing.createdBy,     // 変更不可
  };
  await repo.retroNotes.upsert(updated);
  return { ok: true, status: 200, body: updated };
}

/**
 * 現在ユーザーの投票をトグルする。votes に userId が居れば外す / 居なければ足す。
 * レトロは全員参加なので role ゲートなし。
 */
export async function voteRetroNote(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<RetroNote>> {
  const existing = await repo.retroNotes.get(id);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const uid = ctx.user.userId;
  const has = existing.votes.includes(uid);
  const votes = has ? existing.votes.filter((v) => v !== uid) : [...existing.votes, uid];
  const updated: RetroNote = { ...existing, votes };
  await repo.retroNotes.upsert(updated);
  return { ok: true, status: 200, body: updated };
}

export async function deleteRetroNote(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<{ deleted: string }>> {
  const existing = await repo.retroNotes.get(id);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  await repo.retroNotes.delete(id);
  return { ok: true, status: 200, body: { deleted: id } };
}
