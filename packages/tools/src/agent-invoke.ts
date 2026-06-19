// Orchestrator 協議ツール agent.invoke の引数検証 (純粋関数) と関連型。
//
// 設計判断 (2026-06-19 確定):
// - Orchestrator はスクラムマスター = 単一窓口。agent.invoke で 5 ceremony agent を子として
//   起動し協議を統括する。トリガーは画面操作のみ (時刻ルーティングは別工程で prompts.ts から除去予定。
//   現状 prompts.ts には時刻ルーティングの記述が残存 = agent-prompt-sync + mock-llm-reviewer で別途書換)。
// - 深さ 1 固定: 子には agent.invoke を渡さない (handler 側で素の buildTools を使う) = 構造で再帰不能。
// - validateInvocation は LLM 由来の args (agentName / prompt) を検証し、
//   空名 / 未知名 / 自己参照 (orchestrator→orchestrator) / 空 prompt を reject する。
//   .claude/rules/testing.md §1 に従い、退化入力を直接 unit テストで固める純粋関数として切り出す。

import type { AgentName } from '@belvedere/shared';

/** agent.invoke が LLM から受け取る生 args (型は unknown 起点で検証する)。 */
export interface AgentInvokeInput {
  agentName?: unknown;
  prompt?: unknown;
}

/** validateInvocation の reject 理由 (Literal Union)。 */
export type InvocationRejectReason =
  | 'empty_agent'
  | 'unknown_agent'
  | 'self_reference'
  | 'empty_prompt';

export type ValidateInvocationResult =
  | { ok: true; agentName: AgentName; prompt: string }
  | { ok: false; reason: InvocationRejectReason };

/**
 * agent.invoke の引数を検証する純粋関数。
 *
 * 判定順 (最初に該当した理由を返す):
 *  1. agentName が非空 string でない → empty_agent
 *  2. agentName === selfName → self_reference (orchestrator が自分/orchestrator を呼ぶのを塞ぐ)
 *  3. agentName が knownAgents に含まれない → unknown_agent
 *  4. prompt が string で trim 後非空でない → empty_prompt
 *  5. すべて通過 → ok
 *
 * knownAgents は「子として呼んでよい 5 ceremony agent」(orchestrator を除外) を呼出側が渡す。
 * self_reference と「orchestrator を子に」を二重に塞ぐ設計。
 */
export function validateInvocation(
  input: AgentInvokeInput,
  ctx: { selfName: AgentName; knownAgents: ReadonlyArray<AgentName> },
): ValidateInvocationResult {
  const { agentName, prompt } = input;

  if (typeof agentName !== 'string' || agentName.trim().length === 0) {
    return { ok: false, reason: 'empty_agent' };
  }
  if (agentName === ctx.selfName) {
    return { ok: false, reason: 'self_reference' };
  }
  if (!ctx.knownAgents.includes(agentName as AgentName)) {
    return { ok: false, reason: 'unknown_agent' };
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { ok: false, reason: 'empty_prompt' };
  }
  return { ok: true, agentName: agentName as AgentName, prompt };
}

/** 子として協議に呼べる 5 ceremony agent (orchestrator を除外 = 自己参照・無限協議を構造で断つ)。 */
export const CEREMONY_AGENTS: ReadonlyArray<AgentName> = [
  'planner',
  'daily',
  'refinement',
  'reviewer',
  'retrospective',
];
