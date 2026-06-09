// Phase 1-C CRUD handler の単体テスト (2026-06-11)。
// 純粋関数として書いた handler を memory backend で直接呼び、IDOR + 検証 + immutable field を確認。
//
// Hono 経由の test (auth/workspace middleware 込み) は Firebase Admin SDK モックが要るため
// 別途 e2e で確認する想定。ここは「業務ロジックの単体保証」のレイヤ。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import {
  createTicket,
  patchTicket,
  changeTicketStatus,
  deleteTicket,
  stripUndefined,
} from '../src/handlers/ticket-handlers';
import { createEpic, patchEpic } from '../src/handlers/epic-handlers';

const WS = 'ws-belvedere';
const OTHER_WS = 'ws-attacker';
const CTX = { workspaceId: WS, user: { userId: 'firebase-uid-test', email: 'test@example.com' } };
const OTHER_CTX = { workspaceId: OTHER_WS, user: { userId: 'firebase-uid-attacker', email: 'attacker@example.com' } };

describe('stripUndefined ヘルパ', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefined({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
});

describe('createTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 必須 title のみで status=backlog / priority=medium デフォルト適用', async () => {
    const res = await createTicket(repo, CTX, { title: '新規チケット' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('新規チケット');
    expect(res.body.status).toBe('backlog');
    expect(res.body.priority).toBe('medium');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.id).toMatch(/^WC-/);
    expect(res.body.createdBy).toBe('human');
  });

  it('正常系: 全フィールド指定で作成', async () => {
    const res = await createTicket(repo, CTX, {
      title: 'with all fields',
      description: 'detailed',
      status: 'todo',
      priority: 'high',
      valueImpact: 'high',
      ritual: 'planning',
      sprintId: 'sprint-13',
      assigneeId: 'kaede',
      estimatePt: 5,
      acceptanceCriteria: ['A', 'B'],
      labels: ['demo'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.estimatePt).toBe(5);
    expect(res.body.acceptanceCriteria).toEqual(['A', 'B']);
  });

  it('異常系: title が空文字 → 400 invalid_body', async () => {
    const res = await createTicket(repo, CTX, { title: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('異常系: title が無い → 400', async () => {
    const res = await createTicket(repo, CTX, {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('異常系: status が不正値 → 400', async () => {
    const res = await createTicket(repo, CTX, { title: 'x', status: 'wrong-status' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('セキュリティ: body に workspaceId を入れても ctx の WS が採用される (なりすまし防止)', async () => {
    const res = await createTicket(repo, CTX, {
      title: 'spoof attempt',
      workspaceId: OTHER_WS, // schema 外フィールドだが zod は passthrough なので落ちない、ctx 上書きで吸収
    } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.workspaceId).toBe(WS); // ctx の workspaceId が優先
  });
});

describe('patchTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 一部フィールドのみ更新', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await patchTicket(repo, CTX, id, { title: 'updated', priority: 'urgent' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.title).toBe('updated');
    expect(res.body.priority).toBe('urgent');
    expect(res.body.id).toBe(id); // id は変更されない
    expect(res.body.updatedAt).not.toBe(res.body.createdAt);
  });

  it('IDOR: 別 workspace の ticket は 404 (情報漏えい防止)', async () => {
    const created = await createTicket(repo, CTX, { title: 'in ws-belvedere' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, OTHER_CTX, created.body.id, { title: 'hacked' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('セキュリティ: body で workspaceId / id / createdAt / createdBy を変えようとしても無視される', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const origCreatedAt = created.body.createdAt;
    const res = await patchTicket(repo, CTX, id, {
      id: 'INJECTED-ID',
      workspaceId: OTHER_WS,
      createdAt: '1970-01-01',
      createdBy: 'agent:planner',
    } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.id).toBe(id);
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.createdAt).toBe(origCreatedAt);
    expect(res.body.createdBy).toBe('human');
  });

  it('異常系: 存在しない ID → 404', async () => {
    const res = await patchTicket(repo, CTX, 'NOT-EXIST', { title: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('changeTicketStatus', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: backlog → in-progress', async () => {
    const created = await createTicket(repo, CTX, { title: 'workflow' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, CTX, created.body.id, { status: 'in-progress' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.from).toBe('backlog');
    expect(res.body.to).toBe('in-progress');
    expect(res.body.ticket.status).toBe('in-progress');
  });

  it('異常系: 不正な status → 400', async () => {
    const created = await createTicket(repo, CTX, { title: 'x' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, CTX, created.body.id, { status: 'invalid-status' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('IDOR: 別 workspace のものは 404', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, OTHER_CTX, created.body.id, { status: 'in-progress' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('deleteTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 削除後 get は null', async () => {
    const created = await createTicket(repo, CTX, { title: 'to be deleted' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await deleteTicket(repo, CTX, id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.deleted).toBe(id);
    expect(await repo.tickets.get(id)).toBeNull();
  });

  it('IDOR: 別 workspace のものは 404 + 実際削除されない', async () => {
    const created = await createTicket(repo, CTX, { title: 'victim' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await deleteTicket(repo, OTHER_CTX, id);
    expect(res.ok).toBe(false);
    // 実データはそのまま残る
    expect(await repo.tickets.get(id)).not.toBeNull();
  });
});

describe('createEpic / patchEpic', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('createEpic: 必須 name + デフォルト status=planned', async () => {
    const res = await createEpic(repo, CTX, { name: 'New Epic' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.name).toBe('New Epic');
    expect(res.body.status).toBe('planned');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.id).toMatch(/^EP-/);
  });

  it('patchEpic: rationale 追加 (Phase 1-B の第 6 観点用フィールド)', async () => {
    const created = await createEpic(repo, CTX, { name: 'E' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchEpic(repo, CTX, created.body.id, {
      rationale: 'なぜこの Epic が必要か',
      successMetric: 'チーム DoD 充足率 60→90%',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.rationale).toBe('なぜこの Epic が必要か');
    expect(res.body.successMetric).toBe('チーム DoD 充足率 60→90%');
    expect(res.body.workspaceId).toBe(WS); // 変更されない
  });

  it('patchEpic IDOR: 別 workspace は 404', async () => {
    const created = await createEpic(repo, CTX, { name: 'E' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchEpic(repo, OTHER_CTX, created.body.id, { rationale: 'hack' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('createEpic 異常系: name 空 → 400', async () => {
    const res = await createEpic(repo, CTX, { name: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});
