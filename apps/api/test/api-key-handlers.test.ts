// per-user API キー handler の単体テスト (2026-06-17)。
// member-handlers.test.ts と同じ流儀で memory repo を直接叩く。
// 重点: 平文/ハッシュを戻り値に漏らさない / スコープ (本人 + current ws) / IDOR (他人・別 ws → 404)。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { ApiKey } from '@belvedere/shared';
import { listApiKeys, createApiKey, revokeApiKey } from '../src/handlers/api-key-handlers';

const WS = 'ws-belvedere';
const OTHER_WS = 'ws-other';
const ME = 'firebase-uid-me';
const OTHER = 'firebase-uid-other';
const NOW = '2026-06-17T00:00:00.000Z';

const CTX = { workspaceId: WS, user: { userId: ME, email: 'Me@Example.com' } };

let repo: RepoContainer;
beforeEach(() => {
  repo = createMemoryRepoContainer();
});

describe('createApiKey', () => {
  it('201 / 平文 token を 1 回だけ返し tokenHash は戻り値に含まれない', async () => {
    const r = await createApiKey(repo, CTX, { name: 'CI token' }, NOW);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(201);
    if (!r.ok) return;
    expect(r.body.token).toMatch(/^blv_/);
    expect(r.body.tokenPrefix).toMatch(/^blv_/);
    expect(r.body.name).toBe('CI token');
    expect(r.body.userId).toBe(ME);
    expect(r.body.ownerEmail).toBe('me@example.com'); // lowercase 正規化
    // 戻り値に tokenHash が露出しない
    expect('tokenHash' in r.body).toBe(false);
  });

  it('保存値は平文と異なる sha256 ハッシュ (平文は保存しない)', async () => {
    const r = await createApiKey(repo, CTX, { name: 'k' }, NOW);
    if (!r.ok) return;
    const stored = await repo.apiKeys.get(r.body.id);
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).not.toBe(r.body.token);
    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it('name 欠落 / 空 → 400 invalid_body', async () => {
    const empty = await createApiKey(repo, CTX, {}, NOW);
    expect(empty.ok).toBe(false);
    expect(empty.status).toBe(400);
    const blank = await createApiKey(repo, CTX, { name: '' }, NOW);
    expect(blank.status).toBe(400);
  });
});

describe('listApiKeys', () => {
  it('本人 + current ws のキーだけ返し tokenHash を含めない', async () => {
    await createApiKey(repo, CTX, { name: 'mine-1' }, NOW);
    await createApiKey(repo, CTX, { name: 'mine-2' }, NOW);
    // 別ユーザー (同 ws) のキー
    await repo.apiKeys.upsert(mkKey('apikey-other', { userId: OTHER, workspaceId: WS }));
    // 自分だが別 ws のキー
    await repo.apiKeys.upsert(mkKey('apikey-otherws', { userId: ME, workspaceId: OTHER_WS }));

    const r = await listApiKeys(repo, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.map((k) => k.name).sort()).toEqual(['mine-1', 'mine-2']);
    for (const k of r.body) expect('tokenHash' in k).toBe(false);
  });
});

describe('revokeApiKey (IDOR)', () => {
  it('自分のキーは削除できる', async () => {
    const created = await createApiKey(repo, CTX, { name: 'k' }, NOW);
    if (!created.ok) return;
    const r = await revokeApiKey(repo, CTX, created.body.id);
    expect(r.ok).toBe(true);
    expect(await repo.apiKeys.get(created.body.id)).toBeNull();
  });

  it('他人のキー → 404 (削除されない)', async () => {
    await repo.apiKeys.upsert(mkKey('apikey-other', { userId: OTHER, workspaceId: WS }));
    const r = await revokeApiKey(repo, CTX, 'apikey-other');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(await repo.apiKeys.get('apikey-other')).not.toBeNull();
  });

  it('別 workspace の自分のキー → 404', async () => {
    await repo.apiKeys.upsert(mkKey('apikey-otherws', { userId: ME, workspaceId: OTHER_WS }));
    const r = await revokeApiKey(repo, CTX, 'apikey-otherws');
    expect(r.status).toBe(404);
    expect(await repo.apiKeys.get('apikey-otherws')).not.toBeNull();
  });

  it('存在しない id → 404', async () => {
    const r = await revokeApiKey(repo, CTX, 'apikey-nope');
    expect(r.status).toBe(404);
  });
});

function mkKey(id: string, over: Partial<ApiKey>): ApiKey {
  return {
    id,
    workspaceId: WS,
    userId: ME,
    ownerEmail: 'me@example.com',
    name: id,
    tokenHash: `${id}-hash`,
    tokenPrefix: 'blv_xxxxxx',
    createdAt: NOW,
    createdBy: ME,
    ...over,
  };
}
