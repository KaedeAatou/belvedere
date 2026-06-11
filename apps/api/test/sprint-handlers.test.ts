// Sprint 編集 + 開始ハンドラの単体テスト (2026-06-11)。
// memory backend で直接呼び、IDOR / role ゲート / planned→active 遷移 / velocity 確定を確認。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Sprint, Ticket } from '@belvedere/shared';
import { patchSprint, startSprint } from '../src/handlers/sprint-handlers';

const WS = 'ws-belvedere';
const OWNER = { workspaceId: WS, user: { userId: 'u-owner', email: 'owner@example.com' }, role: 'owner' as const };
const DEV = { workspaceId: WS, user: { userId: 'u-dev', email: 'dev@example.com' }, role: 'dev' as const };
const OTHER = { workspaceId: 'ws-other', user: { userId: 'u-x', email: 'x@example.com' }, role: 'owner' as const };

function sprint(p: Partial<Sprint> & Pick<Sprint, 'id' | 'number' | 'status'>): Sprint {
  return {
    workspaceId: WS,
    startsAt: '2026-04-22T00:00:00+09:00',
    endsAt: '2026-05-05T23:59:59+09:00',
    goal: 'demo goal',
    capacity: 30,
    ...p,
  };
}

function ticket(p: Partial<Ticket> & Pick<Ticket, 'id' | 'status' | 'sprintId'>): Ticket {
  const now = '2026-04-22T00:00:00+09:00';
  return {
    workspaceId: WS,
    title: 't',
    priority: 'medium',
    estimatePt: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: 'human',
    ...p,
  };
}

describe('patchSprint', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.sprints.upsert(sprint({ id: 'sprint-14', number: 14, status: 'planned' }));
  });

  it('正常系: goal/期間を編集 (status は変えない)', async () => {
    const res = await patchSprint(repo, OWNER, 'sprint-14', {
      goal: '新ゴール', startsAt: '2026-05-06T00:00:00+09:00', endsAt: '2026-05-19T23:59:59+09:00',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.goal).toBe('新ゴール');
    expect(res.body.status).toBe('planned');
  });

  it('403: dev は編集不可 (owner/sm/po のみ)', async () => {
    const res = await patchSprint(repo, DEV, 'sprint-14', { goal: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('404: 別 workspace の sprint は存在しない扱い', async () => {
    const res = await patchSprint(repo, OTHER, 'sprint-14', { goal: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('409: completed は編集不可', async () => {
    await repo.sprints.upsert(sprint({ id: 'sprint-12', number: 12, status: 'completed', velocity: 27 }));
    const res = await patchSprint(repo, OWNER, 'sprint-12', { goal: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('400: startsAt > endsAt は弾く', async () => {
    const res = await patchSprint(repo, OWNER, 'sprint-14', {
      startsAt: '2026-06-01T00:00:00+09:00', endsAt: '2026-05-01T00:00:00+09:00',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('startSprint', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.sprints.upsert(sprint({ id: 'sprint-13', number: 13, status: 'active' }));
    await repo.sprints.upsert(sprint({ id: 'sprint-14', number: 14, status: 'planned' }));
    // active sprint-13 の done チケット: 8 + 5 = 13 SP / done でない 20 は velocity に含めない
    await repo.tickets.upsert(ticket({ id: 'WC-1', status: 'done', sprintId: 'sprint-13', estimatePt: 8 }));
    await repo.tickets.upsert(ticket({ id: 'WC-2', status: 'done', sprintId: 'sprint-13', estimatePt: 5 }));
    await repo.tickets.upsert(ticket({ id: 'WC-3', status: 'in-progress', sprintId: 'sprint-13', estimatePt: 20 }));
  });

  it('正常系: planned→active 遷移 + 現 active を completed にし velocity を done SP で確定', async () => {
    const res = await startSprint(repo, OWNER, 'sprint-14', { goal: '次ゴール' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.started.status).toBe('active');
    expect(res.body.started.goal).toBe('次ゴール');
    expect(res.body.completed?.id).toBe('sprint-13');
    expect(res.body.completed?.status).toBe('completed');
    expect(res.body.completed?.velocity).toBe(13);
    // 永続化も確認
    expect((await repo.sprints.get('sprint-13'))?.status).toBe('completed');
    expect((await repo.sprints.get('sprint-14'))?.status).toBe('active');
  });

  it('現 active が無くても開始できる (completed は null)', async () => {
    await repo.sprints.upsert(sprint({ id: 'sprint-13', number: 13, status: 'completed', velocity: 27 }));
    const res = await startSprint(repo, OWNER, 'sprint-14', {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.started.status).toBe('active');
    expect(res.body.completed).toBeNull();
  });

  it('409: planned でない sprint は開始不可', async () => {
    const res = await startSprint(repo, OWNER, 'sprint-13', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('403: dev は開始不可', async () => {
    const res = await startSprint(repo, DEV, 'sprint-14', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('404: 別 workspace は存在しない扱い', async () => {
    const res = await startSprint(repo, OTHER, 'sprint-14', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});
