// Phase 1-C Member handler の単体テスト (2026-06-11)。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Member } from '@belvedere/shared';
import { getMe, patchMember } from '../src/handlers/member-handlers';

const WS = 'ws-belvedere';
const ATTACK_WS = 'ws-attacker';

const MY_USERID = 'firebase-uid-me';
const OTHER_USERID = 'firebase-uid-other';

// shared な setup: 自分 (owner) + 同 workspace の他人 (dev) を投入
async function seed(repo: RepoContainer): Promise<{ me: Member; other: Member }> {
  const me: Member = {
    userId: MY_USERID,
    workspaceId: WS,
    email: 'me@example.com',
    displayName: 'Me',
    role: 'owner',
  };
  const other: Member = {
    userId: OTHER_USERID,
    workspaceId: WS,
    email: 'other@example.com',
    displayName: 'Other',
    role: 'dev',
  };
  await repo.members.upsert(me);
  await repo.members.upsert(other);
  return { me, other };
}

const CTX = {
  workspaceId: WS,
  user: { userId: MY_USERID, email: 'me@example.com' },
};

describe('getMe', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 自分の Member 全情報を返す', async () => {
    await seed(repo);
    const res = await getMe(repo, CTX);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.userId).toBe(MY_USERID);
    expect(res.body.role).toBe('owner');
    expect(res.body.workspaceId).toBe(WS);
  });

  it('Member 未登録 → 404 (eventual consistency 想定)', async () => {
    // seed しない状態で get → 自分が members に居ない (= bootstrap 前の race など)
    const res = await getMe(repo, CTX);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('workspace 不一致 → 404 (データ破損 / 攻撃シナリオ)', async () => {
    // 自分の Member は ws-attacker、でも ctx.workspaceId は ws-belvedere
    await repo.members.upsert({
      userId: MY_USERID,
      workspaceId: ATTACK_WS,
      email: 'me@example.com',
      displayName: 'Me',
      role: 'owner',
    });
    const res = await getMe(repo, CTX);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('patchMember', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 自分の displayName を変更', async () => {
    await seed(repo);
    const res = await patchMember(repo, CTX, MY_USERID, { displayName: '加賀谷' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.displayName).toBe('加賀谷');
    expect(res.body.role).toBe('owner');     // 不変
    expect(res.body.workspaceId).toBe(WS);   // 不変
    expect(res.body.email).toBe('me@example.com'); // 不変
  });

  it('セキュリティ: 他人の Member は編集禁止 (404)', async () => {
    await seed(repo);
    const res = await patchMember(repo, CTX, OTHER_USERID, { displayName: 'hacked' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
    // 実データはそのまま
    const other = await repo.members.get(WS, OTHER_USERID);
    expect(other?.displayName).toBe('Other');
  });

  it('セキュリティ: body 経由で role を上書きしようとしても無視される', async () => {
    await seed(repo);
    const res = await patchMember(repo, CTX, MY_USERID, {
      displayName: 'new name',
      role: 'guest',          // ← 無視されるべき
      workspaceId: ATTACK_WS, // ← 無視されるべき
      userId: 'INJECTED',     // ← 無視されるべき
      email: 'fake@example.com', // ← 無視されるべき
    } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.role).toBe('owner');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.userId).toBe(MY_USERID);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body.displayName).toBe('new name');
  });

  it('異常系: 空文字 displayName → 400', async () => {
    await seed(repo);
    const res = await patchMember(repo, CTX, MY_USERID, { displayName: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('異常系: 81 文字以上の displayName → 400 (制限)', async () => {
    await seed(repo);
    const res = await patchMember(repo, CTX, MY_USERID, { displayName: 'x'.repeat(81) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('IDOR: 別 workspace の同 userId は 404 (実装上ありえないが防御線として)', async () => {
    // ctx は ws-belvedere、自分の Member は ws-attacker → 404
    await repo.members.upsert({
      userId: MY_USERID,
      workspaceId: ATTACK_WS,
      email: 'me@example.com',
      displayName: 'Me',
      role: 'owner',
    });
    const res = await patchMember(repo, CTX, MY_USERID, { displayName: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('Member 未登録 → 404 (bootstrap 前)', async () => {
    const res = await patchMember(repo, CTX, MY_USERID, { displayName: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});
