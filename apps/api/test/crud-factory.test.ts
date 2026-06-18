// crud-factory (IDOR ガード + 同型 delete) の直接 unit test (R2-D / 2026-06-18)。
//
// security 直結の IDOR 判定を単一ソースに集約したので、testing.md §1 に従い factory 自体を
// 直接踏む。fake getter/repo で「自 workspace / 別 workspace / 不在」の判別を最安レイヤで固定する。

import { describe, it, expect, vi } from 'vitest';
import type { HandlerContext } from '../src/handlers/ticket-handlers';
import { loadOwned, deleteOwned } from '../src/handlers/crud-factory';

const ctx: HandlerContext = { workspaceId: 'ws-a', user: { userId: 'u1', email: 'u@x.com' } };

describe('loadOwned (IDOR ガード)', () => {
  it('自 workspace の entity → ok:true で entity を返す', async () => {
    const getter = { get: async (id: string) => ({ id, workspaceId: 'ws-a' }) };
    const r = await loadOwned(getter, ctx, 'X');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entity.id).toBe('X');
  });

  it('別 workspace の entity → ok:false / 404 (情報漏えい防止)', async () => {
    const getter = { get: async (id: string) => ({ id, workspaceId: 'ws-other' }) };
    const r = await loadOwned(getter, ctx, 'X');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(404);
  });

  it('不在 (get→null) → ok:false / 404 (別 workspace と同じ「存在しない」)', async () => {
    const getter = { get: async () => null };
    const r = await loadOwned(getter, ctx, 'X');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(404);
  });
});

describe('deleteOwned (IDOR → delete → {deleted})', () => {
  it('自 workspace → delete(id) を呼び { deleted: id } を返す', async () => {
    const del = vi.fn(async () => undefined);
    const repo = { get: async (id: string) => ({ id, workspaceId: 'ws-a' }), delete: del };
    const r = await deleteOwned(repo, ctx, 'X');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({ deleted: 'X' });
    expect(del).toHaveBeenCalledWith('X');
  });

  it('別 workspace → 404 で delete を呼ばない (誤削除防止)', async () => {
    const del = vi.fn(async () => undefined);
    const repo = { get: async (id: string) => ({ id, workspaceId: 'ws-other' }), delete: del };
    const r = await deleteOwned(repo, ctx, 'X');
    // deleteOwned は HandlerResult を返す (ok:false は status/body 直 / loadOwned の response とは別形)。
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(del).not.toHaveBeenCalled();
  });
});
