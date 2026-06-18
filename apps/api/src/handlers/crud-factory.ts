// 薄い CRUD ハンドラの IDOR ガード + 同型 delete の集約 (R2-D / 2026-06-18)。
//
// epic / retro-try / retro-note の patch・delete・vote は「get → workspaceId IDOR 照合 → 404」の
// 前置きを複製し、retro-try / retro-note の delete は entity 差を除いて完全一致だった。security 直結の
// IDOR 判定を単一ソースにする。
//
// 適用対象外 (逸脱②): member は複合キー get(workspaceId, userId) + self-only、api-key は userId 所有
// チェック + token ハッシュ生成 + toView(tokenHash 剥がし) という固有の security 意味論を持つため、
// 無理に 1 つの factory へ寄せると leaky abstraction になる (ticket-handlers を適用外とした理由と同じ)。
// ここでは「workspaceId 単一所有の IDOR ガード + 同型 delete」だけを抽出する。

import type { HandlerContext, HandlerResult } from './ticket-handlers';

/** id で取得でき workspaceId で所有判定できる entity の getter (epic / retro-try / retro-note 等)。 */
interface OwnedGetter<E extends { workspaceId: string }> {
  get(id: string): Promise<E | null>;
}
interface OwnedRepo<E extends { workspaceId: string }> extends OwnedGetter<E> {
  delete(id: string): Promise<void>;
}

/** loadOwned の戻り: 取得成功 (entity) か、即 return すべき 404 response か の判別共用体。 */
export type LoadOwned<E> =
  | { ok: true; entity: E }
  | { ok: false; response: HandlerResult<never> };

/**
 * get → workspaceId IDOR 照合。別 workspace / 不在は「存在しない」扱いで 404 を返す (情報漏えい防止)。
 * 呼出側は `const loaded = await loadOwned(repo.X, ctx, id); if (!loaded.ok) return loaded.response;`
 * で early return し、以降は `loaded.entity` を所有確定済みの entity として使う。
 * HandlerResult<never> の ok:false 変種は T 非依存なので、どの HandlerResult<E> 戻り型にも代入できる。
 */
export async function loadOwned<E extends { workspaceId: string }>(
  getter: OwnedGetter<E>,
  ctx: HandlerContext,
  id: string,
): Promise<LoadOwned<E>> {
  const entity = await getter.get(id);
  if (!entity || entity.workspaceId !== ctx.workspaceId) {
    return { ok: false, response: { ok: false, status: 404, body: { error: 'not_found' } } };
  }
  return { ok: true, entity };
}

/**
 * get → IDOR 404 → delete → { deleted: id }。retro-try / retro-note の delete は entity 差を
 * 除いて完全一致なのでここに集約する (epic は delete handler を持たないので未使用)。
 */
export async function deleteOwned<E extends { workspaceId: string }>(
  repo: OwnedRepo<E>,
  ctx: HandlerContext,
  id: string,
): Promise<HandlerResult<{ deleted: string }>> {
  const loaded = await loadOwned(repo, ctx, id);
  if (!loaded.ok) return loaded.response;
  await repo.delete(id);
  return { ok: true, status: 200, body: { deleted: id } };
}
