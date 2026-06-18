// memory / firestore backend 共通の等値フィルタ集約 (R2-E / 2026-06-18)。
//
// 各 entity の list が「workspaceId 必須 + 任意フィールドは指定時だけ等値で絞る」という
// `if (q.x) xs = xs.filter((r) => r.x === q.x)` 連鎖を重複保持し、条件追加時のコピペずれの温床
// だった。spec を [行のキー, 期待値] の配列で渡し、1 関数で連鎖を表現する。
//
// 規則:
//   - 期待値 undefined のエントリは **スキップ** (= 絞らない / 任意フィールド未指定)。
//   - それ以外は `===` で等値マッチ。**0 / false / '' は undefined と区別して「その値で絞る」**
//     (truthy 判定 `if (q.x)` だと falsy な有効値を取りこぼすため、ここでは undefined のみ除外)。
//   - query 名 ≠ 行キー (例 TicketQuery.storyId → Ticket.parentTicketId) は呼出側でマッピングして
//     [行キー, query 値] を渡すことで吸収する。
//   - sort / limit は entity 固有 (compareTicketOrder / startedAt 降順 / slice) なので統合せず、
//     本関数の結果に呼出側が掛ける。
//   - 常に新しい配列を返す (呼出側が結果を sort で破壊的に並べても元の store を汚さない)。

export function applyEquFilters<T>(
  rows: T[],
  spec: ReadonlyArray<readonly [keyof T, unknown]>,
): T[] {
  let xs = [...rows];
  for (const [key, expected] of spec) {
    if (expected === undefined) continue; // 未指定 = 絞らない
    xs = xs.filter((row) => row[key] === expected);
  }
  return xs;
}
