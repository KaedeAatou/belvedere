// parseSSEEvents の unit test (P6 / 2026-07-07)。
// ストリーム受信でチャンクがフレーム/行の途中で切れても正しく組み立てられることを固定する。

import { describe, it, expect } from 'vitest';
import { parseSSEEvents } from '~/utils/sse';

describe('parseSSEEvents', () => {
  it('単一の完成フレームを event + data に分解する', () => {
    const { events, rest } = parseSSEEvents('event: delta\ndata: {"text":"あ"}\n\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"あ"}' }]);
    expect(rest).toBe('');
  });

  it('複数フレームを一度に取り出す', () => {
    const { events } = parseSSEEvents('event: step\ndata: {"t":1}\n\nevent: delta\ndata: {"text":"x"}\n\n');
    expect(events.map((e) => e.event)).toEqual(['step', 'delta']);
  });

  it('末尾の未完フレームは rest に残し、次回に持ち越して完成させる', () => {
    const first = parseSSEEvents('event: delta\ndata: {"text":"partial');
    expect(first.events).toEqual([]);
    expect(first.rest).toContain('partial');
    // 続きを連結して再度パース
    const second = parseSSEEvents(first.rest + '"}\n\n');
    expect(second.events).toEqual([{ event: 'delta', data: '{"text":"partial"}' }]);
  });

  it('event 行が無ければ event="message" 既定', () => {
    const { events } = parseSSEEvents('data: hello\n\n');
    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('CRLF を LF に正規化する', () => {
    const { events } = parseSSEEvents('event: done\r\ndata: {}\r\n\r\n');
    expect(events).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('data 複数行は \\n で連結する', () => {
    const { events } = parseSSEEvents('data: line1\ndata: line2\n\n');
    expect(events[0]!.data).toBe('line1\nline2');
  });

  it('空バッファ / 空フレームで壊れない (退化入力)', () => {
    expect(parseSSEEvents('')).toEqual({ events: [], rest: '' });
    expect(parseSSEEvents('\n\n\n\n').events).toEqual([]);
  });
});
