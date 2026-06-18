# テスト規律 (must)

> 由来: d&d 並び替えバグ (区画密再採番で根治 / 2026-06-16) が **単体・e2e 全緑なのに本番で発症**した反省。緑のテストが「核の純粋関数を直接テストしていない」「実データ状態を踏まない」と、この種のバグを構造的に見逃す。根本原因は **テストピラミッドの中間層 (component unit) が物理的に欠落** していたこと。各層で何を捕まえるかを下表で固定し、層を取り違えない。

## テスト層の責務 (どの層で何を捕まえるか)

| 層 | 捕まえる対象 | ツール | 例 |
|---|---|---|---|
| **純粋関数 unit** | 比較 / 算術 / 分類 / 診断の corner case (退化入力) | vitest | `compareTicketOrder` / `computeReorderUpdates` / `partitionTicketsBySections` / `ticketRules` / 6観点 detect |
| **component unit** (新設 / T1b) | Vue の state / emit / 配線 (drag→API 引数, dirty→保存 enable) | vitest + @vue/test-utils | `SprintSectionedList` の onDragEnd→reorderTickets 引数、`DetailSheet` の二重送信防止 |
| **統合** | handler + memory repo の HTTP 契約 (status / body / IDOR) | vitest + `app.fetch` | `apps/api/test/*-handlers.test.ts` |
| **e2e** | 実ブラウザ flow + 永続 + 応答経路 (2xx を待つ) | Playwright | `apps/e2e/tests/reorder.spec.ts` |
| **実機** | drag の物理 / native 選択 / hit-test / 見た目 | local-ui-verify (`dev-local-noauth.sh` + Chrome DevTools) | 区画間 d&d の実操作・リロード保持 |

ロジックは純粋関数 unit に追い出して退化入力で固め、配線は薄い component unit、物理 (d&d) は実機で見る。**「緑 = ユーザーに対して動く」** にするには、編集した層に対応するテストを必ず書く (機械判定できる範囲は `pure-fn-test-guard` hook が nudge、できない「赤→緑を踏んだか」は skill 運用)。

## 1. 共有の純粋関数は直接の単体テストを持つ (必須)

memory / firestore / web など **複数層で共有される純粋関数**(比較・並び順・算術: `compareTicketOrder` / `orderBetween` / `applyStatusTransition` 等)は、その関数自体を import した直接テストを必ず持つ。ハンドラ経由の間接テストだけで満足しない。

**退化入力を必ず含める**: `undefined` / 欠落キー / 等値 / 端 (最小・最大・空)。
- 例: `compareTicketOrder` は「両方未設定」「片方だけ未設定」「等値 orderIndex」を全部固定する (`packages/shared/test/utils.test.ts`)。これが先頭ジャンプ機序を最安レイヤで捕まえる。

## 2. インタラクション・ハンドラは「実データ状態」でテストする (必須)

d&d 並び替え等のハンドラは、**本番で実際に起きるデータ状態**を再現する。
- ❌ 手で置いた distinct な値 (`orderIndex: 100 / 200`) だけで assert → バグの発生条件を踏まない。
- ✅ seed/新規と同じ **未設定 (`undefined`) 隣接・等値隣接** を作って、実際の失敗モード (先頭ジャンプ / 1つ下移動で復帰) を assert する。
- e2e は「並行 2 run が同一 WS 共有」のため **件数 assert 禁止**。自作分の相対順だけ見る + 自己清掃 (`apps/e2e/tests/reorder.spec.ts` 参照)。

## 3. バグ発見 → まず再現テスト (TDD for bugfix / 必須)

テストが見逃したバグを直すときは、**修正より先に**、それを捕まえる失敗テストを書く。
1. **最安レイヤ**で書く (純粋関数の単体テスト > ハンドラ単体 > e2e)。
2. **赤を確認** (テストが今のコードで落ちる = 機序を正しく捉えた証拠)。
3. 修正 → **緑を確認**。
4. 必要なら上位レイヤ (e2e / 実機) でも 1 本ガードを足す。

「修正してから、後で通るテストを足す」だけにしない。再現テストが無い修正は、機序を取り違えていても気付けない。

## 4. UI/インタラクション変更は実機操作でも確かめる

単体・e2e が緑でも、**実ブラウザで実際に操作**しないと UI/d&d のバグは残る (これが今回の決め手)。`scripts/dev-local-noauth.sh` + `local-ui-verify` skill を使う (CLAUDE.md「実機 UI 検証」参照)。**自作の auth バイパス足場を毎回組まない** — 既存スクリプトを使う。
