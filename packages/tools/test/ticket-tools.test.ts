// ticket.list / ticket.get ツールの返却フィールド固定テスト (F-33/F-11/F-24 根本 A / 2026-07-08)。
//
// ドッグフード実験で「AI がチケットのスプリント所属・親子紐付けを判別できず、旧スプリントの
// チケットで台本を作る / 『紐付けなし』と誤認する」が 6 回以上再発した。原因は ticket.list の
// 返却に sprintId / parentTicketId / epicId / type が含まれず、LLM が判断材料を持てないこと。
// このテストは「LLM に見えるフィールド」を契約として固定する。

import { describe, it, expect } from 'vitest';
import { buildRegistry } from '@belvedere/agent';
import type { Ticket } from '@belvedere/shared';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { buildTools } from '../src/index';

function ticket(over: Partial<Ticket> & { id: string }): Ticket {
  return {
    workspaceId: 'ws-belvedere',
    title: 't',
    status: 'todo',
    priority: 'medium',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    createdBy: 'human',
    ...over,
  };
}

function toolOf(repo: RepoContainer, workspaceId: string, name: string) {
  const reg = buildRegistry(buildTools(repo, workspaceId));
  const t = reg.get(name);
  if (!t) throw new Error(`${name} tool not found`);
  return t;
}

describe('ticket.list の返却フィールド (根本 A)', () => {
  it('sprintId / parentTicketId / epicId / type を含む (LLM がスコープと紐付けを判別できる)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.tickets.upsert(
      ticket({
        id: 'WC-a',
        type: 'task',
        sprintId: 'SP-6',
        parentTicketId: 'WC-story',
        epicId: 'EP-1',
      }),
    );
    const tool = toolOf(repo, 'ws-belvedere', 'ticket.list');
    const res = (await tool.invoke({})) as Array<Record<string, unknown>>;
    const row = res.find((r) => r.id === 'WC-a');
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      id: 'WC-a',
      type: 'task',
      sprintId: 'SP-6',
      parentTicketId: 'WC-story',
      epicId: 'EP-1',
    });
  });

  it('未設定の optional フィールドはキー自体を含めない (JSON ノイズを増やさない)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.tickets.upsert(ticket({ id: 'WC-b' }));
    const tool = toolOf(repo, 'ws-belvedere', 'ticket.list');
    const res = (await tool.invoke({})) as Array<Record<string, unknown>>;
    const row = res.find((r) => r.id === 'WC-b')!;
    expect('sprintId' in row).toBe(false);
    expect('parentTicketId' in row).toBe(false);
    expect('epicId' in row).toBe(false);
  });
});

describe('ticket.get (単一 ID 取得 / F-24 の「見当たらない」誤答対策)', () => {
  it('自 workspace のチケットを id 指定で取得できる (紐付けフィールド込み)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.tickets.upsert(
      ticket({ id: 'WC-own', type: 'story', sprintId: 'SP-6', epicId: 'EP-2', estimatePt: 3 }),
    );
    const tool = toolOf(repo, 'ws-belvedere', 'ticket.get');
    const res = (await tool.invoke({ id: 'WC-own' })) as Record<string, unknown>;
    expect(res).toMatchObject({ id: 'WC-own', type: 'story', sprintId: 'SP-6', epicId: 'EP-2', estimatePt: 3 });
  });

  it('他 workspace のチケットは id を知っていても not found (IDOR ガード / sprint.get と同型)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.tickets.upsert(ticket({ id: 'WC-other', workspaceId: 'ws-other' }));
    const tool = toolOf(repo, 'ws-belvedere', 'ticket.get');
    const res = await tool.invoke({ id: 'WC-other' });
    expect(res).toEqual({ error: 'ticket not found: WC-other' });
  });

  it('存在しない id は not found', async () => {
    const repo = createMemoryRepoContainer();
    const tool = toolOf(repo, 'ws-belvedere', 'ticket.get');
    const res = await tool.invoke({ id: 'WC-nope' });
    expect(res).toEqual({ error: 'ticket not found: WC-nope' });
  });
});
