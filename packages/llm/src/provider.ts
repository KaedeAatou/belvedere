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

/** ストリーミング生成のコールバック。text 断片が来るたびに onDelta が呼ばれる。 */
export interface LLMStreamHandlers {
  onDelta: (text: string) => void;
}

export interface LLMProvider {
  readonly name: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
  /**
   * ストリーミング生成 (P6 / optional)。実装は text 断片を onDelta で逐次通知しつつ、
   * 最後に generate と同じ shape の LLMResponse (確定) を返す。未実装のプロバイダ (vertex 等) は
   * 持たなくてよい (呼び手が generate にフォールバックする)。
   */
  generateStream?(req: LLMRequest, handlers: LLMStreamHandlers): Promise<LLMResponse>;
}
