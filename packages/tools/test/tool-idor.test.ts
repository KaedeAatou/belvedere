import { describe, it, expect } from 'vitest';
import { buildRegistry } from '@belvedere/agent';
import type { Sprint } from '@belvedere/shared';
import { createMemoryRepoContainer } from '@belvedere/repo';
import { buildTools } from '../src/index';

// sprint.get の IDOR ガード再現テスト (workflow review 指摘の先在ギャップ)。
// repo.sprints.get(id) は workspace スコープされないため、tool 側で workspaceId を照合し
// 他 workspace の Sprint を id 推測で読めないことを固定する (.claude/rules/testing.md §3 再現テスト先行)。
function sprint(id: string, workspaceId: string): Sprint {
  return {
    id,
    workspaceId,
    number: 1,
    startsAt: '2026-06-01T00:00:00Z',
    endsAt: '2026-06-14T00:00:00Z',
    goal: 'g',
    capacity: 0,
    status: 'active',
  };
}

function sprintGetTool(repo: ReturnType<typeof createMemoryRepoContainer>, workspaceId: string) {
  const reg = buildRegistry(buildTools(repo, workspaceId));
  const t = reg.get('sprint.get');
  if (!t) throw new Error('sprint.get tool not found');
  return t;
}

describe('sprint.get IDOR ガード', () => {
  it('他 workspace の Sprint は id を知っていても not found を返す', async () => {
    const repo = createMemoryRepoContainer();
    await repo.sprints.upsert(sprint('SP-other', 'ws-other'));
    const tool = sprintGetTool(repo, 'ws-belvedere'); // 別 workspace のツール
    const res = await tool.invoke({ id: 'SP-other' });
    expect(res).toEqual({ error: 'sprint not found: SP-other' });
  });

  it('自 workspace の Sprint は取得できる', async () => {
    const repo = createMemoryRepoContainer();
    await repo.sprints.upsert(sprint('SP-own', 'ws-belvedere'));
    const tool = sprintGetTool(repo, 'ws-belvedere');
    const res = (await tool.invoke({ id: 'SP-own' })) as Sprint;
    expect(res.id).toBe('SP-own');
    expect(res.workspaceId).toBe('ws-belvedere');
  });
});
