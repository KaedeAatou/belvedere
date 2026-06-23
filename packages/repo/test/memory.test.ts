// memory backend の where / get / upsert ガード (Phase 1-B 末 / 2026-06-09)。
// 全 Agent / Tools / UI が repo.tickets.list({...}) や repo.epics.list({projectId}) を呼ぶため、
// where フィルタが壊れると Refinement の 6 観点や Daily の停滞検出が静かに誤動作する。
// 同インタフェースの Firestore backend (firestore.ts) も同じ where 契約を満たす想定。
// 関連 seed: 12 tickets / 3 sprints / 1 project / 4 epics / 5 members (immutable fixture)。
//
// Phase 1-B (2026-06-10): IDOR fix で全 list は workspaceId 必須化。
// 関連 entity の workspaceId は seed 全件 'ws-belvedere'。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer } from '../src/memory';
import type { RepoContainer } from '../src/types';

const WS = 'ws-belvedere';
const OTHER_WS = 'ws-other-tenant';

describe('memory backend - seed counts', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('tickets seed = 12 (workspace=ws-belvedere)', async () => {
    expect((await repo.tickets.list({ workspaceId: WS })).length).toBe(12);
  });
  it('sprints seed = 3', async () => {
    expect((await repo.sprints.list({ workspaceId: WS })).length).toBe(3);
  });
  it('projects seed = 1', async () => {
    expect((await repo.projects.list({ workspaceId: WS })).length).toBe(1);
  });
  it('epics seed = 4', async () => {
    expect((await repo.epics.list({ workspaceId: WS })).length).toBe(4);
  });
  it('members seed = 5', async () => {
    expect((await repo.members.list({ workspaceId: WS })).length).toBe(5);
  });
});

describe('memory backend - IDOR fix (workspaceId filter)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('別 workspace の tickets は空配列を返す', async () => {
    expect((await repo.tickets.list({ workspaceId: OTHER_WS })).length).toBe(0);
  });
  it('別 workspace の sprints は空配列を返す', async () => {
    expect((await repo.sprints.list({ workspaceId: OTHER_WS })).length).toBe(0);
  });
  it('別 workspace の epics は空配列を返す', async () => {
    expect((await repo.epics.list({ workspaceId: OTHER_WS })).length).toBe(0);
  });
  it('別 workspace の members は空配列を返す', async () => {
    expect((await repo.members.list({ workspaceId: OTHER_WS })).length).toBe(0);
  });
  it('別 workspace の projects は空配列を返す', async () => {
    expect((await repo.projects.list({ workspaceId: OTHER_WS })).length).toBe(0);
  });
});

describe('memory backend - listByUserId (workspace 解決 middleware 用)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('seed の admin (kaede) は 1 件の Workspace に所属', async () => {
    const memberships = await repo.members.listByUserId('kaede');
    expect(memberships.length).toBe(1);
    expect(memberships[0]?.workspaceId).toBe(WS);
    expect(memberships[0]?.role).toBe('admin');
  });
  it('未登録 user は 0 件を返す (= invitation_required 403)', async () => {
    const memberships = await repo.members.listByUserId('unknown-user-xyz');
    expect(memberships.length).toBe(0);
  });
});

describe('memory backend - Member upsert (Phase 1-B / 初回メンバー自動登録)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('新規 Member を upsert すると listByUserId で取れる', async () => {
    const newMember = {
      userId: 'firebase-uid-test-1',
      workspaceId: WS,
      email: 'test1@example.com',
      displayName: 'Test 1',
      role: 'admin' as const,
    };
    await repo.members.upsert(newMember);
    const found = await repo.members.listByUserId('firebase-uid-test-1');
    expect(found.length).toBe(1);
    expect(found[0]?.role).toBe('admin');
    expect(found[0]?.workspaceId).toBe(WS);
  });

  it('同じ userId で upsert すると更新される (role 変更デモ)', async () => {
    const m1 = {
      userId: 'firebase-uid-test-2',
      workspaceId: WS,
      email: 'test2@example.com',
      displayName: 'Test 2',
      role: 'dev' as const,
    };
    await repo.members.upsert(m1);
    await repo.members.upsert({ ...m1, role: 'admin' });
    const found = await repo.members.listByUserId('firebase-uid-test-2');
    expect(found.length).toBe(1);
    expect(found[0]?.role).toBe('admin');
  });

  it('別 workspace で upsert しても listByUserId は跨いで全件返す', async () => {
    const m1 = {
      userId: 'firebase-uid-test-3',
      workspaceId: WS,
      email: 'test3@example.com',
      displayName: 'Test 3',
      role: 'dev' as const,
    };
    const m2 = { ...m1, userId: 'firebase-uid-test-3-other', workspaceId: 'ws-another' };
    await repo.members.upsert(m1);
    await repo.members.upsert(m2);
    // listByUserId は userId が完全一致 (新規 userId なので 1 件のみ)
    expect((await repo.members.listByUserId('firebase-uid-test-3')).length).toBe(1);
    expect((await repo.members.listByUserId('firebase-uid-test-3-other')).length).toBe(1);
  });

  // 回帰テスト (マルチテナント破壊バグ): doc id が userId 単独だった頃は、同じ userId で
  // 別 workspace の Member を upsert すると前の所属を上書きして消していた。
  // 複合キー `${workspaceId}:${userId}` 化でこれが壊れないことを固定する。
  it('同一 userId × 別 workspaceId を 2 件 upsert すると listByUserId が 2 件返す (複数 Workspace 所属)', async () => {
    const base = {
      userId: 'firebase-uid-multi',
      email: 'multi@example.com',
      displayName: 'Multi',
      role: 'dev' as const,
    };
    await repo.members.upsert({ ...base, workspaceId: WS, role: 'admin' });
    await repo.members.upsert({ ...base, workspaceId: 'ws-second' });

    // 同じ userId で 2 つの Workspace に所属できる (= 後の upsert が前を上書きしない)。
    const all = await repo.members.listByUserId('firebase-uid-multi');
    expect(all.length).toBe(2);
    expect(new Set(all.map((m) => m.workspaceId))).toEqual(new Set([WS, 'ws-second']));

    // 複合キー get は workspace ごとに別 doc を返す (role も独立)。
    expect((await repo.members.get(WS, 'firebase-uid-multi'))?.role).toBe('admin');
    expect((await repo.members.get('ws-second', 'firebase-uid-multi'))?.role).toBe('dev');

    // list({ workspaceId }) は当該 ws の 1 件だけにスコープされる。
    expect((await repo.members.list({ workspaceId: WS })).filter((m) => m.userId === 'firebase-uid-multi').length).toBe(1);
    expect((await repo.members.list({ workspaceId: 'ws-second' })).length).toBe(1);
  });

  it('複合キー delete は 1 Workspace 分だけを消す (他 ws の所属は残る)', async () => {
    const base = {
      userId: 'firebase-uid-del',
      email: 'del@example.com',
      displayName: 'Del',
      role: 'dev' as const,
    };
    await repo.members.upsert({ ...base, workspaceId: WS });
    await repo.members.upsert({ ...base, workspaceId: 'ws-second' });

    await repo.members.delete(WS, 'firebase-uid-del');
    expect(await repo.members.get(WS, 'firebase-uid-del')).toBeNull();
    // 別 ws の所属は無傷
    expect((await repo.members.get('ws-second', 'firebase-uid-del'))?.workspaceId).toBe('ws-second');
    expect((await repo.members.listByUserId('firebase-uid-del')).length).toBe(1);
  });
});

describe('memory backend - tickets where filters', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('filters by ritual', async () => {
    const retro = await repo.tickets.list({ workspaceId: WS, ritual: 'retrospective' });
    expect(retro.length).toBeGreaterThan(0);
    expect(retro.every((t) => t.ritual === 'retrospective')).toBe(true);
  });

  it('filters by status', async () => {
    const inProgress = await repo.tickets.list({ workspaceId: WS, status: 'in-progress' });
    expect(inProgress.every((t) => t.status === 'in-progress')).toBe(true);
  });

  it('filters by sprintId', async () => {
    const all = await repo.tickets.list({ workspaceId: WS });
    const someSprint = all.find((t) => t.sprintId)?.sprintId;
    expect(someSprint).toBeDefined();
    if (!someSprint) return;
    const xs = await repo.tickets.list({ workspaceId: WS, sprintId: someSprint });
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((t) => t.sprintId === someSprint)).toBe(true);
  });

  it('filters by assigneeId', async () => {
    const all = await repo.tickets.list({ workspaceId: WS });
    const someAssignee = all.find((t) => t.assigneeId)?.assigneeId;
    expect(someAssignee).toBeDefined();
    if (!someAssignee) return;
    const xs = await repo.tickets.list({ workspaceId: WS, assigneeId: someAssignee });
    expect(xs.every((t) => t.assigneeId === someAssignee)).toBe(true);
  });

  it('workspaceId のみ指定 = 全 12 件', async () => {
    const all = await repo.tickets.list({ workspaceId: WS });
    expect(all.length).toBe(12);
  });

  // F1: firestore.ts との契約一致 (memory ⇔ firestore TicketQuery divergence 修正)
  it('filters by projectId (parity with FsTicketRepo)', async () => {
    const all = await repo.tickets.list({ workspaceId: WS });
    const someProjectId = all.find((t) => t.projectId)?.projectId;
    // seed が projectId を持つチケットを少なくとも 1 件含むことが前提
    expect(someProjectId).toBeDefined();
    if (!someProjectId) return;
    const xs = await repo.tickets.list({ workspaceId: WS, projectId: someProjectId });
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((t) => t.projectId === someProjectId)).toBe(true);
  });

  // F8: firestore.ts (ignoreUndefinedProperties: true) との shape parity
  it('upsert strips undefined fields (parity with Firestore ignoreUndefinedProperties)', async () => {
    await repo.tickets.upsert({
      id: 'TEST-PARITY-1',
      workspaceId: WS,
      title: 'parity check',
      status: 'todo',
      priority: 'low',
      // 以下は intentionally undefined
      valueImpact: undefined,
      ritual: undefined,
      assigneeId: undefined,
      createdAt: '2026-06-09T00:00:00Z',
      updatedAt: '2026-06-09T00:00:00Z',
      createdBy: 'human',
    });
    const got = await repo.tickets.get('TEST-PARITY-1');
    expect(got).not.toBeNull();
    if (!got) return;
    // undefined フィールドはキーごと消える (Firestore と同じ shape)
    expect('valueImpact' in got).toBe(false);
    expect('ritual' in got).toBe(false);
    expect('assigneeId' in got).toBe(false);
    // 必須フィールドは残る
    expect('title' in got).toBe(true);
    expect(got.title).toBe('parity check');
    await repo.tickets.delete('TEST-PARITY-1');
  });

  it('filters by storyId via parentTicketId (parity with FsTicketRepo)', async () => {
    // storyId は親 ticket (User Story) を指す。WC-101..112 の seed に parentTicketId を持つチケットがあれば
    // それで検索、無ければ任意の文字列でゼロ件返却を確認
    const all = await repo.tickets.list({ workspaceId: WS });
    const someParent = all.find((t) => t.parentTicketId)?.parentTicketId;
    if (someParent) {
      const xs = await repo.tickets.list({ workspaceId: WS, storyId: someParent });
      expect(xs.every((t) => t.parentTicketId === someParent)).toBe(true);
    } else {
      // parentTicketId を持つ seed が無い場合: 任意 ID でフィルタするとゼロ件
      const xs = await repo.tickets.list({ workspaceId: WS, storyId: 'NOT-A-REAL-STORY' });
      expect(xs.length).toBe(0);
    }
  });
});

describe('memory backend - tickets list() フォールバックソート (orderIndex / priority / createdAt)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  // 既存 seed には orderIndex が無いため、list() のデフォルト並びは priority 降順 → createdAt 昇順。
  it('orderIndex 未設定の seed は priority 降順 → createdAt 昇順で並ぶ', async () => {
    const xs = await repo.tickets.list({ workspaceId: WS });
    const rank: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
    for (let i = 1; i < xs.length; i++) {
      const prev = xs[i - 1]!;
      const cur = xs[i]!;
      // priority は降順 (rank が単調非増加)
      expect(rank[prev.priority]!).toBeGreaterThanOrEqual(rank[cur.priority]!);
      // 同 priority 内は createdAt 昇順
      if (prev.priority === cur.priority) {
        expect(prev.createdAt.localeCompare(cur.createdAt)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('orderIndex を持つチケットは orderIndex 昇順で、未設定のものより前に並ぶ', async () => {
    // orderIndex を 3 件に付与 (意図的に登録順とは逆順の値)
    const seedList = await repo.tickets.list({ workspaceId: WS });
    const [a, b, c] = [seedList[0]!, seedList[1]!, seedList[2]!];
    await repo.tickets.upsert({ ...a, orderIndex: 3000 });
    await repo.tickets.upsert({ ...b, orderIndex: 1000 });
    await repo.tickets.upsert({ ...c, orderIndex: 2000 });

    const xs = await repo.tickets.list({ workspaceId: WS });
    // 先頭 3 件は orderIndex 昇順 (b=1000, c=2000, a=3000)
    expect(xs[0]!.id).toBe(b.id);
    expect(xs[1]!.id).toBe(c.id);
    expect(xs[2]!.id).toBe(a.id);
    // orderIndex 付与した 3 件は orderIndex 無しの残りより前
    const firstWithoutOrder = xs.findIndex((t) => t.orderIndex === undefined);
    expect(firstWithoutOrder).toBe(3);
  });

  it('fractional な中間値 orderIndex でも昇順を保つ', async () => {
    const seedList = await repo.tickets.list({ workspaceId: WS });
    const [a, b] = [seedList[0]!, seedList[1]!];
    await repo.tickets.upsert({ ...a, orderIndex: 1000 });
    await repo.tickets.upsert({ ...b, orderIndex: 1000.5 }); // a と次の間に挿入した想定
    const xs = await repo.tickets.list({ workspaceId: WS });
    expect(xs[0]!.id).toBe(a.id);
    expect(xs[1]!.id).toBe(b.id);
  });
});

describe('memory backend - get / upsert / delete', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('get(known id) returns the ticket', async () => {
    const all = await repo.tickets.list({ workspaceId: WS });
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
      workspaceId: WS,
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

  it('lists all epics without projectId filter', async () => {
    expect((await repo.epics.list({ workspaceId: WS })).length).toBe(4);
  });

  it('filters epics by projectId when seed has projectId', async () => {
    const all = await repo.epics.list({ workspaceId: WS });
    const someProjectId = all.find((e) => e.projectId)?.projectId;
    if (!someProjectId) return; // seed が projectId を持たない場合は skip 相当
    const filtered = await repo.epics.list({ workspaceId: WS, projectId: someProjectId });
    expect(filtered.every((e) => e.projectId === someProjectId)).toBe(true);
  });
});

describe('memory backend - Refinement 第6観点デモ前提', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('exactly one epic (EP-3) has rationale missing as the canonical demo case', async () => {
    // PITCH / 5 儀式 UI / Refinement Agent デモは「EP-3 だけ rationale 空」を前提にしている。
    // seed を意図せず触ると壊れる契約なのでテストで固定する。
    const epics = await repo.epics.list({ workspaceId: WS });
    const missing = epics.filter((e) => !e.rationale || e.rationale.trim() === '');
    expect(missing.map((e) => e.id)).toEqual(['EP-3']);
  });
});

describe('memory backend - estimations (見積もりポーカー / T2)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('upsert → get / ticketId・status フィルタ / workspace 分離', async () => {
    await repo.estimations.upsert({
      id: 'EST-1',
      workspaceId: WS,
      ticketId: 'WC-101',
      status: 'voting',
      votes: [{ userId: 'kaede', value: 5, submittedAt: '2026-06-11T00:00:00Z' }],
      createdAt: '2026-06-11T00:00:00Z',
      createdBy: 'kaede',
    });
    expect((await repo.estimations.get('EST-1'))?.ticketId).toBe('WC-101');
    expect((await repo.estimations.list({ workspaceId: WS, ticketId: 'WC-101' })).length).toBe(1);
    expect((await repo.estimations.list({ workspaceId: WS, status: 'revealed' })).length).toBe(0);
    expect((await repo.estimations.list({ workspaceId: 'ws-other' })).length).toBe(0);
  });
});
