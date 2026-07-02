// Workspace 管理ハンドラ + 招待 bind の単体テスト (Phase 1-E 前倒し / 2026-06-12)。
// memory backend で直接呼び、作成 / 所属スコープ / 招待 role ゲート / bind の純粋性を確認。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Member } from '@belvedere/shared';
import {
  createWorkspace,
  listMyWorkspaces,
  inviteMember,
  cancelInvite,
  patchWorkspace,
} from '../src/handlers/workspace-handlers';
import { planInviteBind, inviteSentinelId, isInviteSentinel } from '../src/config/invite-bind';

const ME = { user: { userId: 'uid-me', email: 'Founder@Example.com' } };

describe('createWorkspace', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: Workspace 作成 + 作成者を admin として Member 登録', async () => {
    const res = await createWorkspace(repo, ME, { name: 'C社', productGoal: '0 から回す' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.workspace.name).toBe('C社');
    expect(res.body.workspace.ownerId).toBe('uid-me');
    expect(res.body.workspace.id.startsWith('ws-')).toBe(true);
    // 作成者は admin として登録される (= 自分の部屋でなんでもできる / 権限再設計 2026-06-23)
    expect(res.body.member.role).toBe('admin');
    expect(res.body.member.workspaceId).toBe(res.body.workspace.id);
    // displayName は email local part
    expect(res.body.member.displayName).toBe('Founder');
    // 永続化確認
    const stored = await repo.workspaces.get(res.body.workspace.id);
    expect(stored?.name).toBe('C社');
    const mem = await repo.members.get(res.body.workspace.id, 'uid-me');
    expect(mem?.role).toBe('admin');
  });

  it('400: name 空は弾く', async () => {
    const res = await createWorkspace(repo, ME, { name: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('slug 衝突時は id をサフィックスで一意化', async () => {
    const a = await createWorkspace(repo, ME, { name: 'Same Name' });
    const b = await createWorkspace(repo, { user: { userId: 'uid-2', email: 'x@example.com' } }, { name: 'Same Name' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.body.workspace.id).not.toBe(b.body.workspace.id);
  });
});

describe('listMyWorkspaces', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('スコープ: 自分が Member の ws のみ返す', async () => {
    // 自分が owner の ws-a、他人だけの ws-b
    await repo.members.upsert({ userId: 'uid-me', workspaceId: 'ws-a', email: 'me@x.com', displayName: 'Me', role: 'admin' });
    await repo.workspaces.upsert({ id: 'ws-a', name: 'A社', slug: 'a', productGoal: '', ownerId: 'uid-me', createdAt: '2026-06-12T00:00:00Z' });
    await repo.members.upsert({ userId: 'uid-other', workspaceId: 'ws-b', email: 'o@x.com', displayName: 'O', role: 'admin' });

    const res = await listMyWorkspaces(repo, ME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((w) => w.id)).toEqual(['ws-a']);
    expect(res.body[0]?.name).toBe('A社');
    expect(res.body[0]?.role).toBe('admin');
  });

  it('Workspace doc が無い既存 ws は id を name にフォールバック (壊さない)', async () => {
    // ws-belvedere は seed に Workspace doc が無い (members のみ)
    await repo.members.upsert({ userId: 'uid-me', workspaceId: 'ws-belvedere', email: 'me@x.com', displayName: 'Me', role: 'admin' });
    const res = await listMyWorkspaces(repo, ME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toEqual([{ id: 'ws-belvedere', name: 'ws-belvedere', role: 'admin', productGoal: '' }]);
  });

  it('招待中 (センチネル) は listByUserId に引っかからない = 招待された人には表示されない', async () => {
    await repo.members.upsert({
      userId: inviteSentinelId('ws-a', 'invitee@x.com'),
      workspaceId: 'ws-a', email: 'invitee@x.com', displayName: 'invitee', role: 'dev',
    });
    const res = await listMyWorkspaces(repo, { user: { userId: 'uid-invitee', email: 'invitee@x.com' } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toEqual([]);
  });
});

describe('inviteMember / cancelInvite', () => {
  let repo: RepoContainer;
  // 権限再設計 (2026-06-23): member.invite = admin/po/sm。dev は不可。
  const ADMIN = { workspaceId: 'ws-a', user: { userId: 'uid-admin', email: 'admin@x.com' }, role: 'admin' as const };
  const PO = { workspaceId: 'ws-a', user: { userId: 'uid-po', email: 'po@x.com' }, role: 'po' as const };
  const SM = { workspaceId: 'ws-a', user: { userId: 'uid-sm', email: 'sm@x.com' }, role: 'sm' as const };
  const DEV = { workspaceId: 'ws-a', user: { userId: 'uid-dev', email: 'dev@x.com' }, role: 'dev' as const };
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: admin が招待 → センチネル Member 作成', async () => {
    const res = await inviteMember(repo, ADMIN, { email: 'New@X.com', role: 'dev' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.email).toBe('new@x.com'); // 正規化
    expect(res.body.role).toBe('dev');
    expect(isInviteSentinel(res.body)).toBe(true);
    expect(res.body.workspaceId).toBe('ws-a');
  });

  it('正常系: po も招待できる (member.invite = admin/po/sm)', async () => {
    const res = await inviteMember(repo, PO, { email: 'p-invitee@x.com', role: 'dev' });
    expect(res.ok).toBe(true);
  });

  it('正常系: sm も招待できる (member.invite = admin/po/sm)', async () => {
    const res = await inviteMember(repo, SM, { email: 's-invitee@x.com', role: 'po' });
    expect(res.ok).toBe(true);
  });

  it('403: dev は招待不可 (member.invite は admin/po/sm のみ)', async () => {
    const res = await inviteMember(repo, DEV, { email: 'x@x.com', role: 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    // メッセージが「誰なら可能か」を伝える。
    expect(res.body.error).toBe('forbidden');
    const details = res.body as { action?: string; message?: string };
    expect(details.action).toBe('member.invite');
    expect((details.message ?? '').length).toBeGreaterThan(0);
  });

  it('400: role admin は招待で付与不可 (作成者のみが admin)', async () => {
    const res = await inviteMember(repo, ADMIN, { email: 'x@x.com', role: 'admin' as 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('400: 旧 role owner も招待で付与不可 (enum 外)', async () => {
    const res = await inviteMember(repo, ADMIN, { email: 'x@x.com', role: 'owner' as 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('409: 同 email が当該 ws に既存なら重複招待不可', async () => {
    await repo.members.upsert({ userId: 'uid-exist', workspaceId: 'ws-a', email: 'dup@x.com', displayName: 'D', role: 'dev' });
    const res = await inviteMember(repo, ADMIN, { email: 'dup@x.com', role: 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('cancelInvite: owner は招待センチネルを取消できる', async () => {
    const inv = await inviteMember(repo, ADMIN, { email: 'pending@x.com', role: 'dev' });
    expect(inv.ok).toBe(true);
    if (!inv.ok) return;
    const res = await cancelInvite(repo, ADMIN, inv.body.userId);
    expect(res.ok).toBe(true);
    expect(await repo.members.get(ADMIN.workspaceId, inv.body.userId)).toBeNull();
  });

  it('cancelInvite 409: 加入済メンバー (実 uid) は取消対象外', async () => {
    await repo.members.upsert({ userId: 'uid-real', workspaceId: 'ws-a', email: 'real@x.com', displayName: 'R', role: 'dev' });
    const res = await cancelInvite(repo, ADMIN, 'uid-real');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('cancelInvite 404: 別 ws の招待は存在しない扱い', async () => {
    await repo.members.upsert({
      userId: inviteSentinelId('ws-other', 'p@x.com'),
      workspaceId: 'ws-other', email: 'p@x.com', displayName: 'p', role: 'dev',
    });
    const res = await cancelInvite(repo, ADMIN, inviteSentinelId('ws-other', 'p@x.com'));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('planInviteBind (純粋関数)', () => {
  const sentinel = (ws: string, email: string): Member => ({
    userId: inviteSentinelId(ws, email),
    workspaceId: ws, email, displayName: 'x', role: 'dev',
  });

  it('招待 → bind: センチネルを実 uid に付け替える plan を返す', () => {
    const plan = planInviteBind('uid-real', 'a@x.com', [sentinel('ws-a', 'a@x.com')]);
    expect(plan).not.toBeNull();
    expect(plan?.bound.userId).toBe('uid-real');
    expect(plan?.bound.workspaceId).toBe('ws-a');
    expect(plan?.bound.role).toBe('dev');
    expect(plan?.sentinel.userId).toBe(inviteSentinelId('ws-a', 'a@x.com'));
  });

  it('既存メンバー (実 uid) は bind しない (null)', () => {
    const existing: Member = { userId: 'uid-real', workspaceId: 'ws-a', email: 'a@x.com', displayName: 'A', role: 'admin' };
    const plan = planInviteBind('uid-real', 'a@x.com', [existing]);
    expect(plan).toBeNull();
  });

  it('別人の招待 (email 不一致) には bind しない', () => {
    const plan = planInviteBind('uid-real', 'me@x.com', [sentinel('ws-a', 'someone-else@x.com')]);
    expect(plan).toBeNull();
  });

  it('email 大文字小文字を正規化して突合する', () => {
    const plan = planInviteBind('uid-real', 'A@X.com', [sentinel('ws-a', 'a@x.com')]);
    expect(plan).not.toBeNull();
  });
});

describe('patchWorkspace (Product Goal 編集 / WC-23)', () => {
  let repo: RepoContainer;
  let wsId: string;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    const created = await createWorkspace(repo, ME, { name: 'C社', productGoal: '初期ゴール' });
    if (!created.ok) throw new Error('setup failed');
    wsId = created.body.workspace.id;
  });

  const ctx = (workspaceId: string, role: 'admin' | 'po' | 'sm' | 'dev') => ({
    user: ME.user, workspaceId, role,
  });

  it('admin (作成者) は productGoal を編集できる', async () => {
    const res = await patchWorkspace(repo, ctx(wsId, 'admin'), wsId, { productGoal: '決済MVPを本番リリース' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.productGoal).toBe('決済MVPを本番リリース');
    const stored = await repo.workspaces.get(wsId);
    expect(stored?.productGoal).toBe('決済MVPを本番リリース');
  });

  it('po も編集できる', async () => {
    const res = await patchWorkspace(repo, ctx(wsId, 'po'), wsId, { productGoal: 'PO 更新' });
    expect(res.ok).toBe(true);
  });

  it('dev / sm は 403 (product.goal は po/admin のみ)', async () => {
    for (const role of ['dev', 'sm'] as const) {
      const res = await patchWorkspace(repo, ctx(wsId, role), wsId, { productGoal: 'x' });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(403);
    }
  });

  it('別 workspace の id は 404 (IDOR: 認証 ws 以外は編集不可)', async () => {
    const res = await patchWorkspace(repo, ctx(wsId, 'admin'), 'ws-other', { productGoal: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('productGoal 欠落は 400', async () => {
    const res = await patchWorkspace(repo, ctx(wsId, 'admin'), wsId, {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('listMyWorkspaces は productGoal を含めて返す', async () => {
    await patchWorkspace(repo, ctx(wsId, 'admin'), wsId, { productGoal: '一覧に出るゴール' });
    const res = await listMyWorkspaces(repo, ME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const mine = res.body.find((w) => w.id === wsId);
    expect(mine?.productGoal).toBe('一覧に出るゴール');
  });
});
