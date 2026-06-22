// Sprint 編集 + 開始ハンドラの単体テスト (2026-06-11)。
// memory backend で直接呼び、IDOR / role ゲート / planned→active 遷移 / velocity 確定を確認。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Sprint, Ticket } from '@belvedere/shared';
import { createSprint, patchSprint, startSprint, ensureSprintCadence } from '../src/handlers/sprint-handlers';

const WS = 'ws-belvedere';
// 権限再設計 (2026-06-23): sprint.manage=admin/sm、sprint.goal=admin/po/sm。
const ADMIN = { workspaceId: WS, user: { userId: 'u-admin', email: 'admin@example.com' }, role: 'admin' as const };
const SM = { workspaceId: WS, user: { userId: 'u-sm', email: 'sm@example.com' }, role: 'sm' as const };
const PO = { workspaceId: WS, user: { userId: 'u-po', email: 'po@example.com' }, role: 'po' as const };
const DEV = { workspaceId: WS, user: { userId: 'u-dev', email: 'dev@example.com' }, role: 'dev' as const };
const OTHER = { workspaceId: 'ws-other', user: { userId: 'u-x', email: 'x@example.com' }, role: 'admin' as const };

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

describe('createSprint', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  const BODY = { goal: '最初のゴール', startsAt: '2026-06-15T00:00:00+09:00', endsAt: '2026-06-28T23:59:59+09:00' };

  it('正常系: planned スプリントを作成 (number は既存 max+1)', async () => {
    // WS には seed スプリントが既にある。max+1 を期待値として動的に算出する。
    const before = await repo.sprints.list({ workspaceId: WS });
    const expectedNumber = before.reduce((n, s) => Math.max(n, s.number), 0) + 1;
    const res = await createSprint(repo, ADMIN, BODY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.status).toBe('planned');
    expect(res.body.number).toBe(expectedNumber);
    expect(res.body.goal).toBe('最初のゴール');
    expect(res.body.workspaceId).toBe(WS);
    // 永続化確認
    const all = await repo.sprints.list({ workspaceId: WS });
    expect(all.some((s) => s.id === res.body.id)).toBe(true);
  });

  it('既存スプリントが無ければ number は 1 (c社 0 からの計画)', async () => {
    const emptyWsCtx = { workspaceId: 'ws-fresh', user: { userId: 'u-admin2', email: 'o@x.com' }, role: 'admin' as const };
    const res = await createSprint(repo, emptyWsCtx, BODY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.number).toBe(1);
  });

  it('正常系: sm も作成できる (sprint.manage = admin/sm)', async () => {
    const res = await createSprint(repo, SM, BODY);
    expect(res.ok).toBe(true);
  });

  it('403: dev は作成不可', async () => {
    const res = await createSprint(repo, DEV, BODY);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('403: po は作成不可 (sprint.manage は SM の専権 / マトリクス境界)', async () => {
    const res = await createSprint(repo, PO, BODY);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    // メッセージが「誰なら可能か」を伝える (forbidden ヘルパー)。
    expect(res.body.error).toBe('forbidden');
  });

  it('400: goal 空は弾く', async () => {
    const res = await createSprint(repo, ADMIN, { ...BODY, goal: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('400: startsAt > endsAt は弾く', async () => {
    const res = await createSprint(repo, ADMIN, {
      goal: 'x', startsAt: '2026-07-01T00:00:00+09:00', endsAt: '2026-06-01T00:00:00+09:00',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('patchSprint', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.sprints.upsert(sprint({ id: 'sprint-14', number: 14, status: 'planned' }));
  });

  it('正常系: goal/期間を編集 (status は変えない)', async () => {
    const res = await patchSprint(repo, ADMIN, 'sprint-14', {
      goal: '新ゴール', startsAt: '2026-05-06T00:00:00+09:00', endsAt: '2026-05-19T23:59:59+09:00',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.goal).toBe('新ゴール');
    expect(res.body.status).toBe('planned');
  });

  it('正常系: name を編集できる (Sprint.name 反映)', async () => {
    const res = await patchSprint(repo, ADMIN, 'sprint-14', { name: '決済MVP' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.name).toBe('決済MVP');
    expect(res.body.status).toBe('planned');
  });

  it('正常系: po も編集できる (sprint.goal = admin/po/sm)', async () => {
    const res = await patchSprint(repo, PO, 'sprint-14', { goal: 'POが決めたゴール' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.goal).toBe('POが決めたゴール');
  });

  it('正常系: sm も編集できる (sprint.goal = admin/po/sm)', async () => {
    const res = await patchSprint(repo, SM, 'sprint-14', { goal: 'SMが整えたゴール' });
    expect(res.ok).toBe(true);
  });

  it('403: dev は編集不可 (sprint.goal は admin/po/sm のみ)', async () => {
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
    const res = await patchSprint(repo, ADMIN, 'sprint-12', { goal: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('400: startsAt > endsAt は弾く', async () => {
    const res = await patchSprint(repo, ADMIN, 'sprint-14', {
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
    const res = await startSprint(repo, ADMIN, 'sprint-14', { goal: '次ゴール' });
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

  it('newNext を自動生成 (planned / number=max+1 / 仮名 Next Sprint / 期間は started の後)', async () => {
    const res = await startSprint(repo, ADMIN, 'sprint-14', { goal: '次ゴール' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.newNext.status).toBe('planned');
    expect(res.body.newNext.number).toBe(15); // max(13, 14) + 1
    expect(res.body.newNext.name).toBe('Next Sprint');
    // 期間は started.endsAt より後 (翌日開始)
    expect(Date.parse(res.body.newNext.startsAt)).toBeGreaterThan(Date.parse(res.body.started.endsAt));
    // 永続化: 繰上げ後の planned は newNext 1 件のみ (常時稼働を維持)
    const all = await repo.sprints.list({ workspaceId: WS });
    const planned = all.filter((s) => s.status === 'planned');
    expect(planned).toHaveLength(1);
    expect(planned[0]?.id).toBe(res.body.newNext.id);
  });

  it('start body の name を現スプリント (started) へ反映する', async () => {
    const res = await startSprint(repo, ADMIN, 'sprint-14', { goal: 'g', name: '決済MVP' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.started.name).toBe('決済MVP');
  });

  it('現 active が無くても開始できる (completed は null)', async () => {
    await repo.sprints.upsert(sprint({ id: 'sprint-13', number: 13, status: 'completed', velocity: 27 }));
    const res = await startSprint(repo, ADMIN, 'sprint-14', {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.started.status).toBe('active');
    expect(res.body.completed).toBeNull();
  });

  it('409: planned でない sprint は開始不可', async () => {
    const res = await startSprint(repo, ADMIN, 'sprint-13', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('正常系: sm も開始できる (sprint.manage = admin/sm)', async () => {
    const res = await startSprint(repo, SM, 'sprint-14', { goal: 'g' });
    expect(res.ok).toBe(true);
  });

  it('403: dev は開始不可', async () => {
    const res = await startSprint(repo, DEV, 'sprint-14', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('403: po は開始不可 (sprint.manage は SM の専権 / マトリクス境界)', async () => {
    const res = await startSprint(repo, PO, 'sprint-14', {});
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

describe('ensureSprintCadence (常時稼働ブートストラップ)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  // memory repo は ws-belvedere を seed 済みのため、空 ws は別 id を使う。
  const FRESH = 'ws-fresh-cadence';

  it('空 workspace → active 1 + planned 2 を補充する', async () => {
    await ensureSprintCadence(repo, FRESH);
    const all = await repo.sprints.list({ workspaceId: FRESH });
    const active = all.filter((s) => s.status === 'active');
    const planned = all.filter((s) => s.status === 'planned');
    expect(active).toHaveLength(1);
    expect(planned).toHaveLength(1);
    expect(active[0]?.number).toBe(1);
    expect(planned[0]?.number).toBe(2);
    expect(planned[0]?.name).toBe('Next Sprint'); // next は仮名
  });

  it('active 欠落 (completed / planned のみ) → active のみ補充し planned は据え置き', async () => {
    await repo.sprints.upsert(sprint({ id: 's-comp', number: 7, status: 'completed', velocity: 20, workspaceId: FRESH }));
    await repo.sprints.upsert(sprint({ id: 's-plan', number: 8, status: 'planned', workspaceId: FRESH }));
    await ensureSprintCadence(repo, FRESH);
    const all = await repo.sprints.list({ workspaceId: FRESH });
    expect(all.filter((s) => s.status === 'active')).toHaveLength(1);
    expect(all.filter((s) => s.status === 'planned')).toHaveLength(1);
    // 既存 planned は新規作成されず据え置き
    expect(all.find((s) => s.status === 'planned')?.id).toBe('s-plan');
    // 新 active の number は max(7, 8) + 1
    expect(all.find((s) => s.status === 'active')?.number).toBe(9);
  });

  it('active + planned が揃っていれば no-op (二重作成しない)', async () => {
    await repo.sprints.upsert(sprint({ id: 's-a', number: 3, status: 'active', workspaceId: FRESH }));
    await repo.sprints.upsert(sprint({ id: 's-p', number: 4, status: 'planned', workspaceId: FRESH }));
    await ensureSprintCadence(repo, FRESH);
    const all = await repo.sprints.list({ workspaceId: FRESH });
    expect(all).toHaveLength(2);
  });

  it('並行呼び出しでも二重作成しない (ensureLocks 直列化)', async () => {
    await Promise.all(Array.from({ length: 5 }, () => ensureSprintCadence(repo, FRESH)));
    const all = await repo.sprints.list({ workspaceId: FRESH });
    expect(all.filter((s) => s.status === 'active')).toHaveLength(1);
    expect(all.filter((s) => s.status === 'planned')).toHaveLength(1);
  });
});
