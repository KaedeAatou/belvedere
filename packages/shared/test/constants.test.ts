import { describe, it, expect } from 'vitest';
import { AGENT_MODEL, modelForAgent } from '../src/constants';
import type { AgentName } from '../src/types';

describe('AGENT_MODEL / modelForAgent (AGENT_DESIGN.md §2.6)', () => {
  const ALL_AGENTS: AgentName[] = [
    'orchestrator',
    'planner',
    'daily',
    'refinement',
    'reviewer',
    'retrospective',
  ];

  it('全 6 agent に過不足なく model がマップされている', () => {
    for (const n of ALL_AGENTS) expect(AGENT_MODEL[n]).toBeTruthy();
    expect(Object.keys(AGENT_MODEL).sort()).toEqual([...ALL_AGENTS].sort());
  });

  it('Orchestrator / Daily は flash、残り 4 ロールは pro', () => {
    expect(modelForAgent('orchestrator')).toBe('gemini-2.5-flash');
    expect(modelForAgent('daily')).toBe('gemini-2.5-flash');
    expect(modelForAgent('planner')).toBe('gemini-2.5-pro');
    expect(modelForAgent('refinement')).toBe('gemini-2.5-pro');
    expect(modelForAgent('reviewer')).toBe('gemini-2.5-pro');
    expect(modelForAgent('retrospective')).toBe('gemini-2.5-pro');
  });

  it('全 agent の model は gemini-2.5-* (有効な値) である', () => {
    for (const n of ALL_AGENTS) expect(modelForAgent(n)).toMatch(/^gemini-2\.5-(pro|flash)$/);
  });

  it('未マップ名はデフォルトに落とさず throw する (silent fallback 禁止)', () => {
    expect(() => modelForAgent('nonexistent' as AgentName)).toThrow(/no Gemini model/);
  });
});
