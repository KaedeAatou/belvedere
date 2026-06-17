// LLM プロバイダ抽象。後で gemini / vertex 実装を追加する。

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  /**
   * assistant ロールが tool を呼んだターンの記録 (実 LLM の履歴整合に必要)。
   * Gemini 等は functionCall(model ターン) → functionResponse の対応を要求するため、
   * runtime は tool 実行前にこのフィールド付き assistant メッセージを履歴へ積む。
   * Mock はこのフィールドを参照しない (system prompt と最後のメッセージで判定するため無害)。
   */
  toolCalls?: LLMToolCall[];
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
