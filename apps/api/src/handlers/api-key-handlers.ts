// per-user API キー CRUD ハンドラ (2026-06-17)。
// member-handlers.ts と同じ「純粋関数 + HandlerContext/HandlerResult + IDOR ガード + zod」パターン。
//
// セキュリティ:
// - tokenHash は戻り値に絶対に含めない (toView で剥がす)。平文 token は createApiKey の
//   レスポンスでのみ 1 回返す (再表示不可)。
// - list / revoke は「自分 (ctx.user.userId) かつ current workspace」のキーだけを対象にする。
//   他人のキー・別 workspace のキー・存在しない id は 404 (権限ない情報を漏らさない方針)。

import { z } from 'zod';
import type { ApiKey, ApiKeyView } from '@belvedere/shared';
import { generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';
import { generateApiKeyToken } from '../config/api-key';

export const CreateApiKeyBodySchema = z.object({
  name: z.string().min(1).max(80),
});

/** tokenHash を確実に剥がした安全ビューに変換する (戻り値でハッシュを露出させない)。 */
function toView(k: ApiKey): ApiKeyView {
  const { tokenHash: _omit, ...view } = k;
  void _omit;
  return view;
}

/**
 * GET /api/api-keys — ログイン中ユーザ自身のキー一覧 (current workspace スコープ)。
 * tokenHash は含めない。
 */
export async function listApiKeys(
  repo: RepoContainer,
  ctx: HandlerContext,
): Promise<HandlerResult<ApiKeyView[]>> {
  const keys = await repo.apiKeys.list({ workspaceId: ctx.workspaceId, userId: ctx.user.userId });
  return { ok: true, status: 200, body: keys.map(toView) };
}

/**
 * POST /api/api-keys — 新しいキーを発行する。
 * 平文 token はこのレスポンスでのみ返る (再表示不可)。保存するのは sha256 ハッシュだけ。
 */
export async function createApiKey(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
  now: string,
): Promise<HandlerResult<ApiKeyView & { token: string }>> {
  const parsed = CreateApiKeyBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const { token, tokenHash, tokenPrefix } = generateApiKeyToken();
  const key: ApiKey = {
    id: generateId('apikey'),
    workspaceId: ctx.workspaceId,
    userId: ctx.user.userId,
    ownerEmail: ctx.user.email.toLowerCase(),
    name: parsed.data.name,
    tokenHash,
    tokenPrefix,
    createdAt: now,
    createdBy: ctx.user.userId,
  };
  await repo.apiKeys.upsert(key);
  // 平文 token はここだけ。以後は二度と取り出せない。
  return { ok: true, status: 201, body: { ...toView(key), token } };
}

/**
 * DELETE /api/api-keys/:id — キーを失効 (ハード削除) する。
 * 他人のキー / 別 workspace のキー / 存在しない id は 404 (member-handlers と同じ方針)。
 */
export async function revokeApiKey(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<{ ok: true }>> {
  const existing = await repo.apiKeys.get(id);
  if (!existing || existing.userId !== ctx.user.userId || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  await repo.apiKeys.delete(id);
  return { ok: true, status: 200, body: { ok: true } };
}
