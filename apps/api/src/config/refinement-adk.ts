// Refinement を ADK エージェントへ A2A 越しに委譲する経路 (2026-06-25 / Strangler Fig)。
//
// 自前くるくる (TS runAgent) を本体に保ったまま、Refinement だけを「flag でコード固定ルート」で
// ADK ピア (orchestrator-py / A2A) に委譲する。**ADK 不達/エラーは null を返して呼出側が既存 TS
// runAgent へ自動 fallback する (退避路)** ので、本番 5 儀式は ADK ゼロでも無傷。
//
// 既定 OFF: REFINEMENT_VIA_ADK!=='true' または ORCHESTRATOR_A2A_URL 未設定なら null (= TS 経路)。

import type { AgentRun } from '@belvedere/shared';
import { generateId } from '@belvedere/shared';
import { a2aInvoke, type A2AInvokeResult } from '@belvedere/tools';

export interface RefinementAdkOpts {
  /** 既定: process.env.REFINEMENT_VIA_ADK === 'true'。 */
  enabled?: boolean;
  /** 既定: process.env.ORCHESTRATOR_A2A_URL。ADK ピア (orchestrator-py) の A2A エンドポイント。 */
  peerUrl?: string;
  /** テスト用に a2aInvoke を差し替える。 */
  invoke?: (peerUrl: string, prompt: string) => Promise<A2AInvokeResult>;
  /** テスト用の now (決定的)。 */
  now?: string;
}

/** A2A の応答テキストを AgentRun 形に合成する (web/MCP が通常 run と同じ shape で扱える)。 */
function synthesizeRun(text: string, workspaceId: string, peerUrl: string, now: string): AgentRun {
  return {
    id: generateId('AR'),
    workspaceId,
    agentName: 'refinement',
    trigger: 'human',
    startedAt: now,
    endedAt: now,
    status: 'succeeded',
    inputContext: { via: 'adk-a2a', peer: peerUrl },
    steps: [{ type: 'output', at: now, content: text }],
    outputArtifacts: { summary: text },
    // A2A 経由は token/コストを TS 側で観測しないため 0 (ADK ピアが内部で消費)。
    llmUsage: { model: 'gemini-2.5-pro (adk/a2a)', inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };
}

/**
 * Refinement を ADK 経由で実行できれば AgentRun を返す。flag OFF / url 未設定 / A2A 失敗時は null
 * (呼出側は null で既存 TS runAgent へ fallback する)。
 */
export async function tryRefinementViaAdk(
  prompt: string,
  workspaceId: string,
  opts: RefinementAdkOpts = {},
): Promise<AgentRun | null> {
  const enabled = opts.enabled ?? process.env.REFINEMENT_VIA_ADK === 'true';
  const peerUrl = opts.peerUrl ?? process.env.ORCHESTRATOR_A2A_URL ?? '';
  if (!enabled || !peerUrl) return null;

  const invoke = opts.invoke ?? a2aInvoke;
  const res = await invoke(peerUrl, prompt);
  if (!res.ok) {
    // 退避路: ADK ピア不達/エラーは握りつぶし TS 経路へ。本番 Refinement は止めない。
    console.warn(`[refinement-adk] A2A 失敗、TS runAgent へ fallback: ${res.error ?? 'unknown'}`);
    return null;
  }
  return synthesizeRun(res.text, workspaceId, peerUrl, opts.now ?? new Date().toISOString());
}
