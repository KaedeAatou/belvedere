import { describe, it, expect } from 'vitest';
import { AgentRunSchema } from '../src/schemas';

// AgentRun.childRuns (Orchestrator 協議 / 案A) の runtime 検証。
// compile-time の _check_AgentRun は cast (z.ZodType<AgentRun>) でトートロジー化しているため、
// childRuns 枝の正しさ (省略可 / 子の必須キー / 配列であること) は runtime parse で固める
// (.claude/rules/testing.md §1 退化入力)。本体フィールドの drift 検出は _check_AgentRunBase が担保。
describe('AgentRunSchema childRuns (Orchestrator 協議)', () => {
  const baseRun = {
    id: 'run-1',
    workspaceId: 'ws-belvedere',
    agentName: 'orchestrator',
    trigger: 'event',
    startedAt: '2026-06-19T00:00:00Z',
    status: 'succeeded',
    inputContext: {},
    steps: [],
    llmUsage: { model: 'mock', inputTokens: 1, outputTokens: 1, costUsd: 0 },
  };

  it('childRuns 省略 (optional / legacy run) で success', () => {
    expect(AgentRunSchema.safeParse(baseRun).success).toBe(true);
  });

  it('親 + 正しい childRuns (深さ1) で success', () => {
    const child = { ...baseRun, id: 'child-1', agentName: 'planner' };
    const parent = { ...baseRun, childRuns: [child] };
    expect(AgentRunSchema.safeParse(parent).success).toBe(true);
  });

  it('childRuns の子が必須キー (llmUsage) 欠落なら failure', () => {
    const badChild: Record<string, unknown> = { ...baseRun, id: 'child-bad', agentName: 'planner' };
    delete badChild.llmUsage;
    const parent = { ...baseRun, childRuns: [badChild] };
    expect(AgentRunSchema.safeParse(parent).success).toBe(false);
  });

  it('childRuns が配列でないなら failure', () => {
    const parent = { ...baseRun, childRuns: 'nope' };
    expect(AgentRunSchema.safeParse(parent).success).toBe(false);
  });
});
