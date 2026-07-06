// Epic ハンドラの単体テスト (WC-24 / 2026-07-06)。
// createEpic の orderIndex 末尾採番 + reorderEpics の密再採番 / 権限 / IDOR を memory repo で確認。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Epic } from '@belvedere/shared';
import { createEpic, reorderEpics } from '../src/handlers/epic-handlers';

const WS = 'ws-belvedere';
// 権限再設計 (2026-06-23): backlog.reorder / epic.write = PO (admin は bypass)。
const ADMIN = { workspaceId: WS, user: { userId: 'u-admin', email: 'a@x.com' }, role: 'admin' as const };
const PO = { workspaceId: WS, user: { userId: 'u-po', email: 'p@x.com' }, role: 'po' as const };
const DEV = { workspaceId: WS, user: { userId: 'u-dev', email: 'd@x.com' }, role: 'dev' as const };
const OTHER = { workspaceId: 'ws-other', user: { userId: 'u-x', email: 'x@x.com' }, role: 'admin' as const };

function epic(p: Partial<Epic> & Pick<Epic, 'id'>): Epic {
  return { workspaceId: WS, name: p.id, status: 'planned', createdAt: '2026-01-01T00:00:00Z', ...p };
}

describe('createEpic — orderIndex 末尾採番 (WC-24)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('新規 Epic は既存 max orderIndex + STEP に採番される', async () => {
    const before = await repo.epics.list({ workspaceId: WS });
    const maxBefore = before.reduce((m, e) => Math.max(m, e.orderIndex ?? 0), 0);
    const res = await createEpic(repo, ADMIN, { name: '新 Epic' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.orderIndex).toBe(maxBefore + 1000);
  });

  it('body で orderIndex を明示すればそれを使う', async () => {
    const res = await createEpic(repo, ADMIN, { name: 'x', orderIndex: 500 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.orderIndex).toBe(500);
  });
});

describe('reorderEpics — Backlog の d&d 並び替え (WC-24)', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.epics.upsert(epic({ id: 'EP-A', orderIndex: 1000 }));
    await repo.epics.upsert(epic({ id: 'EP-B', orderIndex: 2000 }));
    await repo.epics.upsert(epic({ id: 'EP-C', orderIndex: 3000 }));
  });

  it('orderedIds の順に orderIndex を密再採番する', async () => {
    const res = await reorderEpics(repo, PO, { orderedIds: ['EP-C', 'EP-A', 'EP-B'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await repo.epics.get('EP-C'))?.orderIndex).toBe(1000);
    expect((await repo.epics.get('EP-A'))?.orderIndex).toBe(2000);
    expect((await repo.epics.get('EP-B'))?.orderIndex).toBe(3000);
  });

  it('admin も並び替えできる (bypass)', async () => {
    const res = await reorderEpics(repo, ADMIN, { orderedIds: ['EP-A', 'EP-B', 'EP-C'] });
    expect(res.ok).toBe(true);
  });

  it('403: dev は並び替え不可 (backlog.reorder は PO/admin)', async () => {
    const res = await reorderEpics(repo, DEV, { orderedIds: ['EP-A'] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('IDOR: 別 workspace の Epic id は survivors から除外され触られない', async () => {
    // OTHER ws には EP-A は存在しない → orderedIds が全て未解決 = 更新 0 件 (200 だが空)。
    const res = await reorderEpics(repo, OTHER, { orderedIds: ['EP-A', 'EP-B'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toHaveLength(0);
    // ws-belvedere の EP-A は元の orderIndex のまま (別 ws から触れない)。
    expect((await repo.epics.get('EP-A'))?.orderIndex).toBe(1000);
  });
});
