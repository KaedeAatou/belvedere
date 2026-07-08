// Retro KPT ボードのノート CRUD + 投票ハンドラの単体テスト (2026-06-13)。
// memory backend で直接呼び、CRUD 正常系 / vote toggle / IDOR 404 / zod 400 を確認。
// レトロは全メンバー参加なので role ゲートは無い (dev でも追加/編集/投票/削除できる)。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';
import { createApp } from '../src/app';
import {
  listRetroNotes,
  createRetroNote,
  patchRetroNote,
  voteRetroNote,
  deleteRetroNote,
} from '../src/handlers/retro-note-handlers';

// Firebase Admin SDK をモック (app-auth.test.ts と同理由: CI に ADC が無く実 verifyIdToken はハングする)。
// route テストはサービストークン経路 (Firebase を呼ばない) だけを使う。
vi.mock('firebase-admin/app', () => ({
  initializeApp: () => ({}),
  applicationDefault: () => ({}),
  getApps: () => [],
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async () => {
      throw new Error('mock: firebase not available in test');
    },
  }),
}));

const WS = 'ws-belvedere';
const DEV = { workspaceId: WS, user: { userId: 'u-dev', email: 'dev@example.com' }, role: 'dev' as const };
const DEV2 = { workspaceId: WS, user: { userId: 'u-dev2', email: 'dev2@example.com' }, role: 'dev' as const };
const OTHER = { workspaceId: 'ws-other', user: { userId: 'u-x', email: 'x@example.com' }, role: 'admin' as const };

describe('createRetroNote', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: column/text/sprintNumber から作成 (votes=[] / author=createdBy=ctx.user)', async () => {
    const res = await createRetroNote(repo, DEV, {
      column: 'keep', text: '社内利用が +60% 増えた。', sprintNumber: 13,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(201);
    expect(res.body.column).toBe('keep');
    expect(res.body.text).toBe('社内利用が +60% 増えた。');
    expect(res.body.sprintNumber).toBe(13);
    expect(res.body.votes).toEqual([]);
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.authorId).toBe('u-dev');
    expect(res.body.createdBy).toBe('u-dev');
    expect(res.body.id).toMatch(/^note-/);
  });

  it('400: text 空は弾く (zod)', async () => {
    const res = await createRetroNote(repo, DEV, { column: 'problem', text: '', sprintNumber: 13 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('400: 不正な column は弾く (zod)', async () => {
    const res = await createRetroNote(repo, DEV, { column: 'wishlist', text: 'x', sprintNumber: 13 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('400: sprintNumber 欠落は弾く (zod)', async () => {
    const res = await createRetroNote(repo, DEV, { column: 'try', text: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('listRetroNotes', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('workspaceId スコープで自 workspace のみ返す', async () => {
    await repo.retroNotes.upsert({ id: 'note-a', workspaceId: WS, sprintNumber: 13, column: 'keep', text: 'A', authorId: 'u-dev', votes: [], createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroNotes.upsert({ id: 'note-b', workspaceId: 'ws-other', sprintNumber: 13, column: 'keep', text: 'B', authorId: 'u-x', votes: [], createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-x' });
    const res = await listRetroNotes(repo, DEV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toHaveLength(1);
    expect(res.body[0]?.text).toBe('A');
  });

  it('createdAt 昇順で返る', async () => {
    await repo.retroNotes.upsert({ id: 'note-2', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '2nd', authorId: 'u-dev', votes: [], createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroNotes.upsert({ id: 'note-1', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '1st', authorId: 'u-dev', votes: [], createdAt: '2026-04-21T10:00:00+09:00', createdBy: 'u-dev' });
    const res = await listRetroNotes(repo, DEV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((n) => n.text)).toEqual(['1st', '2nd']);
  });

  // F-16 (2026-07-08): KPT ノートがスプリントを跨いで累積し「今回の振り返り」が区別できなかった。
  // sprintNumber query で由来スプリントに絞れることを固定する (未指定は全件 = 後方互換)。
  it('sprintNumber query で由来スプリントのノートだけに絞る (F-16)', async () => {
    await repo.retroNotes.upsert({ id: 'note-s12', workspaceId: WS, sprintNumber: 12, column: 'keep', text: '前回', authorId: 'u-dev', votes: [], createdAt: '2026-04-21T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroNotes.upsert({ id: 'note-s13', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '今回', authorId: 'u-dev', votes: [], createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
    const res = await listRetroNotes(repo, DEV, { sprintNumber: 13 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((n) => n.text)).toEqual(['今回']);
  });

  it('sprintNumber 未指定なら全スプリントのノートを返す (後方互換)', async () => {
    await repo.retroNotes.upsert({ id: 'note-s12', workspaceId: WS, sprintNumber: 12, column: 'keep', text: '前回', authorId: 'u-dev', votes: [], createdAt: '2026-04-21T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroNotes.upsert({ id: 'note-s13', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '今回', authorId: 'u-dev', votes: [], createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
    const res = await listRetroNotes(repo, DEV, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toHaveLength(2);
  });

  it('退化入力: sprintNumber 未設定 (legacy) のノートは絞り込み時に含めない', async () => {
    // 型上は必須だが、古い実データには欠落がありうる。どのスプリント由来か判定できないので絞り込みからは除外。
    await repo.retroNotes.upsert({ id: 'note-legacy', workspaceId: WS, column: 'keep', text: 'legacy', authorId: 'u-dev', votes: [], createdAt: '2026-04-01T10:00:00+09:00', createdBy: 'u-dev' } as never);
    await repo.retroNotes.upsert({ id: 'note-s13', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '今回', authorId: 'u-dev', votes: [], createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
    const res = await listRetroNotes(repo, DEV, { sprintNumber: 13 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.map((n) => n.text)).toEqual(['今回']);
  });
});

describe('patchRetroNote', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.retroNotes.upsert({ id: 'note-1', workspaceId: WS, sprintNumber: 13, column: 'problem', text: '元テキスト', authorId: 'u-dev', votes: ['u-dev'], createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
  });

  it('正常系: text 編集 (id/workspaceId/createdAt/createdBy/votes は保持)', async () => {
    const res = await patchRetroNote(repo, DEV, 'note-1', { text: '編集後テキスト' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.text).toBe('編集後テキスト');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.createdAt).toBe('2026-06-01T10:00:00+09:00');
    expect(res.body.createdBy).toBe('u-dev');
    expect(res.body.votes).toEqual(['u-dev']);
  });

  it('400: text 空は弾く', async () => {
    const res = await patchRetroNote(repo, DEV, 'note-1', { text: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('404: 別 workspace は存在しない扱い', async () => {
    const res = await patchRetroNote(repo, OTHER, 'note-1', { text: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('404: 存在しない id', async () => {
    const res = await patchRetroNote(repo, DEV, 'note-nope', { text: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('voteRetroNote', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.retroNotes.upsert({ id: 'note-1', workspaceId: WS, sprintNumber: 13, column: 'try', text: 'x', authorId: 'u-author', votes: [], createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-author' });
  });

  it('toggle: 未投票なら自分の userId を足す', async () => {
    const res = await voteRetroNote(repo, DEV, 'note-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.votes).toEqual(['u-dev']);
    expect((await repo.retroNotes.get('note-1'))?.votes).toEqual(['u-dev']);
  });

  it('toggle: 投票済なら自分の userId を外す (足す→外すで [] に戻る)', async () => {
    await voteRetroNote(repo, DEV, 'note-1');
    const res = await voteRetroNote(repo, DEV, 'note-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.votes).toEqual([]);
  });

  it('複数ユーザーの票は独立して積み上がる', async () => {
    await voteRetroNote(repo, DEV, 'note-1');
    const res = await voteRetroNote(repo, DEV2, 'note-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.votes.sort()).toEqual(['u-dev', 'u-dev2']);
  });

  it('404: 別 workspace は存在しない扱い (投票されない)', async () => {
    const res = await voteRetroNote(repo, OTHER, 'note-1');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
    expect((await repo.retroNotes.get('note-1'))?.votes).toEqual([]);
  });
});

describe('deleteRetroNote', () => {
  let repo: RepoContainer;
  beforeEach(async () => {
    repo = createMemoryRepoContainer();
    await repo.retroNotes.upsert({ id: 'note-1', workspaceId: WS, sprintNumber: 13, column: 'keep', text: 'x', authorId: 'u-dev', votes: [], createdAt: '2026-06-01T10:00:00+09:00', createdBy: 'u-dev' });
  });

  it('正常系: ボードから削除', async () => {
    const res = await deleteRetroNote(repo, DEV, 'note-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.deleted).toBe('note-1');
    expect(await repo.retroNotes.get('note-1')).toBeNull();
  });

  it('404: 別 workspace は存在しない扱い (削除されない)', async () => {
    const res = await deleteRetroNote(repo, OTHER, 'note-1');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
    expect(await repo.retroNotes.get('note-1')).not.toBeNull();
  });
});

// F-16: route レベルの query 配線 (?sprintNumber= のパース + 不正値 400) を HTTP 契約として固定する。
describe('GET /api/retro-notes?sprintNumber= (route 配線 / F-16)', () => {
  const TOKEN = 'test-service-token';
  let repo: RepoContainer;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
    app = createApp({ repo, llm: createLLMProvider('mock') });
    await repo.retroNotes.upsert({ id: 'note-s12', workspaceId: WS, sprintNumber: 12, column: 'keep', text: '前回', authorId: 'u-dev', votes: [], createdAt: '2026-04-21T10:00:00+09:00', createdBy: 'u-dev' });
    await repo.retroNotes.upsert({ id: 'note-s13', workspaceId: WS, sprintNumber: 13, column: 'keep', text: '今回', authorId: 'u-dev', votes: [], createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-dev' });
  });

  function req(path: string): Request {
    return new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'X-Workspace-Id': WS },
    });
  }

  it('?sprintNumber=13 で由来スプリントに絞る', async () => {
    const res = await app.fetch(req('/api/retro-notes?sprintNumber=13'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ text: string }>;
    expect(body.map((n) => n.text)).toEqual(['今回']);
  });

  it('query 未指定は全件 (後方互換)', async () => {
    const res = await app.fetch(req('/api/retro-notes'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
  });

  it('数値でない sprintNumber は 400 (黙って 0 件にしない)', async () => {
    const res = await app.fetch(req('/api/retro-notes?sprintNumber=abc'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_query');
  });
});
