import type { LLMToolSpec } from '@belvedere/llm';

export interface AgentTool<TArgs = Record<string, unknown>, TResult = unknown> {
  spec: LLMToolSpec;
  invoke(args: TArgs): Promise<TResult>;
}

export type ToolRegistry = Map<string, AgentTool>;

export function buildRegistry(tools: AgentTool[]): ToolRegistry {
  const reg = new Map<string, AgentTool>();
  for (const t of tools) {
    if (reg.has(t.spec.name)) {
      throw new Error(`[agent] duplicate tool: ${t.spec.name}`);
    }
    reg.set(t.spec.name, t);
  }
  return reg;
}

export function specsOf(reg: ToolRegistry): LLMToolSpec[] {
  return [...reg.values()].map((t) => t.spec);
}
