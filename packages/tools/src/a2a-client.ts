// 最小 A2A (Agent2Agent) クライアント (2026-06-25)。
//
// 自前くるくる (TS) を本体 (正本) に保ち、ADK エージェント (Python / orchestrator-py) を A2A 越しの
// 専門ピアとして招集するための薄いクライアント。research (Anthropic / 12-Factor / Google ADK・A2A) で
// 確定した「ハイブリッド / Strangler Fig」構成の TS 側の口。
//
// プロトコル: A2A の JSON-RPC `message/send` を 1 往復叩く (ADK の to_a2a が生成するサーバ)。
// レスポンス (Task / Message) からテキストを防御的に抽出する。SDK を足さず fetch 直叩き
// (ElasticKnowledgeSearcher と同じ fetchImpl 注入でテスト可能)。
//
// 安全: 失敗 (非2xx / JSON-RPC error / 例外) は throw せず { ok:false } を返す。呼出側は ok:false で
// 既存の TS runAgent 経路へ自動 fallback する (= ADK ピアが落ちても本番 5 儀式は無傷 = 退避路)。

export interface A2AInvokeResult {
  ok: boolean;
  /** ピアの応答テキスト (失敗時は空文字)。 */
  text: string;
  /** A2A result (Task / Message) の生データ (デバッグ用)。 */
  raw?: unknown;
  error?: string;
}

export interface A2AInvokeOpts {
  /** テスト用に fetch を差し替える。未指定なら global fetch。 */
  fetchImpl?: typeof fetch;
  /** タイムアウト ms (既定 25000)。ADK ピアが遅い/不達でも本体を長く待たせない。 */
  timeoutMs?: number;
  /** 決定的テスト用の message id。未指定なら自動生成。 */
  messageId?: string;
}

/** A2A の Task / Message からテキスト part を防御的に集める (SDK のバージョン差を吸収)。 */
export function extractA2AText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const chunks: string[] = [];
  const pushParts = (parts: unknown): void => {
    if (!Array.isArray(parts)) return;
    for (const p of parts) {
      if (p && typeof p === 'object') {
        const part = p as { kind?: string; text?: unknown; type?: string };
        if (typeof part.text === 'string') chunks.push(part.text);
      }
    }
  };
  const r = result as {
    parts?: unknown; // Message 直返し
    artifacts?: Array<{ parts?: unknown }>; // Task.artifacts
    status?: { message?: { parts?: unknown } }; // Task.status.message
    message?: { parts?: unknown };
  };
  pushParts(r.parts);
  if (Array.isArray(r.artifacts)) for (const a of r.artifacts) pushParts(a?.parts);
  pushParts(r.status?.message?.parts);
  pushParts(r.message?.parts);
  return chunks.join('').trim();
}

/**
 * A2A ピア (ADK エージェント) に prompt を送り、応答テキストを得る。
 * 失敗は throw せず ok:false で返す (呼出側が TS 経路へ fallback する前提)。
 */
export async function a2aInvoke(
  peerUrl: string,
  prompt: string,
  opts: A2AInvokeOpts = {},
): Promise<A2AInvokeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const id = opts.messageId ?? `belv-a2a-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const url = `${peerUrl.replace(/\/+$/, '')}/`;
  const body = {
    jsonrpc: '2.0',
    id,
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        parts: [{ kind: 'text', text: prompt }],
        messageId: id,
        kind: 'message',
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, text: '', error: `[a2a] ${res.status} ${res.statusText}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (data.error) return { ok: false, text: '', error: data.error.message ?? '[a2a] jsonrpc error' };
    const text = extractA2AText(data.result);
    if (!text) return { ok: false, text: '', error: '[a2a] 応答にテキストが無い', raw: data.result };
    return { ok: true, text, raw: data.result };
  } catch (e) {
    return { ok: false, text: '', error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
