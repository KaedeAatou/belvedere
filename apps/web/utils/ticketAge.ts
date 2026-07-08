// チケット経過日数の共通純粋関数 (F-23 / 2026-07-08)。
//
// 旧実装は DailyScreen (`Math.max(1, Math.round(...))` = 着手数分後でも「1d」) と
// EventsHomeScreen (`Math.max(0, Math.round(...))` = 12h で 1d に丸め) の二重実装で、
// 下限も丸めも食い違っていた。切り捨て (floor) の「満日数」に統一し、1 日未満は
// ラベル側で `<1d` と表示して「着手直後なのに 1d」の誤解を無くす。

/** 経過満日数 (floor)。started 無し/不正/未来は 0。 */
export function ticketAgeDays(started: string | undefined, nowMs: number): number {
  if (!started) return 0;
  const t = Date.parse(started);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** カンバンカード等のバッジ表示。1 日未満は `<1d`、それ以外は `${n}d`。 */
export function ticketAgeLabel(started: string | undefined, nowMs: number): string {
  const d = ticketAgeDays(started, nowMs);
  return d < 1 ? '<1d' : `${d}d`;
}
