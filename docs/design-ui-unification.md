# UI 統一 + 種別バッジ + 見積もりパネル 実行計画 (2026-06-11 策定)

> 策定: Fable 5 / 実行: Opus・Sonnet 等の実装モデル (無人実行可)
> 対象: R3 (Demo/Live UI 統一) → T5 (種別/finding バッジ) → T7 (見積もりパネル) → T8 (e2e)
> R3 の確定済み設計判断とフィールド対応表は **`docs/refactoring-plan.md` §R3-0 / §R3-1 が正** (本書は重複させず参照)。
> `docs/refactoring-plan.md` §1 不可侵リスト / §6 検証ゲート / §7 エスカレーション基準を本書でも適用。

**2026-06-11 ユーザー承認**: UI epic の無人実行を許可 (「仕事中に他モデルに作業させたい」)。
前回の「視覚判断が要るため停止」は本書 §V のスクリーンショット自己検証プロトコルで代替する。

**2026-06-11 デザイン決定** (docs/mockups/ui-patterns.html の 3 パターン比較後、ユーザー判断):
- **既存シェルを維持**: 上部 Backlog/Events Segmented Control + 左レール + 右 Integrity AI パネル。
  パターン B (パネル主役) / C (儀式没入) の大規模再構成は**不採用**
- 見積もりポーカーは **A 案 (DetailSheet 内セクション)** で実装する (§T7)
- ポーカーの主動線は **Refinement イベント** に紐づける → Events レールに Refinement が
  存在しないため **T9 で新設** (CLAUDE.md の 5 儀式表との乖離解消を兼ねる)
- **finding バッジは C 案 (ラベル付きピル)**: 行内に `種別なし` `SP未定` のような短ラベルを
  severity 色のピルで表示。ホバー不要で読めることを優先 (§T5-3 を C 仕様に改訂済)

---

## §V. スクリーンショット自己検証プロトコル (視覚判断の無人化)

実行モデルは**自分の目 (Read で PNG を見る)** で画面崩れを判定する。手順:

### V-1. 検証基盤 (T0 / 最初に 1 回だけ作る)

1. `apps/web/components/RailPanel.vue` の各階ボタンに `data-testid="rail-<screenId>"` を付与
   (backlog / planning / daily / review / retro。レイアウト変更なし、属性追加のみ。
   **T9 で refinement が増えたら巡回リストに `rail-refinement` を追加**)
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
T5  種別バッジ + ダイアログ種別 + finding ピル (C 案)       0.5-1 日
T9  Refinement イベント画面 新設 (findings ワークキュー)    0.5-1 日
T7  見積もりパネル (DetailSheet / A 案)                    1 日
T10 DetailSheet 編集 + 削除                                0.5 日
T8  e2e (ポーカー happy path + ピル + 編集/削除)            0.5 日
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

### T5-3. finding バッジ (ルールエンジンの可視化) — C 案: ラベル付きピル

- `apps/web/composables/useFindings.ts` 新規:
  `fetchFindings(ceremony)` → `GET /api/findings?ceremony=...` → `Map<ticketId, TicketFinding[]>`
  を useState で共有。チケット CRUD 後に再取得する `refresh()` を公開。
  **ruleId → 短ラベルの辞書**もここに持つ (例: TYPE_MISSING=`種別なし` / STORY_SP_MISSING=`SP未定` /
  STORY_STALL=`{n}日停滞` / STORY_DOD_MISSING=`DoDなし` / SPIKE_NO_TIMEBOX=`timebox未設定` …17 ルール分)
- Backlog 画面 mount 時に `fetchFindings('refinement')`
- `TicketRow` に finding ピル (`data-testid="finding-badge"`):
  - severity 色の小ピル (error=`--err` / warn=`--warn` / info=`--info` の背景薄め + 同色文字、
    既存 FlagPill のスタイルを流用) に短ラベルを表示
  - **行内は最大 2 個 + 超過分は `+n` ピル**に丸める (横溢れ防止)。`+n` ホバーで `title` 属性に全 message
  - severity の悪い順に表示 (error → warn → info)
- R3 の暫定 `computeLocalFlags` (useFlags.ts) は **T5-3 完了時に削除**し、FlagPill 表示も
  findings ベースに置換

---

## T9 詳細仕様 (Refinement イベント画面 新設)

> 背景: web の Events レールは Planning(01)/Daily(02)/Review(03)/Retro(04) の 4 つで、
> CLAUDE.md の 5 儀式表 (03 = Refinement) と乖離している。本タスクで解消し、
> 見積もりポーカーの主動線をここに置く。

### T9-1. レール / 画面登録

- `useDemoData.ts` (R3 後は移設先の screens 定義) の `ScreenId` に `'refinement'` を追加
- `SCREENS` / `CEREMONIES` に Refinement を **floor 03** で挿入し、
  Review → `04` / Retro → `05` に振り直す (CLAUDE.md の 5 儀式表と一致させる):
  `{ id: 'refinement', label: 'Backlog Refinement', floor: '03', sub: 'Groom & estimate' }`
- `pages/index.vue` の画面切替に `RefinementScreen` を配線
- rail testid `rail-refinement` が自動で付く (T0 の `rail-<screenId>` 実装に従う) →
  `screenshots.spec.ts` の巡回リストに `refinement` を追加 (T9 完了 commit に含める)

### T9-2. RefinementScreen.vue (findings ワークキュー)

`apps/web/components/screens/RefinementScreen.vue` 新規。Refinement Agent の検出結果を
「会で上から潰すワークキュー」として表示する:

- mount 時に `useFindings.fetchFindings('refinement')` (T5-3 と同じデータ、再利用)
- **ルール別グループ表示** (グループヘッダ = 短ラベル + 件数、severity 悪い順):
  例「SP 未見積もり (3)」「種別なし (1)」「粒度過大 SP>8 (1)」「Epic rationale 欠落 (1)」
- 各行 = TicketRow 流用 (ID + 種別バッジ + タイトル + finding ピル)。クリックで DetailSheet
- **`STORY_SP_MISSING` グループの行には「ポーカー開始」ボタン**
  (`data-testid="ref-start-poker-<ticketId>"`): クリックで DetailSheet を開き、
  estimation panel の `start` を即時呼び出す (T7 の主動線)
- 空状態: 「指摘はありません — バックログは健全です」の 1 行
- 既存儀式画面 (Planning 等) のレイアウト文法 (ヘッダ + セクション) を踏襲、新デザイン要素は発明しない

---

## T7 詳細仕様 (見積もりパネル / A 案: DetailSheet 内セクション)

> 動線は 2 つ: **主 = Refinement 画面のポーカー開始ボタン (T9-2)** / 副 = Backlog から
> DetailSheet を開いた時の見積もりセクション。実装はどちらも同じ DetailSheet パネル 1 個。

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

## T10 詳細仕様 (DetailSheet チケット編集 + 削除 / 2026-06-11 ユーザー承認で追加)

> 「一通り作成して動かして改善したい」ため、閲覧専用だった DetailSheet に編集・削除を追加する。
> PATCH / DELETE API と `useTickets.patchTicket` / `deleteTicket` は R3 手順 1 で配線済 — 本タスクは UI のみ。

### T10-1. 編集モード

- DetailSheet ヘッダに `編集` ボタン (`data-testid="edit-ticket"`) → 表示フィールドが入力に変わる:
  - title (text) / description (textarea) /
    assigneeId (select、選択肢は useMembers) / priority / valueImpact (select、選択肢は shared の union 型に従う)
  - **estimatePt は編集対象外** (SP はポーカー経由が原則、T7)
- `保存` (`data-testid="save-ticket"`) → `patchTicket` → 楽観更新 + `useFindings.refresh()`
  (編集で指摘が解消され得るため)。`キャンセル` で元値に戻す
- 入力 UI は作成ダイアログ (BacklogScreen) の既存フォーム部品・スタイルを流用。新デザインを発明しない

### T10-2. 削除

- DetailSheet 末尾に `削除` (`data-testid="delete-ticket"`)。誤操作防止は **2 段階クリック**
  (1 回目で「もう一度押すと削除します」に変わる、3 秒で戻る) — window.confirm は使わない (e2e が面倒)
- 実行で `deleteTicket` → シートを閉じ一覧から除去 + findings refresh

---

## T8 詳細仕様 (e2e)

`apps/e2e/tests/estimation.spec.ts` 新規 (既存 fixture / POM パターン踏襲):

1. **ポーカー happy path (主動線 = Refinement 経由)**: Backlog → SP 無し story を新規作成
   (種別セレクタで story) → Events → Refinement 画面 →「SP 未見積もり」グループに表示される →
   `ref-start-poker-<id>` → DetailSheet が開き voting 状態 → `est-vote-5` → `est-reveal` →
   `est-adopt-5` → SP 表示が 5 になることを assert (robot は owner なので privileged 操作可)
2. **finding ピル**: seed の WC-108 行 (Backlog) に `finding-badge` ピルが「種別なし」ラベルで
   表示される (TYPE_MISSING / C 案)
3. **編集 + 削除** (backlog.spec に追加、**自分で作成したチケットのみ対象 — seed は触らない**):
   作成した story を DetailSheet で開く → `edit-ticket` → タイトル変更 → `save-ticket` →
   一覧に反映を assert。続けて `delete-ticket` ×2 → 一覧から消えることを assert
4. BacklogPage / 新規 `RefinementPage` / 新規 `DetailSheetPage` の Page Object に上記 testid の
   メソッドを追加

---

## 完了の定義 (UI epic 全体)

```
□ grep -rn "DemoTicket|useDemoData" apps/web → ゼロ
□ 全 6 画面 (Refinement 含む) + settings のスクリーンショットを実行モデルが目視して崩れなし
□ e2e 10 本 (既存 6 + screenshots 1 + estimation 2 + 編集/削除 1) が CI 緑
□ 本番 URL で: Backlog に WC seed + 種別バッジ + finding ピル (C 案) /
  Refinement 画面に findings ワークキュー / Daily で status 移動が永続化 /
  Refinement →「ポーカー開始」→ DetailSheet で一巡 (start→vote→reveal→adopt) /
  DetailSheet でタイトル編集・削除ができる
□ 実行ログ (autonomous-run.md) に画面ごとの結果 + 迷った判断のメモ
```

## キックオフプロンプト (ユーザーはこれを実装モデルに貼るだけ)

```
docs/design-ui-unification.md に従って UI epic を無人実行して。
順序: T0 → R3 (refactoring-plan §R3 参照) → T5 → T9 → T7 → T10 → T8。
§V のスクリーンショット自己検証を画面 commit ごとに必ず回す。
refactoring-plan §1 不可侵 / §6 検証ゲート / §7 エスカレーションを厳守。
```
