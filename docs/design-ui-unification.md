# UI 統一 + 種別バッジ + 見積もりパネル 実行計画 (2026-06-11 策定)

> 策定: Fable 5 / 実行: Opus・Sonnet 等の実装モデル (無人実行可)
> 対象: R3 (Demo/Live UI 統一) → T5 (種別/finding バッジ) → T7 (見積もりパネル) → T8 (e2e)
> R3 の確定済み設計判断とフィールド対応表は **`docs/refactoring-plan.md` §R3-0 / §R3-1 が正** (本書は重複させず参照)。
> `docs/refactoring-plan.md` §1 不可侵リスト / §6 検証ゲート / §7 エスカレーション基準を本書でも適用。

**2026-06-11 ユーザー承認**: UI epic の無人実行を許可 (「仕事中に他モデルに作業させたい」)。
前回の「視覚判断が要るため停止」は本書 §V のスクリーンショット自己検証プロトコルで代替する。

---

## §V. スクリーンショット自己検証プロトコル (視覚判断の無人化)

実行モデルは**自分の目 (Read で PNG を見る)** で画面崩れを判定する。手順:

### V-1. 検証基盤 (T0 / 最初に 1 回だけ作る)

1. `apps/web/components/RailPanel.vue` の各階ボタンに `data-testid="rail-<screenId>"` を付与
   (backlog / planning / daily / review / retro。レイアウト変更なし、属性追加のみ)
2. `apps/e2e/tests/screenshots.spec.ts` 新規:
   - authedPage で `/` を開き、`rail-backlog` → `rail-planning` → `rail-daily` → `rail-review` → `rail-retro`
     の順にクリックし、各画面で `page.screenshot({ fullPage: true, path: 'test-results/screens/<id>.png' })`
   - 追加で `/settings/profile` も 1 枚
   - assert は「画面ごとに最低 1 要素が visible」程度の軽いものに留める (本命は PNG)
3. CI の既存 artifact upload (`playwright-results-*`) が `test-results/` を含むので追加設定不要

### V-2. 検証ループ (画面を触る commit ごとに必須)

```
1. commit → push → CI を gh run watch で待つ
2. E2E run の ID を取得し: gh run download <runId> -n playwright-results-<runId> -D /tmp/shots-<n>
3. Read で /tmp/shots-<n>/screens/*.png を開いて自分の目で判定:
   □ セクション/カードが描画されている (空白画面・無限ローディングでない)
   □ テキストの重なり・はみ出しがない
   □ 実データ (WC-101 等の ID) が表示されている (BLV-2xx が残っていない)
   □ 配色が Hoshino トークン (クリーム地 + 黒インク + 暖オレンジ) のまま
4. NG → 修正 commit → ループ。2 回連続で同じ崩れが直らなければ §7 エスカレーション
```

> ローカル高速ループ (任意): `FIREBASE_SA_KEY` 不在でも `utils/firebase-admin.ts` は ADC に
> フォールバックする。`WEB_BASE_URL=http://localhost:3000 pnpm --filter @belvedere/e2e e2e` を
> 1 度試し、custom token 発行が ADC 権限で通れば「nuxt dev + ローカル e2e」で deploy 待ちなしの
> ループに切替えてよい。通らなければ CI ループ (上記) のみで進める。**ここで悩まない** (5 分で判定)。

### V-3. 迷った時の規約

- 見た目の判断に迷ったら**既存コンポーネントの見た目を踏襲** (新デザイン要素を発明しない)
- 空状態 (チケット 0 件等) は「まだチケットがありません」の 1 行テキストで統一
- 判断が割れる箇所は**保守的な方を選び、実行ログにメモ**して続行 (停止はブロック時のみ)

---

## 実行順

```
T0  検証基盤 (rail testid + screenshots.spec)             0.5h
R3  Demo/Live 統一 (refactoring-plan §R3-1 の 8 手順)      1.5-2 日 ← 画面単位 commit + V-2 ループ
T5  種別バッジ + ダイアログ種別 + finding バッジ            0.5-1 日
T7  見積もりパネル (DetailSheet)                           1 日
T8  e2e (ポーカー happy path + バッジ)                     0.5 日
```

---

## T5 詳細仕様

### T5-1. TypeMark 拡張 (種別バッジ)

- 既存 `apps/web/components/primitives/TypeMark.vue` は demo の `TicketType`
  ('story'|'bug'|'task'|'spike') を表示している。shared の `TicketType` に切替え:
  - `incident` を追加 (色は `--err` 系、既存 bug と区別できる形)
  - `type === undefined` の fallback を追加: グレーの「?」表示 (TYPE_MISSING の視覚化)
- props: `type?: TicketType` (optional 化)

### T5-2. 作成ダイアログの種別セレクタ + Spike 推奨

`apps/web/components/screens/BacklogScreen.vue` の作成ダイアログに追加:

- 種別セレクタ `data-testid="new-ticket-type"`: story / task / spike / bug / incident (default: story)
- **inline 提案**: title 入力を watch し `/(調査|検証|比較|スパイク)/` にマッチ && type !== 'spike' なら
  ダイアログ内に 1 行ヒント「`💡 調査系のタイトルです。Spike にしますか? [Spike にする]`」
  (`data-testid="suggest-spike"`、クリックで type='spike' に切替)
- type='spike' 選択時: SP 入力の代わりに `timeboxHours` 入力 (number、placeholder「4」) を表示
- type='task' 選択時: SP 入力を隠す (Task は SP を使わない)
- POST body に `type` / `timeboxHours` を含める (`useTickets.createTicket` の input 型を拡張)

### T5-3. finding バッジ (ルールエンジンの可視化)

- `apps/web/composables/useFindings.ts` 新規:
  `fetchFindings(ceremony)` → `GET /api/findings?ceremony=...` → `Map<ticketId, TicketFinding[]>`
  を useState で共有。チケット CRUD 後に再取得する `refresh()` を公開
- Backlog 画面 mount 時に `fetchFindings('refinement')`
- `TicketRow` に finding バッジ: その ticketId の findings があれば
  最悪 severity の色 (error=`--err` / warn=`--warn` / info=`--info`) のドット + 件数
  (`data-testid="finding-badge"`)。ホバーで `title` 属性に message 一覧 (改行区切り) — 最小実装
- R3 の暫定 `computeLocalFlags` (useFlags.ts) は **T5-3 完了時に削除**し、FlagPill 表示も
  findings ベースに置換 (ruleId → 短ラベルの辞書を useFindings.ts に持つ)

---

## T7 詳細仕様 (見積もりパネル)

### T7-1. composable

`apps/web/composables/useEstimation.ts` 新規。5 endpoint のラッパー:
`start(ticketId)` / `fetch(ticketId)` / `vote(ticketId, value)` / `reveal(ticketId)` / `adopt(ticketId, value)`。
パネル表示中は 5 秒 setInterval で `fetch` を再取得 (unmount で clearInterval)。

### T7-2. DetailSheet にパネル追加

`apps/web/components/DetailSheet.vue` (R3 で shared Ticket 化済) に
**`ticket.type === 'story'` のとき**「見積もり」セクション (`data-testid="estimation-panel"`) を追加:

| セッション状態 | 表示 |
|---|---|
| なし (GET 404) | SP 表示 + (owner/sm/po のみ) `見積もりセッションを開始` ボタン (`data-testid="est-start"`) |
| voting | フィボナッチボタン 1/2/3/5/8/13/? (`data-testid="est-vote-<v>"`、自分の票は強調)。「n 人投票済: 名前…」(値は出ない)。privileged に `開示` (`data-testid="est-reveal"`、0 票時 disabled) |
| revealed | 全員の票一覧 (名前 → 値)。フィボナッチ 2 段以上の開きがあれば既存の警告色で「見積もりが割れています。話し合って再投票か採用を」。privileged に値ごとの `この値で採用` (`data-testid="est-adopt-<v>"`) + `再投票` (= start を呼ぶ。旧セッションはサーバが discard) |
| adopted | 「SP {adoptedValue} 採用済」表示のみ |

- role は `useMe().me.role`、メンバ名は `/api/members` (R3 の useMembers) から引く
- 導線: TicketRow の `STORY_SP_MISSING` finding バッジ → DetailSheet を開いた時にパネルが見える (専用ジャンプは不要、最小実装)

---

## T8 詳細仕様 (e2e)

`apps/e2e/tests/estimation.spec.ts` 新規 (既存 fixture / POM パターン踏襲):

1. **ポーカー happy path**: Backlog → SP 無し story を新規作成 (種別セレクタで story) →
   DetailSheet を開く → `est-start` → `est-vote-5` → `est-reveal` → `est-adopt-5` →
   SP 表示が 5 になることを assert (robot は owner なので privileged 操作可)
2. **バッジ**: seed の WC-108 行に `finding-badge` が表示される (TYPE_MISSING)
3. BacklogPage / 新規 `DetailSheetPage` の Page Object に上記 testid のメソッドを追加

---

## 完了の定義 (UI epic 全体)

```
□ grep -rn "DemoTicket|useDemoData" apps/web → ゼロ
□ 全 5 画面 + settings のスクリーンショットを実行モデルが目視して崩れなし
□ e2e 9 本 (既存 6 + screenshots 1 + estimation 2) が CI 緑
□ 本番 URL で: Backlog に WC seed + 種別バッジ + finding バッジ / Daily で status 移動が永続化 /
  DetailSheet で見積もりポーカー一巡 (start→vote→reveal→adopt)
□ 実行ログ (autonomous-run.md) に画面ごとの結果 + 迷った判断のメモ
```

## キックオフプロンプト (ユーザーはこれを実装モデルに貼るだけ)

```
docs/design-ui-unification.md に従って UI epic を無人実行して。
順序: T0 → R3 (refactoring-plan §R3 参照) → T5 → T7 → T8。
§V のスクリーンショット自己検証を画面 commit ごとに必ず回す。
refactoring-plan §1 不可侵 / §6 検証ゲート / §7 エスカレーションを厳守。
```
