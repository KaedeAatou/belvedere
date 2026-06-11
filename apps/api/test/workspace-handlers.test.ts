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
} from '../src/handlers/workspace-handlers';
import { planInviteBind, inviteSentinelId, isInviteSentinel } from '../src/config/invite-bind';

const ME = { user: { userId: 'uid-me', email: 'Founder@Example.com' } };

describe('createWorkspace', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: Workspace 作成 + 作成者を owner として Member 登録', async () => {
    const res = await createWorkspace(repo, ME, { name: 'C社', productGoal: '0 から回す' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.workspace.name).toBe('C社');
    expect(res.body.workspace.ownerId).toBe('uid-me');
    expect(res.body.workspace.id.startsWith('ws-')).toBe(true);
    // 作成者が owner として登録される
    expect(res.body.member.role).toBe('owner');
    expect(res.body.member.workspaceId).toBe(res.body.workspace.id);
    // displayName は email local part
    expect(res.body.member.displayName).toBe('Founder');
    // 永続化確認
    const stored = await repo.workspaces.get(res.body.workspace.id);
    expect(stored?.name).toBe('C社');
    const mem = await repo.members.get('uid-me');
    expect(mem?.role).toBe('owner');
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
    await repo.members.upsert({ userId: 'uid-me', workspaceId: 'ws-a', email: 'me@x.com', displayName: 'Me', role: 'owner' });
    await repo.workspaces.upsert({ id: 'ws-a', name: 'A社', slug: 'a', productGoal: '', ownerId: 'uid-me', createdAt: '2026-06-12T00:00:00Z' });
    await repo.members.upsert({ userId: 'uid-other', workspaceId: 'ws-b', email: 'o@x.com', displayName: 'O', role: 'owner' });

    const res = await listMyWorkspaces(repo, ME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((w) => w.id)).toEqual(['ws-a']);
    expect(res.body[0]?.name).toBe('A社');
    expect(res.body[0]?.role).toBe('owner');
  });

  it('Workspace doc が無い既存 ws は id を name にフォールバック (壊さない)', async () => {
    // ws-belvedere は seed に Workspace doc が無い (members のみ)
    await repo.members.upsert({ userId: 'uid-me', workspaceId: 'ws-belvedere', email: 'me@x.com', displayName: 'Me', role: 'owner' });
    const res = await listMyWorkspaces(repo, ME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toEqual([{ id: 'ws-belvedere', name: 'ws-belvedere', role: 'owner' }]);
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
  const OWNER = { workspaceId: 'ws-a', user: { userId: 'uid-owner', email: 'owner@x.com' }, role: 'owner' as const };
  const DEV = { workspaceId: 'ws-a', user: { userId: 'uid-dev', email: 'dev@x.com' }, role: 'dev' as const };
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: owner が招待 → センチネル Member 作成', async () => {
    const res = await inviteMember(repo, OWNER, { email: 'New@X.com', role: 'dev' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.email).toBe('new@x.com'); // 正規化
    expect(res.body.role).toBe('dev');
    expect(isInviteSentinel(res.body)).toBe(true);
    expect(res.body.workspaceId).toBe('ws-a');
  });

  it('403: dev は招待不可 (owner/sm のみ)', async () => {
    const res = await inviteMember(repo, DEV, { email: 'x@x.com', role: 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('400: role owner は招待で付与不可', async () => {
    const res = await inviteMember(repo, OWNER, { email: 'x@x.com', role: 'owner' as 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('409: 同 email が当該 ws に既存なら重複招待不可', async () => {
    await repo.members.upsert({ userId: 'uid-exist', workspaceId: 'ws-a', email: 'dup@x.com', displayName: 'D', role: 'dev' });
    const res = await inviteMember(repo, OWNER, { email: 'dup@x.com', role: 'dev' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('cancelInvite: owner は招待センチネルを取消できる', async () => {
    const inv = await inviteMember(repo, OWNER, { email: 'pending@x.com', role: 'dev' });
    expect(inv.ok).toBe(true);
    if (!inv.ok) return;
    const res = await cancelInvite(repo, OWNER, inv.body.userId);
    expect(res.ok).toBe(true);
    expect(await repo.members.get(inv.body.userId)).toBeNull();
  });

  it('cancelInvite 409: 加入済メンバー (実 uid) は取消対象外', async () => {
    await repo.members.upsert({ userId: 'uid-real', workspaceId: 'ws-a', email: 'real@x.com', displayName: 'R', role: 'dev' });
    const res = await cancelInvite(repo, OWNER, 'uid-real');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('cancelInvite 404: 別 ws の招待は存在しない扱い', async () => {
    await repo.members.upsert({
      userId: inviteSentinelId('ws-other', 'p@x.com'),
      workspaceId: 'ws-other', email: 'p@x.com', displayName: 'p', role: 'dev',
    });
    const res = await cancelInvite(repo, OWNER, inviteSentinelId('ws-other', 'p@x.com'));
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
    const existing: Member = { userId: 'uid-real', workspaceId: 'ws-a', email: 'a@x.com', displayName: 'A', role: 'owner' };
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
