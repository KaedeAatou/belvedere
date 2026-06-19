// Orchestrator 協議ツール agent.invoke の直接 unit / 統合テスト (2026-06-19)。
//
// 背景: prompts.ts / mock.ts を触らない方針のため Mock orchestrator は agent.invoke を emit しない。
// よって Mock 経由の end-to-end 協議は assert せず (phase 3)、handler と validateInvocation を
// 直接叩いて固める (.claude/rules/testing.md §1 純粋関数直接 unit + §2 IDOR を実データ状態で踏む)。
//
// 固定する不変条件:
//  - validateInvocation の退化入力 (空 agentName / 未知名 / 自己参照 / 空 prompt / 正常)
//  - agent.invoke handler で childRuns が積まれる
//  - 自己参照 / 未知名 / 空 prompt が error tool_result になる (throw しない)
//  - 他 workspaceId の子は越境不可 (IDOR)
//  - コストキャップ超過で error
//  - 子 (childTools) が agent.invoke を持たない (深さ 1 固定)

import { describe, it, expect } from 'vitest';
import type { AgentTool } from '@belvedere/agent';
import { buildRegistry } from '@belvedere/agent';
import type { LLMProvider, LLMRequest, LLMResponse } from '@belvedere/llm';
import { MockLLMProvider } from '@belvedere/llm';
import { createMemoryRepoContainer } from '@belvedere/repo';
import type { AgentRun } from '@belvedere/shared';
import { buildOrchestratorTools } from '../src/index';
import { validateInvocation, CEREMONY_AGENTS } from '../src/agent-invoke';

const SELF = 'orchestrator' as const;

// agent.invoke ツールを registry から取り出すヘルパ。
function getAgentInvoke(tools: AgentTool[]): AgentTool {
  const reg = buildRegistry(tools);
  const t = reg.get('agent.invoke');
  if (!t) throw new Error('agent.invoke tool not found');
  return t;
}

describe('validateInvocation (純粋関数 / 退化入力)', () => {
  const ctx = { selfName: SELF, knownAgents: CEREMONY_AGENTS };

  it('agentName が空文字なら empty_agent', () => {
    expect(validateInvocation({ agentName: '', prompt: 'x' }, ctx)).toEqual({
      ok: false,
      reason: 'empty_agent',
    });
  });

  it('agentName が空白のみなら empty_agent', () => {
    expect(validateInvocation({ agentName: '   ', prompt: 'x' }, ctx)).toEqual({
      ok: false,
      reason: 'empty_agent',
    });
  });

  it('agentName 欠落 (undefined) なら empty_agent', () => {
    expect(validateInvocation({ prompt: 'x' }, ctx)).toEqual({ ok: false, reason: 'empty_agent' });
  });

  it('agentName が string でない (number) なら empty_agent', () => {
    expect(validateInvocation({ agentName: 42, prompt: 'x' }, ctx)).toEqual({
      ok: false,
      reason: 'empty_agent',
    });
  });

  it('自己参照 (orchestrator) は self_reference (unknown より優先)', () => {
    expect(validateInvocation({ agentName: 'orchestrator', prompt: 'x' }, ctx)).toEqual({
      ok: false,
      reason: 'self_reference',
    });
  });

  it('未知名は unknown_agent', () => {
    expect(validateInvocation({ agentName: 'wizard', prompt: 'x' }, ctx)).toEqual({
      ok: false,
      reason: 'unknown_agent',
    });
  });

  it('正常な agentName + 空 prompt は empty_prompt', () => {
    expect(validateInvocation({ agentName: 'planner', prompt: '' }, ctx)).toEqual({
      ok: false,
      reason: 'empty_prompt',
    });
    expect(validateInvocation({ agentName: 'planner', prompt: '   ' }, ctx)).toEqual({
      ok: false,
      reason: 'empty_prompt',
    });
  });

  it('正常入力は ok + 正規化された値を返す', () => {
    expect(validateInvocation({ agentName: 'refinement', prompt: '分割して' }, ctx)).toEqual({
      ok: true,
      agentName: 'refinement',
      prompt: '分割して',
    });
  });
});

describe('buildOrchestratorTools / agent.invoke handler', () => {
  function setup(over?: { costCapUsd?: number; llm?: LLMProvider; workspaceId?: string }) {
    const repo = createMemoryRepoContainer();
    const llm = over?.llm ?? new MockLLMProvider();
    const childRuns: AgentRun[] = [];
    const tools = buildOrchestratorTools(repo, over?.workspaceId ?? 'ws-belvedere', {
      llm,
      childRuns,
      ...(over?.costCapUsd !== undefined && { costCapUsd: over.costCapUsd }),
    });
    return { repo, llm, childRuns, tools, invoke: getAgentInvoke(tools) };
  }

  it('正常な agent.invoke で子 run が childRuns に積まれる', async () => {
    const { invoke, childRuns } = setup();
    const result = (await invoke.invoke({ agentName: 'planner', prompt: '計画して' })) as {
      agentName: string;
      status: string;
    };
    expect(result.agentName).toBe('planner');
    expect(result.status).toBe('succeeded');
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]?.agentName).toBe('planner');
    expect(childRuns[0]?.workspaceId).toBe('ws-belvedere');
  });

  it('自己参照 (orchestrator) は error tool_result (throw しない / childRuns 不変)', async () => {
    const { invoke, childRuns } = setup();
    const result = await invoke.invoke({ agentName: 'orchestrator', prompt: 'x' });
    expect(result).toEqual({ error: 'self_reference' });
    expect(childRuns).toHaveLength(0);
  });

  it('未知名は error tool_result (childRuns 不変)', async () => {
    const { invoke, childRuns } = setup();
    const result = await invoke.invoke({ agentName: 'wizard', prompt: 'x' });
    expect(result).toEqual({ error: 'unknown_agent' });
    expect(childRuns).toHaveLength(0);
  });

  it('空 prompt は error tool_result (childRuns 不変)', async () => {
    const { invoke, childRuns } = setup();
    const result = await invoke.invoke({ agentName: 'planner', prompt: '  ' });
    expect(result).toEqual({ error: 'empty_prompt' });
    expect(childRuns).toHaveLength(0);
  });

  it('IDOR: 子 run は親の workspaceId closure を継承する (越境上書きの隙が無い)', async () => {
    // 親 ws を ws-other にすると子 run もその ws スコープで動く。agentName/prompt 以外の経路で
    // workspaceId を上書きできないこと = 子が必ず親 closure を継承することを直接固定する
    // (子の tool が他 ws のデータを 0 件しか引けない実証は phase 3 / 実 LLM 経路で別途)。
    const { invoke, childRuns } = setup({ workspaceId: 'ws-other' });
    await invoke.invoke({ agentName: 'daily', prompt: '確認して' });
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]?.workspaceId).toBe('ws-other');
  });

  it('コストキャップ超過で error (子 run を起動しない)', async () => {
    // costUsd>0 を返すスタブ LLM を注入 (Mock は costUsd=0 で踏めないため)。
    const costlyLlm: LLMProvider = {
      name: 'costly-stub',
      async generate(_req: LLMRequest): Promise<LLMResponse> {
        return { text: 'done', stop: { type: 'stop' }, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.6 } };
      },
    };
    const { invoke, childRuns } = setup({ llm: costlyLlm, costCapUsd: 1.0 });
    // 1 回目: spent=0 < cap=1.0 → 起動して costUsd 0.6 を積む。
    const first = (await invoke.invoke({ agentName: 'planner', prompt: 'x' })) as { status: string };
    expect(first.status).toBe('succeeded');
    expect(childRuns).toHaveLength(1);
    // 2 回目: spent=0.6 < 1.0 → 起動して 1.2 になる。
    await invoke.invoke({ agentName: 'daily', prompt: 'x' });
    expect(childRuns).toHaveLength(2);
    // 3 回目: spent=1.2 >= 1.0 → error (起動しない)。
    const third = await invoke.invoke({ agentName: 'reviewer', prompt: 'x' });
    expect(third).toEqual({ error: 'cost_cap_exceeded' });
    expect(childRuns).toHaveLength(2);
  });

  it('コストキャップ: spent が cap と「ちょうど等しい」境界で error (>= であって > でない)', async () => {
    // cap=1.0 を costUsd=0.5 で割り切れる値にし、2 回起動で spent===cap=1.0 を作る。
    // 3 回目は spent(1.0) >= cap(1.0) で error。`>` だったら漏れる等値境界を固定する (.claude/rules/testing.md §1 端)。
    const halfLlm: LLMProvider = {
      name: 'half-stub',
      async generate(_req: LLMRequest): Promise<LLMResponse> {
        return { text: 'done', stop: { type: 'stop' }, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.5 } };
      },
    };
    const { invoke, childRuns } = setup({ llm: halfLlm, costCapUsd: 1.0 });
    await invoke.invoke({ agentName: 'planner', prompt: 'x' }); // spent 0 → 0.5
    await invoke.invoke({ agentName: 'daily', prompt: 'x' }); // spent 0.5 → 1.0 (= cap)
    expect(childRuns).toHaveLength(2);
    const atBoundary = await invoke.invoke({ agentName: 'reviewer', prompt: 'x' }); // spent 1.0 >= cap
    expect(atBoundary).toEqual({ error: 'cost_cap_exceeded' });
    expect(childRuns).toHaveLength(2);
  });

  it('Orchestrator のツール集合には agent.invoke が含まれる', () => {
    const { tools } = setup();
    expect(tools.map((t) => t.spec.name)).toContain('agent.invoke');
  });
});

// 深さ 1 を「子 run が実際に agent.invoke を呼べない」形でも固定する。
// buildTools (素のツール) に agent.invoke が含まれないことを直接 assert。
describe('深さ 1 固定 (素の buildTools に agent.invoke が無い)', () => {
  it('buildTools の戻りには agent.invoke が含まれない', async () => {
    const { buildTools } = await import('../src/index');
    const repo = createMemoryRepoContainer();
    const names = buildTools(repo, 'ws-belvedere').map((t) => t.spec.name);
    expect(names).not.toContain('agent.invoke');
  });
});
