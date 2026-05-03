// LLM プロバイダ抽象。後で gemini / vertex 実装を追加する。

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface LLMToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolSpec[];
  temperature?: number;
  maxOutputTokens?: number;
  /** 構造化出力スキーマ (任意) */
  responseSchema?: Record<string, unknown>;
}

export type LLMStop =
  | { type: 'stop' }
  | { type: 'tool_calls'; calls: LLMToolCall[] }
  | { type: 'length' };

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  stop: LLMStop;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}
