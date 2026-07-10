# Belvedere — Pitch

> 想定: 3分ピッチ + 質疑 / スライド10枚以内 / デモ90秒
> 最終ピッチ: 2026-08-19 渋谷ストリーム
> 2026-04-30 改訂: 「形骸化したスクラムをAIが品質と運営で底上げする」軸に統一。風メタファーを廃止。
> 2026-05-03 改訂: **Refinement Agent (5番目)** 追加 + Project エンティティ + valueImpact 軸。比喩は「螺旋階段の眺望」(明示)。
> 2026-05-05 改訂: **Refinement Agent に第 6 観点「戦略整合性」追加** (Epic.rationale 欠落検出)。§2 課題に「戦略の不在 (開発者が Why を見失う)」を追加、デモ #4 で「BLV-110 ミスマッチ + EP-3 rationale 欠落」を見せる。
> 2026-05-05 (夜) 改訂: **MCP server 追加** — Claude Code / Cursor から Belvedere の Agent を直接呼べる。§5 差別化表に「MCP で AI Agent エコシステムに統合」軸追加、§6 stack に MCP server (stdio + HTTP)、デモ #7 を「Claude Code から Belvedere を呼んで Belvedere を開発している」シーンに差し替え可能。
> 2026-06-11 改訂: **Reviewer Multimodal (録画動画→指摘抽出) を縮退** (ROADMAP 縮退 2026-06-10)。キラーシーンを **Orchestrator マルチエージェント + チケット種別ルールエンジン (17 観点) + 見積もりポーカー** に置換。「なぜ Gemini か」を **ADK で Orchestrator + 5 Agent を宣言的に編成** に統一。録画関連の記述を全削除。
> 2026-06-13 改訂: **儀式モデル確定**。チケットフローを **Backlog (US 起票) → Refinement (最小価値 Story に分割) → Planning (Task/Spike 分割で CURRENT 確定)** に整理。Backlog / Refinement / Planning は **CURRENT / NEXT / BACKLOG の 3 区画ビュー** に統一 (画面差は起票種別と目的のみ)。デモ #4 を「Refinement で 1 つの大きな Story を最小価値ストーリーに分割しつつ、行内 finding ピルで 6観点の指摘が見える」流れに調整。「ルール別ワークキュー」表現は削除。
> 2026-07-10 改訂: **Proto Pedia 提出ドラフトを新軸「スクラムの運営はAIに、開発は人間に。」(運営コストの肩代わり = 本末転倒の解消) で書き直し**。3 本柱 = (a) 反復をまたぐ記憶 (Try 意味検索 + 遵守検証) (b) ビジネス直結の意味判断 (Product Goal→Sprint Goal→Epic.rationale→Story の価値連鎖) (c) 二層設計 (決定論ピル + AI は意味判断)。全て dev 実機実証済み。ADK は「実装済・A2A 委譲可能」の表現に留める (本番稼働とは書かない)。

---

## 0. ピッチの設計指針

審査基準に1対1で対応:

1. **AIエージェントが価値の中心** → 中盤デモで「保存した瞬間にAIが品質を補完」
2. **設定した課題へのアプローチ力** → 冒頭で Jira ユーザーが頷く問いかけ
3. **ユーザビリティ** → Claude Design 由来の 5 画面 (Nuxt 3 + Vue 3 SSR) でデモ。Jira の 1 画面に対し **儀式の数だけ専用画面 = 5 画面**
4. **実用性・体験価値** → 「ふりかえり Try → 翌スプリント WIP」の繋がり
5. **実装力** → アーキ図1枚 + Cloud Run / Gemini API / ADK の実物 + 「まわす」(CI/CD + AI 継続改善)

---

## 1. オープニング (0:00 - 0:25 / 25秒)

> 「**あなたのチケット、DoDは埋まっていますか? User Storyに紐付いていますか?**」

スライド: Jira風のチケット画面、DoD空欄、SP未定、User Story紐付けなしの赤い矢印3本

> 「Jira を使っているチームの、よくある光景です。
> でも書く時に毎回考えるのは面倒で、結局抜けたまま、レビューに来て揉める。」

(共感を作る)

---

## 2. 課題提示 (0:25 - 1:00 / 35秒)

3つの症状をテンポよく:

| 症状 | 中身 |
|---|---|
| **書き忘れ** | DoD空・SP未定・US紐付けなしのチケットが溜まる |
| **形骸化** | 儀式が「時間通りやっただけ」で前進感が薄い |
| **言いっぱなし** | ふりかえりの Try、**レビュー会の指摘** が翌スプリントに繋がらない |
| **戦略の不在** | 開発者が「**何のためにこのチケットをやってるか**」を見失う (Epic に Why が書かれてない or 深く埋もれて読まれない) |

> 「= 形骸化したスクラム。**回ってるのに、進んでない**。」

---

## 3. プロダクト紹介 (1:00 - 1:30 / 30秒)

スライド: Claude Design 由来の Belvedere メイン画面 (FLOOR 00 BACKLOG / Hoshino クリーム + 暖オレンジ)

> 「**Belvedere** は、形骸化したスクラムを **AI が「チケット品質」と「儀式運営」の両面から底上げする** プロジェクト管理サービスです。」

> 「チケットを書くのは人間。AI Agent は **DoD・User Story紐付け・Story Point・valueImpact (プロダクトゴール貢献度)** の不足を補い、5つの儀式 (Planning / Daily / Refinement / Review / Retrospective) の運営を引き受けます。」

> 「Jira は 1 つの Sprint Board。Belvedere は **儀式の数だけ専用画面 (FLOOR 01-05)**。各画面で AI が儀式特有の形骸化を診断します。」

---

## 4. デモ (1:30 - 3:00 / 90秒) ← ここが命

画面録画 (or ライブ):

1. **(12秒)** 大久保さんが Web で「Slack要約Botの起動安定化」というチケットを起票 (タイトルだけ)
2. **(8秒)** 保存した瞬間、右パネルに **AI 提案** がポップアップ:
   - 🟡 DoD 候補3件 / 関連 Story 紐付け候補 / SP=5 (過去類似から)
   - 「Apply」ボタン3クリック → **Quality 100% 緑バッジ**
3. **(12秒)** Planning 画面を開く → AI Integrity パネルに Planner Agent から「議題4件・品質要修正3件・計画 68pt (velocity 実績 27pt を超過)」
4. **(14秒)** Refinement 画面 (CURRENT / NEXT / BACKLOG の 3 区画) → AI が BACKLOG の候補を **6観点で診断**し、各行に finding ピルで表示: 「WC-110 は priority=medium だが valueImpact=high (ゴール直結)、引き上げ推奨」「WC-106 は SP=13 で過大 → 最小価値ストーリー 3 つに分割候補 (parentTicketId で親 US に紐付け)」「⭐ EP-3 (デリバリー信頼化) に rationale 未設定 → 配下 3 チケットが Why を見失う形骸化サイン」 — 分割した子 Story を d&d で NEXT 区画へ移動、EP-3 はクリックで Epic.rationale 編集画面へジャンプ
5. **(20秒) ★Orchestrator マルチエージェント キラーシーン★** AI Integrity Panel が一気に埋まる →
   **Orchestrator (スクラムマスター)** が画面操作を受けて **Planner と Refinement を agent.invoke で協議に招集し統括**、各 Agent が **種別ルールエンジン (17 観点)** で査読した結果が 1 画面に集約:
   - 🔴 WC-103「デモ環境を Cloud Run に統一」は **task なのに親 Story なし** → 何の価値のための作業か追えない
   - 🔴 WC-108「Cloud Build → Deploy 分離」は **種別未設定** → 形骸化サイン
   - 🟡 WC-105 は **進行中のまま 4 日停滞** (着手時刻 startedAt 基準で検出)
   - そして **見積もりポーカー**: SP 未設定の Story で「見積もりセッション開始」→ メンバが**互いに見えない状態で投票** → 一斉開示 → 8 と 2 に割れる → **AI が「認識ズレの可能性、スコープを話し合って再投票を」と運営** (スプレッドシートも外部サイトも不要)
6. **(12秒)** ふりかえり画面 → **AI が前スプリントの Try を RAG (Firestore Vector の意味検索) で引いて評価**:「S12 の Try『AC に完了予定日を入れる』は今スプリントで守られたか?」を **sourceId 付きで講評** (= 使うほど賢くなる「まわす」)。Try は積み上げへ d&d → Firestore 永続 → 次の儀式で AI が参照 (自動チケット転記は Phase 3-A)
7. **(8秒)** Daily 画面で停滞検出が AI パネルに提示される (「WC-105 が 4 日停滞 → 林 へ確認を」/ L2 提案。投稿は人間が判断)

> 「全部、**司令塔 (Orchestrator) が単一窓口として複数 AI を協議招集して統括した結果**です。見積もりの会も AI が回します。ボタンを押したのは Apply だけ。」

---

## 5. なぜ AI エージェントである必然性 (3:00 - 3:25 / 25秒)

| 単なる機能 | Belvedereのエージェント |
|---|---|
| 「DoD空ですよ」と表示するだけ | 過去類似・US・コードを参照して **中身を生成** |
| 1機能=1ボタン | チケット品質→US候補→SP推定 を **連鎖** |
| 静的ルール | ふりかえりとチーム判断履歴から **学習** |
| ユーザー起点 | 画面操作を **トリガに必要な Agent を協議に招集して動く** |
| 1 体の AI | **Orchestrator が単一窓口として 5 つの専門 Agent を協議編成** (ADK マルチエージェント) |
| 単独 SaaS に閉じる | **MCP** で Claude Code / Cursor から呼べる ── AI Agent エコシステム統合 |

---

## 6. 実装スタック (3:25 - 3:45 / 20秒)

スライド: アーキ図 (Cloud Run × 5 / Gemini + ADK / Firestore)

- **Cloud Run**: Frontend (Nuxt 3 SSR) + Orchestrator + 5 Ceremony Agents + Tool Server を独立サービスに
- **Gemini API + ADK**: マルチエージェント (Planner / Daily / **Refinement** / Reviewer / Retrospective + **Orchestrator**)。Orchestrator が儀式エージェントを協議招集・統括 (単一窓口)、各 Ceremony Agent が Gemini で文脈理解した査読 (本番は無料枠で **gemini-2.5-flash**、有料キーで gemini-2.5-pro に切替可)。Refinement は **ADK (google-adk) エージェントに A2A で委譲**もできる (Strangler Fig)
- **チケット種別ルールエンジン**: Story / Task / Spike / Bug / Incident の 17 観点 (親なし Task / 価値の見えない DoD / 停滞 / 見積もり割れ…) を宣言的ルール表に集約、5 Agent が共有
- **Firestore**: 5 階層データモデル (Workspace > Project > Epic > Story > Task / Project毎に idPrefix) + 見積もりポーカーのセッション + Retro Try carry-forward + マルチテナント (Workspace 作成・招待・切替)
- **「まわす」= AI を継続的に改善するループ**: ふりかえりの Try が Agent の検出基準に積み上がり (`retro.tries.list`)、さらに **過去 Try を意味検索する RAG** で「前回の Try は守られたか」を AI が **sourceId 付きで参照** = 使うほどチームに賢くなる。RAG は **GCP ネイティブ Firestore Vector (Gemini 埋め込み 768 次元) で稼働、協賛 Elastic にも env 1 つで切替可** (両実装済 / 実 Gemini 埋め込み + findNearest によるヒットを dev で実証済)。プロンプト改善は **agent eval (golden) を CI で実行**して後退防止 → CI/CD (WIF 鍵レスデプロイ) で本番へ届ける
- **Cloud Build / WIF**: 個人 GitHub (KaedeAatou/belvedere) からの鍵レスデプロイ
- **MCP Server (stdio + HTTP)**: Claude Code / Cursor / 他 AI Agent クライアントから Belvedere を呼べる API。「Belvedere の開発自体を Claude Code 経由で Belvedere に管理させている」究極のドッグフード

> 「**儀式運営の必然性** から組み合わせた GCP スタックです。Orchestrator が複数 AI を編成するのは **ADK の宣言的マルチエージェント**だから。MCP で AI Agent エコシステムにも開かれている。」

---

## 7. クロージング (3:45 - 4:00 / 15秒)

スライド: タイトル「形骸化したスクラムを、AIが品質と運営で底上げする」

> 「人がチケットを書く重さを減らし、儀式の運営をAIに委ね、本当に前進するスクラムへ。」
> 「**Belvedere**。」

---

## 質疑想定

| 質問 | 答え方 |
|---|---|
| ハルシネーションの懸念は? | L0-L4 の自律性レベル設計。重要書込前は L2 で人間確認。**MCP 経由でも書込承認はホスト (Claude Code) の標準ツール承認 UI に委譲** |
| Geminiでなく他LLMでもよくない? | **Orchestrator + 5 Agent を ADK (Agent Development Kit) で宣言的に編成**できるのが Gemini エコシステムの強み。画面操作を受けて複数 AI を協議招集・統括する構成を、個別実装でなく宣言的に組める。Cloud Logging / Trace で観測統合 |
| Atlassian Intelligence との差は? | 1機能ではなく "儀式" + "チケット品質" を統合的に扱う体系。**司令塔 (Orchestrator) が複数の専門 AI を儀式ごとに編成**するのは Atlassian には無い。**MCP で外部 AI Agent から呼べるのも独自軸** |
| 個人参加で完走できる? | Boot Camp 並行、Cloud Run + Firestore で MVP / 6/7 でチーム化判断。**Belvedere の開発自体を Claude Code + MCP で Belvedere に管理させているのが究極のドッグフード** |
| コスト規模は? | 1スプリント (2週間) で $5-10 想定。Plannerが重く Dailyは軽い。Orchestrator は gemini-2.5-flash で協議招集・統括の軽量処理のみ |
| 実用は? | 自分のチームでドッグフードして、品質充足率改善を測る。MCP server もハッカソン期間中に自分が使い続けて UX を改善 |

---

## ピッチ素材 TODO

- [ ] スライドデザイン (Claude Design の世界観に合わせる: Hoshino クリーム #FCF5EF + 暖オレンジ #D95300 + Mohave 巨大英字)
- [ ] 90秒デモの録画 (5/末まで、Mock LLM ベースで OK / Cloud Run デプロイ前に1本撮影しておく)
- [x] アーキ図 (Eraser で完成済 → https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa)
- [ ] 質疑用バックアップスライド (LLMコスト / セキュリティ / 拡張性 / 個人参加遵守)

---

## 1分版 (中間提出 / 紹介動画用)

> 「Jira を使っていて、DoD空・SP未定・User Story紐付けなしのチケット、ありませんか?
> ふりかえりの Try、見積もりの認識ズレ、翌スプリントに繋がっていますか?
> **Belvedere** は、保存した瞬間に AI がチケット品質を補強し、**司令塔 (Orchestrator) が単一窓口として 5 つの専門 AI を協議編成**して形骸化を査読し、**見積もりポーカーまで AI が運営**するスクラム支援サービスです。
> 形だけ回っているスクラムから、本当に前進するスクラムへ。」

---

## Proto Pedia 提出ドラフト (2026-07-10 改訂 / コピペ用)

> 公式の評価コンセプト **「つくる・まわす・とどける」** に沿った下書き。ユーザーはこれをコピペし、動画 URL と図を貼るだけ。出典: Google Cloud 公式ブログ。
> 2026-07-10 改訂: 軸を **「スクラムの運営コストを AI に肩代わり (本末転倒の解消)」** に刷新。3 本柱 = (a) 反復をまたぐ記憶 (b) ビジネス直結の意味判断 (c) 二層設計。全て dev 実機 (実 Gemini) で実証済みの機能だけを書く。

### 必須メタ
- **作品ステータス**: 開発中 (ハッカソン提出)
- **タイトル**: Belvedere — スクラムの運営はAIに、開発は人間に。
- **タグ**: `findy_hackathon` を必ず含める (+ `Gemini` `CloudRun` `ADK` `Elasticsearch` `Scrum` 等)
- **動画 (YouTube/Vimeo URL)**: ⬜ 撮影後に貼る (90 秒デモ / 台本は本ファイル §4)
- **システムアーキテクチャ図**: ⬜ `docs/submission-diagram.md` の Eraser DSL を貼って PNG 書き出し → アップロード

### 概要 (2〜3 文)
スプリントを回すほど、儀式の準備・チケットの手入れ・ふりかえりの決めごとの追跡に時間を取られ、肝心の開発が進まない ── スクラムの「本末転倒」を解消する Jira 型 PM サービスです。スクラムマスター AI (Orchestrator) が 5 つの専門エージェントを協議に招集し、前スプリントの Try が守られているかの検証、Product Goal からチケットまでの価値のつながりの判定といった **運営コストを AI が肩代わり** します。Cloud Run + Gemini + ADK で構築し、実データ・実 Gemini での動作まで実機実証済みです。

### ストーリー① 課題と背景
スクラムを続けるほど「スクラムのための仕事」が増える。DoD 空欄・SP 未定のチケットを誰かが手入れし、ふりかえりで決めた Try は次のスプリントでは忘れられ、開発者は「このチケットは何のビジネス価値につながるのか」を Epic の奥に埋もれた Why から掘り起こせない。既存のチケット管理 SaaS は「データの倉庫」であって、この運営コストは全部人間 (特にスクラムマスター) が払っている。**プロダクトを前進させるためのスクラムが、スクラムを回すための労働になる本末転倒** ── ここを AI に肩代わりさせる。

### ストーリー② 利用ユーザー
スクラムで開発する PO / SM / Dev / EM。SM は儀式運営と決めごと追跡の疲弊を、PO は価値と優先順位の説明コストを、Dev はレビュー前の品質手入れを、EM は「うちのスクラムは健康か」の可視化を AI に肩代わりさせたい。

### ストーリー③ 特徴 ── つくる・まわす・とどける
3 本柱は全て dev 実機 (実 Gemini + 実データ) で動作を実証済み:

- **(a) 反復をまたぐ記憶** ── ふりかえりで決めた Try を Firestore Vector RAG (Gemini 埋め込み 768 次元) の意味検索で引き、**「前回の Try は今のスプリントで守られているか」を実数値で検証する**。実証例: Try「velocity を超えて計画しない」に対し、計画 68SP vs velocity 実績 27 の違反を sourceId 付きで毎回検出。人間なら議事録を掘り返す仕事が、質問 1 つで返る。
- **(b) ビジネス直結の意味判断** ── Product Goal → Sprint Goal → Epic.rationale (戦略意図) → Story の **価値の連鎖を意味レベルで判定** する。字面の一致ではなく「このチケットはゴールに寄与するか」「親 Epic の戦略意図からドリフトしていないか」を Gemini が判断し、ドリフトしたチケットを名指しで指摘する (実証済)。
- **(c) 二層設計** ── DoD 空欄・SP 未定・親 Story なし等の **決定論的に判定できる欠落はルールエンジン (17 観点) が即時ピル表示** し、AI は上記 (a)(b) のような **意味判断だけに集中** する。「AI に何でもやらせる」のではなく、確実に取れるものは決定論で取り、AI の推論は意味が問われる場面に投資する設計。

これを束ねるのが **Orchestrator (スクラムマスター AI) の単一窓口**: 画面操作を受けて Planning / Daily / Refinement / Review / Retrospective の 5 専門エージェントを `agent.invoke` で協議に招集・統括する (子には invoke を渡さず**深さ 1 を構造保証** + コストキャップ)。複数エージェント招集 (invoke×2) と、Try・Product Goal・品質診断の 3 材料を 1 つの回答に統合するところまで実機実証済み。編成は自前 TS runAgent が本体で、**Refinement は ADK (google-adk) エージェント実装済み・A2A で委譲可能** (Strangler Fig)。

- **つくる (自律的 AI エージェント)**: 上記 3 本柱 + Orchestrator 協議編成。各エージェントはチケット種別ルールエンジン (17 観点) を共有し、**見積もりポーカー**も AI が運営する。Gemini である必然性 = 複数 AI の協議編成 (ADK) と意味判断の両輪。
- **まわす (CI/CD + AI を継続的に改善)**: WIF 鍵レスの CI/CD (GitHub Actions → Cloud Build → Cloud Run) で全テストをゲートしながら本番へ (prod は **dev E2E を通過したテスト済み SHA だけを昇格**する promotion by tested SHA + 承認ゲート)。AI は柱 (a) の通り **ふりかえりの Try が次の儀式の判断材料に積み上がり、使うほどチームに最適化** (Firestore Vector RAG / Elastic にも env 1 つで切替可)。プロンプト改善は **agent eval (golden) を CI ゲート**にして後退を防ぐ (実装済)。さらに **MCP** で Claude Code / Cursor から Belvedere 自身を呼び、開発を Belvedere で管理する究極のドッグフード — 別プロジェクト (家計簿アプリ) のスクラム運営を Belvedere で 6 スプリント分回し、実操作で 36 件のバグ/UX/AI品質フィードバックを検出し 34 件 (94%) を修正・実機確認した。
- **とどける (本番品質を Cloud Run で)**: フロント (Nuxt 3 SSR) と API (Hono) を Cloud Run に、Firestore + Firebase Auth + マルチテナント (Workspace) で本番稼働。儀式ごとに専用画面 (Jira の 1 ボードに対し Backlog + 5 儀式の 6 画面) で運営コストの所在を可視化。

### 提出フォーム (Google Form) 必須 3 URL
1. 公開 GitHub: `https://github.com/KaedeAatou/belvedere`
2. デプロイ URL (公開デモ): `https://belvedere-scrum.web.app`
3. Proto Pedia 作品 URL: ⬜ 上記登録後に確定
