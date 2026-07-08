// ticketAge の直接 unit test (F-23 / 2026-07-08)。
// 「in-progress 遷移の数分後に 1d と表示される」再現: 旧 DailyScreen 実装は
// Math.max(1, round(0)) = 1 を返していた。満日数 (floor) + <1d ラベルを固定する。

import { describe, it, expect } from 'vitest';
import { ticketAgeDays, ticketAgeLabel } from '~/utils/ticketAge';

const NOW = Date.parse('2026-07-08T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('ticketAgeDays', () => {
  it('着手数分後は 0 日 (旧実装は 1 を返していた = F-23 の機序)', () => {
    expect(ticketAgeDays(iso(5 * 60_000), NOW)).toBe(0);
  });
  it('12 時間後も 0 日 (round で 1d に繰り上げない)', () => {
    expect(ticketAgeDays(iso(12 * 3_600_000), NOW)).toBe(0);
  });
  it('ちょうど 24 時間で 1 日 (境界)', () => {
    expect(ticketAgeDays(iso(24 * 3_600_000), NOW)).toBe(1);
  });
  it('2.9 日は 2 日 (満日数)', () => {
    expect(ticketAgeDays(iso(2.9 * 86_400_000), NOW)).toBe(2);
  });
  it('退化入力: undefined / 不正文字列 / 未来時刻は 0', () => {
    expect(ticketAgeDays(undefined, NOW)).toBe(0);
    expect(ticketAgeDays('not-a-date', NOW)).toBe(0);
    expect(ticketAgeDays(iso(-3_600_000), NOW)).toBe(0);
  });
});

describe('ticketAgeLabel', () => {
  it('1 日未満は <1d', () => {
    expect(ticketAgeLabel(iso(5 * 60_000), NOW)).toBe('<1d');
  });
  it('1 日以上は Nd', () => {
    expect(ticketAgeLabel(iso(3 * 86_400_000), NOW)).toBe('3d');
  });
});
