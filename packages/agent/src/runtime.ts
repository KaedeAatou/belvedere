import type { AgentName, AgentRun, AgentStep } from '@belvedere/shared';
import type { LLMMessage, LLMProvider, LLMRequest } from '@belvedere/llm';
import { specsOf, type ToolRegistry } from './tool';

export interface AgentRuntimeOpts {
  agentName: AgentName;
  /** Phase 1-B IDOR fix で必須化 (2026-06-10)。AgentRun.workspaceId に転記され、配下の Tool 呼び出しの workspaceId も captureした closure 経由で同値になる前提 */
  workspaceId: string;
  llm: LLMProvider;
  model: string;
  systemPrompt: string;
  tools: ToolRegistry;
  trigger?: AgentRun['trigger'];
  maxIterations?: number;
  /** 各ステップを観測したい時の hook */
  onStep?: (step: AgentStep) => void;
}

/**
 * 単一エージェントの実行ループ。
 * LLMが tool_calls を返したらツールを実行して結果を会話に積む → 再呼び出し。
 * stop:'stop' になるまで繰り返す。AgentRun を返す。
 */
export async function runAgent(
  opts: AgentRuntimeOpts,
  userInput: string,
  contextSeed: Record<string, unknown> = {},
): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const steps: AgentStep[] = [];

  const messages: LLMMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: userInput },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  const maxIter = opts.maxIterations ?? 6;
  let finalText = '';
  let outputArtifacts: AgentRun['outputArtifacts'] = {};

  try {
    for (let iter = 0; iter < maxIter; iter++) {
      const req: LLMRequest = {
        model: opts.model,
        messages,
        tools: specsOf(opts.tools),
        temperature: 0.2,
      };

      const resp = await opts.llm.generate(req);
      totalInputTokens += resp.usage.inputTokens;
      totalOutputTokens += resp.usage.outputTokens;
      totalCost += resp.usage.costUsd;

      // 思考のステップ記録 (mockなので簡易、本物では reasoning が来る)
      pushStep(steps, opts.onStep, {
        type: 'thought',
        at: new Date().toISOString(),
        content: { iter, model: req.model },
      });

      if (resp.stop.type === 'tool_calls') {
        // 実 LLM (Gemini 等) は functionCall(model ターン) → functionResponse の対応を要求するため、
        // tool 結果を積む前に assistant の tool_call ターンを履歴へ記録する (Mock は無視するので無害)。
        messages.push({ role: 'assistant', content: resp.text, toolCalls: resp.stop.calls });
        // tool呼び出し
        for (const call of resp.stop.calls) {
          const tool = opts.tools.get(call.name);
          pushStep(steps, opts.onStep, {
            type: 'tool_call',
            at: new Date().toISOString(),
            content: call.arguments,
            toolName: call.name,
          });
          if (!tool) {
            const errMsg = `tool not found: ${call.name}`;
            pushStep(steps, opts.onStep, {
              type: 'tool_result',
              at: new Date().toISOString(),
              content: { error: errMsg },
              toolName: call.name,
            });
            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: errMsg }),
              toolCallId: call.id,
              toolName: call.name,
            });
            continue;
          }
          const t0 = Date.now();
          let result: unknown;
          try {
            result = await tool.invoke(call.arguments);
          } catch (e) {
            const err = e as Error;
            result = { error: err.message };
          }
          const durationMs = Date.now() - t0;
          pushStep(steps, opts.onStep, {
            type: 'tool_result',
            at: new Date().toISOString(),
            content: result,
            toolName: call.name,
            durationMs,
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: call.id,
            toolName: call.name,
          });
        }
        // 続行 (再度 generate)
        continue;
      }

      // stop or length → assistant の最終応答を確定
      finalText = resp.text;
      messages.push({ role: 'assistant', content: finalText });
      pushStep(steps, opts.onStep, {
        type: 'output',
        at: new Date().toISOString(),
        content: finalText,
      });
      outputArtifacts = { summary: finalText };
      break;
    }

    return {
      id: runId,
      workspaceId: opts.workspaceId,
      agentName: opts.agentName,
      trigger: opts.trigger ?? 'human',
      startedAt,
      endedAt: new Date().toISOString(),
      status: 'succeeded',
      inputContext: { userInput, ...contextSeed },
      steps,
      outputArtifacts,
      llmUsage: {
        model: opts.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd: totalCost,
      },
    };
  } catch (e) {
    const err = e as Error;
    return {
      id: runId,
      workspaceId: opts.workspaceId,
      agentName: opts.agentName,
      trigger: opts.trigger ?? 'human',
      startedAt,
      endedAt: new Date().toISOString(),
      status: 'failed',
      inputContext: { userInput, ...contextSeed },
      steps,
      llmUsage: {
        model: opts.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd: totalCost,
      },
      error: err.stack ? { message: err.message, stack: err.stack } : { message: err.message },
    };
  }
}

function pushStep(arr: AgentStep[], hook: ((s: AgentStep) => void) | undefined, step: AgentStep): void {
  arr.push(step);
  hook?.(step);
}
