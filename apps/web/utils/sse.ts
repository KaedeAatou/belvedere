// SSE (Server-Sent Events) フレームを解析する純粋関数 (P6 / Nuxt 非依存で直接テスト)。
//
// fetch + ReadableStream で受信したテキストは、チャンク境界がフレームやフィールドの途中で
// 切れる。呼び手は「前回の rest + 今回のデコード文字列」を渡し、完成したフレームだけ events で
// 受け取り、未完の末尾は rest として次へ持ち越す。

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * バッファから完成した SSE イベントを取り出す。
 * - フレーム区切りは空行 (\n\n)。末尾の未完フレームは rest に残す。
 * - 各フレームの `event:` / `data:` 行を拾う。data 複数行は \n 連結。
 * - CRLF は LF に正規化する。
 */
export function parseSSEEvents(buffer: string): { events: SSEEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const rest = frames.pop() ?? ''; // 最後の要素は未完フレーム (区切りが来ていない)
  const events: SSEEvent[] = [];
  for (const frame of frames) {
    if (!frame.trim()) continue; // 空フレーム (連続する空行) は無視
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}
