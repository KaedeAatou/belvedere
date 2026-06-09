// memory backend の where / get / upsert ガード (Phase 1-B 末 / 2026-06-09)。
// 全 Agent / Tools / UI が repo.tickets.list({...}) や repo.epics.list({projectId}) を呼ぶため、
// where フィルタが壊れると Refinement の 6 観点や Daily の停滞検出が静かに誤動作する。
// 同インタフェースの Firestore backend (firestore.ts) も同じ where 契約を満たす想定。
// 関連 seed: 12 tickets / 3 sprints / 1 project / 4 epics / 5 members (immutable fixture)。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer } from '../src/memory';
import type { RepoContainer } from '../src/types';

describe('memory backend - seed counts', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('tickets seed = 12', async () => {
    expect((await repo.tickets.list()).length).toBe(12);
  });
  it('sprints seed = 3', async () => {
    expect((await repo.sprints.list()).length).toBe(3);
  });
  it('projects seed = 1', async () => {
    expect((await repo.projects.list()).length).toBe(1);
  });
  it('epics seed = 4', async () => {
    expect((await repo.epics.list()).length).toBe(4);
  });
  it('members seed = 5', async () => {
    expect((await repo.members.list()).length).toBe(5);
  });
});

describe('memory backend - tickets where filters', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('filters by ritual', async () => {
    const retro = await repo.tickets.list({ ritual: 'retrospective' });
    expect(retro.length).toBeGreaterThan(0);
    expect(retro.every((t) => t.ritual === 'retrospective')).toBe(true);
  });

  it('filters by status', async () => {
    const inProgress = await repo.tickets.list({ status: 'in-progress' });
    expect(inProgress.every((t) => t.status === 'in-progress')).toBe(true);
  });

  it('filters by sprintId', async () => {
    const all = await repo.tickets.list();
    const someSprint = all.find((t) => t.sprintId)?.sprintId;
    expect(someSprint).toBeDefined();
    if (!someSprint) return;
    const xs = await repo.tickets.list({ sprintId: someSprint });
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((t) => t.sprintId === someSprint)).toBe(true);
  });

  it('filters by assigneeId', async () => {
    const all = await repo.tickets.list();
    const someAssignee = all.find((t) => t.assigneeId)?.assigneeId;
    expect(someAssignee).toBeDefined();
    if (!someAssignee) return;
    const xs = await repo.tickets.list({ assigneeId: someAssignee });
    expect(xs.every((t) => t.assigneeId === someAssignee)).toBe(true);
  });

  it('empty filter = full list', async () => {
    const all = await repo.tickets.list({});
    expect(all.length).toBe(12);
  });
});

describe('memory backend - get / upsert / delete', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('get(known id) returns the ticket', async () => {
    const all = await repo.tickets.list();
    const sample = all[0];
    expect(sample).toBeDefined();
    if (!sample) return;
    const got = await repo.tickets.get(sample.id);
    expect(got?.id).toBe(sample.id);
  });

  it('get(unknown id) returns null', async () => {
    expect(await repo.tickets.get('NOT-EXIST-9999')).toBeNull();
  });

  it('upsert adds a new ticket then delete removes it', async () => {
    await repo.tickets.upsert({
      id: 'TEST-MEM-1',
      title: 'memory backend upsert test',
      status: 'todo',
      priority: 'low',
      createdAt: '2026-06-09T00:00:00Z',
      updatedAt: '2026-06-09T00:00:00Z',
      createdBy: 'human',
    });
    expect((await repo.tickets.get('TEST-MEM-1'))?.title).toBe('memory backend upsert test');
    await repo.tickets.delete('TEST-MEM-1');
    expect(await repo.tickets.get('TEST-MEM-1')).toBeNull();
  });
});

describe('memory backend - epics where projectId', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('lists all epics without filter', async () => {
    expect((await repo.epics.list()).length).toBe(4);
  });

  it('filters epics by projectId when seed has projectId', async () => {
    const all = await repo.epics.list();
    const someProjectId = all.find((e) => e.projectId)?.projectId;
    if (!someProjectId) return; // seed が projectId を持たない場合は skip 相当
    const filtered = await repo.epics.list({ projectId: someProjectId });
    expect(filtered.every((e) => e.projectId === someProjectId)).toBe(true);
  });
});

describe('memory backend - Refinement 第6観点デモ前提', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('exactly one epic (EP-3) has rationale missing as the canonical demo case', async () => {
    // PITCH / 5 儀式 UI / Refinement Agent デモは「EP-3 だけ rationale 空」を前提にしている。
    // seed を意図せず触ると壊れる契約なのでテストで固定する。
    const epics = await repo.epics.list();
    const missing = epics.filter((e) => !e.rationale || e.rationale.trim() === '');
    expect(missing.map((e) => e.id)).toEqual(['EP-3']);
  });
});
