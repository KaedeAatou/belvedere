// trimRunForPersist の unit test (P5 / 2026-07-07)。
// Firestore 1MB/doc 上限対策で step content を 8KB 切り詰める純粋関数。退化入力を固定する。

import { describe, it, expect } from 'vitest';
import type { AgentRun, AgentStep } from '@belvedere/shared';
import { trimRunForPersist } from '../src/handlers/agent-run-persist';

function step(content: unknown): AgentStep {
  return { type: 'tool_result', at: '2026-07-07T00:00:00Z', content };
}

function run(steps: AgentStep[], over: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    workspaceId: 'ws-belvedere',
    agentName: 'planner',
    trigger: 'human',
    startedAt: '2026-07-07T00:00:00Z',
    status: 'succeeded',
    inputContext: {},
    steps,
    llmUsage: { model: 'mock', inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ...over,
  };
}

describe('trimRunForPersist', () => {
  it('8KB 以下の content はそのまま保持する', () => {
    const small = run([step({ ok: true, items: [1, 2, 3] })]);
    const out = trimRunForPersist(small);
    expect(out.steps[0]!.content).toEqual({ ok: true, items: [1, 2, 3] });
  });

  it('8KB を超える content は truncated + preview に切り詰める', () => {
    const big = run([step({ blob: 'x'.repeat(20_000) })]);
    const out = trimRunForPersist(big);
    const c = out.steps[0]!.content as { truncated?: boolean; preview?: string };
    expect(c.truncated).toBe(true);
    expect(c.preview!.length).toBeLessThanOrEqual(8 * 1024);
  });

  it('content=undefined でも壊れない (JSON.stringify が undefined を返す退化ケース)', () => {
    const out = trimRunForPersist(run([step(undefined)]));
    expect(out.steps[0]!.content).toBeUndefined();
  });

  it('循環参照 (unserializable) は truncated:unserializable にする', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = trimRunForPersist(run([step(circular)]));
    expect(out.steps[0]!.content).toEqual({ truncated: true, reason: 'unserializable' });
  });

  it('childRuns も再帰的に切り詰める', () => {
    const child = run([step({ blob: 'y'.repeat(20_000) })], { id: 'run_child' });
    const parent = run([step({ ok: true })], { id: 'run_parent', childRuns: [child] });
    const out = trimRunForPersist(parent);
    const childContent = out.childRuns![0]!.steps[0]!.content as { truncated?: boolean };
    expect(childContent.truncated).toBe(true);
    expect(out.steps[0]!.content).toEqual({ ok: true }); // 親の小さい content は保持
  });

  it('元の run を破壊しない (immutable)', () => {
    const original = run([step({ blob: 'z'.repeat(20_000) })]);
    trimRunForPersist(original);
    expect((original.steps[0]!.content as { blob: string }).blob.length).toBe(20_000);
  });
});
