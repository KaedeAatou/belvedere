// Gemini API (Google AI Studio / generativelanguage.googleapis.com) プロバイダ。
// ハッカソン要件 A-2「Gemini API」の実体。SDK を足さず REST を直叩きする
// (fetch を注入可能にして単体テストを成立させる / MCP server と同じ方針)。
//
// LLMProvider 抽象 (provider.ts) を Gemini の generateContent にマップする:
//   - system メッセージ      → systemInstruction
//   - user メッセージ        → role 'user' の text part
//   - assistant.toolCalls    → role 'model' の functionCall part (runtime が履歴に積む)
//   - tool メッセージ        → role 'user' の functionResponse part (連続分は 1 ターンに集約)
//   - req.tools              → tools[].functionDeclarations
//   - req.responseSchema     → generationConfig.responseMimeType + responseSchema
//   - usageMetadata          → usage (input/output tokens) + 概算 costUsd

import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStop,
  LLMToolCall,
} from './provider';

export interface GeminiConfig {
  /** Google AI Studio で発行した API キー (GEMINI_API_KEY)。 */
  apiKey: string;
  /** 既定 https://generativelanguage.googleapis.com/v1beta */
  baseUrl?: string;
  /** テスト用に fetch を差し替える。未指定なら global fetch。 */
  fetchImpl?: typeof fetch;
  /** 429/5xx の最大リトライ回数 (=初回に加える追加試行数)。既定 3 (合計 4 回試行)。 */
  maxRetries?: number;
  /** リトライ初回の待機 ms (指数バックオフの基数)。既定 500。テストは 0 を渡す。 */
  retryBaseMs?: number;
}

// ===== Gemini REST の最小型 (使う範囲のみ) =====
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

// 概算コスト (USD / 1M tokens)。厳密値でなく AgentRun.llmUsage に載せる目安。
const COST_TABLE: { match: RegExp; inUsd: number; outUsd: number }[] = [
  { match: /flash/i, inUsd: 0.3, outUsd: 2.5 },
  { match: /pro/i, inUsd: 1.25, outUsd: 10 },
];
function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const row = COST_TABLE.find((r) => r.match.test(model)) ?? COST_TABLE[1]!;
  return (inputTokens / 1_000_000) * row.inUsd + (outputTokens / 1_000_000) * row.outUsd;
}

/** 一時障害として安全にリトライできる HTTP status (429 rate / 5xx 過負荷)。400/403 等は即 throw。 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** tool メッセージの JSON 文字列を functionResponse.response (オブジェクト必須) に変換。 */
function toResponseObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: content };
  }
}

/** LLMMessage[] → Gemini の { systemInstruction, contents }。連続 tool 結果は 1 user ターンに集約。 */
export function toGeminiContents(messages: LLMMessage[]): {
  systemInstruction?: string;
  contents: GeminiContent[];
} {
  const systemTexts: string[] = [];
  const contents: GeminiContent[] = [];
  let pendingToolParts: GeminiPart[] = [];

  const flushTools = (): void => {
    if (pendingToolParts.length > 0) {
      contents.push({ role: 'user', parts: pendingToolParts });
      pendingToolParts = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      flushTools();
      if (m.content.trim()) systemTexts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      // 連続する tool 結果は 1 ターンにまとめる (直前の model functionCall ターンへの応答)。
      pendingToolParts.push({
        functionResponse: { name: m.toolName ?? 'unknown', response: toResponseObject(m.content) },
      });
      continue;
    }
    flushTools();
    if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const call of m.toolCalls) parts.push({ functionCall: { name: call.name, args: call.arguments } });
      }
      if (m.content.trim()) parts.push({ text: m.content });
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }
    // user
    contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  flushTools();

  const result: { systemInstruction?: string; contents: GeminiContent[] } = { contents };
  if (systemTexts.length > 0) result.systemInstruction = systemTexts.join('\n\n');
  return result;
}

/** Gemini の generateContent レスポンス → LLMResponse。 */
function parseGeminiResponse(data: GeminiGenerateResponse, model: string): LLMResponse {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const calls: LLMToolCall[] = [];
  const textChunks: string[] = [];
  for (const p of parts) {
    if (p.functionCall) {
      calls.push({
        id: `gem_${p.functionCall.name}_${calls.length + 1}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      });
    } else if (typeof p.text === 'string') {
      textChunks.push(p.text);
    }
  }

  let stop: LLMStop;
  if (calls.length > 0) {
    stop = { type: 'tool_calls', calls };
  } else if (candidate?.finishReason === 'MAX_TOKENS') {
    stop = { type: 'length' };
  } else {
    stop = { type: 'stop' };
  }

  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  return {
    text: textChunks.join(''),
    stop,
    usage: { inputTokens, outputTokens, costUsd: estimateCostUsd(model, inputTokens, outputTokens) },
    raw: data,
  };
}

export class GeminiLLMProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(cfg: GeminiConfig) {
    if (!cfg.apiKey) {
      throw new Error(
        '[llm:gemini] API キーが未設定です。GEMINI_API_KEY (Google AI Studio で発行) を環境変数に設定してください。',
      );
    }
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.maxRetries = cfg.maxRetries ?? 3;
    this.retryBaseMs = cfg.retryBaseMs ?? 500;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const { systemInstruction, contents } = toGeminiContents(req.messages);

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (req.tools && req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    const genConfig: Record<string, unknown> = {};
    if (req.temperature !== undefined) genConfig.temperature = req.temperature;
    if (req.maxOutputTokens !== undefined) genConfig.maxOutputTokens = req.maxOutputTokens;
    if (req.responseSchema) {
      genConfig.responseMimeType = 'application/json';
      genConfig.responseSchema = req.responseSchema;
    }
    if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig;

    // API キーはヘッダ (x-goog-api-key) に置き URL に載せない (ログ漏洩回避)。
    const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
    };

    // 429 (rate) / 5xx (過負荷) は一時障害。指数バックオフでリトライする。
    // Gemini 無料枠 flash は混雑時 503 を返しやすく、リトライなしだと agent run が落ちるため。
    let res = await this.fetchImpl(url, init);
    for (let attempt = 0; !res.ok && RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries; attempt++) {
      await sleep(this.retryBaseMs * 2 ** attempt);
      res = await this.fetchImpl(url, init);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[llm:gemini] ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
    }

    const data = (await res.json()) as GeminiGenerateResponse;
    return parseGeminiResponse(data, req.model);
  }

  /**
   * テキストを埋め込みベクトルに変換する (RAG / Firestore Vector Search 用 / 2026-06-25)。
   * generateContent と同じ REST + x-goog-api-key + リトライ方針。LLMProvider interface には載せない
   * (埋め込みは Gemini 固有機能。FirestoreKnowledgeSearcher 等が EmbedFn として注入して使う)。
   *
   * 既定モデルは gemini-embedding-001 (generativelanguage で利用可能なのが gemini-embedding 系のみのため /
   * 既定 3072 次元)。Firestore Vector に入れる時は上限 2048 次元内に収めるため
   * opts.outputDimensionality=768 を指定する (COSINE 検索なので正規化不要)。
   * taskType は検索品質向上のため document/query で出し分ける (RETRIEVAL_DOCUMENT 投入 / RETRIEVAL_QUERY 検索)。
   */
  async embedText(text: string, opts: EmbedTextOpts = {}): Promise<number[]> {
    const model = opts.model ?? 'gemini-embedding-001';
    const body: Record<string, unknown> = {
      content: { parts: [{ text }] },
      ...(opts.taskType !== undefined && { taskType: opts.taskType }),
      ...(opts.outputDimensionality !== undefined && { outputDimensionality: opts.outputDimensionality }),
    };
    const url = `${this.baseUrl}/models/${encodeURIComponent(model)}:embedContent`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
    };

    let res = await this.fetchImpl(url, init);
    for (let attempt = 0; !res.ok && RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries; attempt++) {
      await sleep(this.retryBaseMs * 2 ** attempt);
      res = await this.fetchImpl(url, init);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[llm:gemini] embedText ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
    }
    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!values || values.length === 0) {
      throw new Error('[llm:gemini] embedText: 空の embedding が返りました (model/taskType を確認)');
    }
    return values;
  }
}

/** Gemini 埋め込みの出し分けオプション (taskType で document/query を区別すると検索品質が上がる)。 */
export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
export interface EmbedTextOpts {
  /** 既定 'gemini-embedding-001' (3072 次元)。Firestore に入れる時は outputDimensionality=768 を指定。 */
  model?: string;
  taskType?: EmbedTaskType;
  /** 次元を切り詰める (Firestore Vector 上限 2048)。gemini-embedding-001 既定の 3072 を 768 等へ。 */
  outputDimensionality?: number;
}
