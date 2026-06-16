// Retro Try 積み上げ CRUD ハンドラの単体テスト (2026-06-11)。
// memory backend で直接呼び、CRUD 正常系 / IDOR 404 / zod 400 / done トグルを確認。
// レトロは全メンバー参加なので role ゲートは無い (dev でも追加/削除/編集できる)。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import {
  listRetroTries,
  createRetroTry,
  patchRetroTry,
  deleteRetroTry,
} from '../src/handlers/retro-try-handlers';

const WS = 'ws-belvedere';
const DEV = { workspaceId: WS, user: { userId: 'u-dev', email: 'dev@example.com' }, role: 'dev' as const };
const OTHER = { workspaceId: 'ws-other', user: { userId: 'u-x', email: 'x@example.com' }, role: 'owner' as const };

describe('createRetroTry', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: text/sprintNumber/sprintId から作成 (done=false / createdBy=ctx.user)', async () => {
    const res = await createRetroTry(repo, DEV, {
      text: 'BLOCKED に遷移したら理由必須にする。', sprintNumber: 13, sprintId: 'sprint-13',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('BLOCKED に遷移したら理由必須にする。');
    expect(res.body.sprintNumber).toBe(13);
    expect(res.body.sprintId).toBe('sprint-13');
    expect(res.body.done).toBe(false);
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.createdBy).toBe('u-dev');
    expect(res.body.id).toMatch(/^try-/);
  });

  it('正常系: sprintId 省略可 (seed 由来等)', async () => {
    const res = await createRetroTry(repo, DEV, { text: '金曜午前に micro-daily。', sprintNumber: 13 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.sprintId).toBeUndefined();
  });

  it('400: text 空は弾く (zod)', async () => {
    const res = await createRetroTry(repo, DEV, { text: '', sprintNumber: 13 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('400: sprintNumber 欠落は弾く (zod)', async () => {
    const res = await createRetroTry(repo, DEV, { text: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('listRetroTries', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('workspaceId スコープで自 workspace のみ返す', async () => {
    // scope 判定を決定的にするため id/createdAt を明示して直接投入する (createRetroTry を経由しない)
    await repo.retroTries.upsert({ id: 'try-a', workspaceId: WS, text: 'A', sprintNumber: 13, done: false, createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroTries.upsert({ id: 'try-b', workspaceId: 'ws-other', text: 'B (別 workspace)', sprintNumber: 13, done: false, createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-x' });
    const res = await listRetroTries(repo, DEV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toHaveLength(1);
    expect(res.body[0]?.text).toBe('A');
  });

  it('createdAt 昇順で返る', async () => {
    // createdAt は new Date().toISOString() なので、間に微小 sleep を挟まなくても upsert を直接使い順序を固定する
    await repo.retroTries.upsert({ id: 'try-2', workspaceId: WS, text: '2nd', sprintNumber: 12, done: false, createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroTries.upsert({ id: 'try-1', workspaceId: WS, text: '1st', sprintNumber: 11, done: true, createdAt: '2026-04-21T10:00:00+09:00', createdBy: 'u-dev' });
    const res = await listRetroTries(repo, DEV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((t) => t.text)).toEqual(['1st', '2nd']);
  });
});

describe('patchRetroTry', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.retroTries.upsert({ id: 'try-1', workspaceId: WS, text: '元テキスト', sprintNumber: 13, done: false, createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
  });

  it('正常系: done トグル', async () => {
    const res = await patchRetroTry(repo, DEV, 'try-1', { done: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.done).toBe(true);
    expect((await repo.retroTries.get('try-1'))?.done).toBe(true);
  });

  it('正常系: text 編集 (id/workspaceId/createdAt/createdBy は不変)', async () => {
    const res = await patchRetroTry(repo, DEV, 'try-1', { text: '編集後テキスト' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.text).toBe('編集後テキスト');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.createdAt).toBe('2026-06-01T10:00:00+09:00');
    expect(res.body.createdBy).toBe('u-dev');
  });

  it('400: text 空は弾く', async () => {
    const res = await patchRetroTry(repo, DEV, 'try-1', { text: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('404: 別 workspace は存在しない扱い', async () => {
    const res = await patchRetroTry(repo, OTHER, 'try-1', { done: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('404: 存在しない id', async () => {
    const res = await patchRetroTry(repo, DEV, 'try-nope', { done: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('deleteRetroTry', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.retroTries.upsert({ id: 'try-1', workspaceId: WS, text: 'x', sprintNumber: 13, done: false, createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
  });

  it('正常系: 積み上げから削除', async () => {
    const res = await deleteRetroTry(repo, DEV, 'try-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.deleted).toBe('try-1');
    expect(await repo.retroTries.get('try-1')).toBeNull();
  });

  it('404: 別 workspace は存在しない扱い (削除されない)', async () => {
    const res = await deleteRetroTry(repo, OTHER, 'try-1');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
    expect(await repo.retroTries.get('try-1')).not.toBeNull();
  });
});
