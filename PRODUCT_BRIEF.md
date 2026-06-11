# Belvedere — Product Brief

> 1人1分で読める版。審査基準①〜⑤ に沿って組み立てた。
> 2026-04-30: 「風 (WindEvent)」概念を廃止。
> 2026-05-03: Refinement Agent (5番目) を追加 + Project エンティティ + valueImpact (priority と独立した high/medium/low 軸) を導入。
> 2026-05-05: **MCP (Model Context Protocol) サーバ追加** — Belvedere は単独 SaaS ではなく **Claude Code / Cursor / 他 AI Agent クライアントから直接呼べる** 開発支援エージェント。Phase 0 で stdio + 11 Tools (read 6 + invoke 1 + CRUD 4) 動作確認済 (smoke test 14/14 pass)、Phase 1 で HTTP + Cloud Run + OAuth。
> 2026-06-11: **Reviewer Multimodal (録画→指摘抽出) を縮退** (2026-06-10)。代わりに **Orchestrator マルチエージェント + チケット種別ルールエンジン (17 観点) + 見積もりポーカー** を差別化の中心に。「なぜ Gemini か」は ADK で Orchestrator + 5 Agent を宣言的に編成できる点に統一。

---

## 1. 一言で

**Belvedere** は、形骸化したスクラム儀式を **AIが「チケット品質」と「儀式運営」の両面から底上げする** プロジェクト管理サービス。比喩: 螺旋階段を上った先の眺望 (Belvedere)。
チケットを書くのは **人間** (PO / SM / Dev)、AI Agent は **完了定義 (DoD)・User Story紐付け・ストーリーポイント・valueImpact** の不足を検出し提案する。
**5つのスクラム儀式** (Planning / Daily / Refinement / Review / Retrospective) では議題ドラフト・要約・粒度診断・Try転記など面倒を引き受ける。

## 2. 解く課題

> 「儀式は回っているのに、プロダクトは前進していない」 (= なんちゃってアジャイル)

Jiraを使っているチームで広く起きる症状:

- **チケットの書き忘れ**: DoDが空、SP未定、User Story紐付けなしのまま「とりあえず作っちゃった」が溜まる
- **儀式の形骸化**: デイリーが進捗報告会、レビューが社内デモ、ふりかえりが付箋大会で終わる
- **言いっぱなし**: ふりかえりで Try が出るが翌スプリントに繋がらない / 見積もりの認識ズレが放置される。Try は carry-forward 積み上げ (RetroTry) としてスプリント横断で蓄積され、儀式 AI が参照する
- **戦略の不在**: 戦略があるから開発するはずだが、開発者は **何のためにこのチケットをやっているか** を見失っている (Epic に Why が書かれていない / 書かれていても深い階層に埋もれて読まれない)
- **疲弊**: スクラムマスターが議事・要約・転記・見積もり会の段取りで週8時間消費

> Jira等のチケット管理SaaS は「データの倉庫」を提供するだけで、**書き方の品質** や **儀式の運営** までは助けてくれない。

## 3. ターゲットユーザー

| 役割 | ペイン | Belvedereが刺さる理由 |
|---|---|---|
| PO | チケットを書く時に DoD・US紐付けが面倒で抜ける | 保存時に AI が候補を提示、ワンクリックで反映 |
| SM | 儀式の運営とフォローで疲弊 | 議事・要約・WIP転記をAIに任せ、人は判断と対話に集中 |
| Dev | レビューに来るチケットの DoD が曖昧で揉める | 起票時にAIが品質チェック、レビュー前に揃う |
| EM | 「うちのスクラム健康か?」を見たい | 5儀式の健全性スコアと品質充足率を組織横断で計測 |

## 4. プロダクトの中核体験 (UVP)

「**チケットを保存した瞬間に、AIが背後で品質を補強する**」感覚。

- チケット保存 → 1秒以内に右パネルに「DoD候補3件」「US-201への紐付け」「SP=5pt」のAI提案
- ワンクリックで提案を採用、編集も可能 (L2)
- すべて埋まったチケットには **緑の「Quality 100%」バッジ**
- 儀式の30分前には議題ドラフトと品質要修正リストが Slack に届いている

## 5. なぜ "AIエージェント" である必然性 (審査基準①)

**単なる入力チェックではなく、複数ツールを組み合わせて自律的に動く**:

| 単なる機能 | Belvedere のエージェント |
|---|---|
| 「DoD空ですよ」と表示するだけ | 過去類似チケット・User Story・コードを参照して **DoDの中身を生成** |
| 1機能 = 1ボタン | チケット品質チェック → User Story候補抽出 → 過去類似タスクからSP推定 を **連鎖** |
| 静的なルール | 過去ふりかえりやチームの判断履歴から **学習** (ベクトル検索) |
| ユーザー起点 | チケット保存 / Slack投稿 / 儀式時刻 を **トリガに自分から動く** |
| 1 体の AI | **Orchestrator が儀式の時刻で 5 つの専門 Agent を編成** (ADK マルチエージェント) |
| 単独 SaaS に閉じる | **MCP** で Claude Code / Cursor / 他 AI Agent から直接呼べる ── 「Belvedere の開発自体を Belvedere で管理する」究極のドッグフードが可能 |

ADK (Agent Development Kit) で **Planner / Daily / Refinement / Reviewer / Retrospective + Orchestrator** の **5+1 マルチエージェント構成**。各儀式に専用画面 + 専用 Agent。Orchestrator が儀式の時刻 (月曜朝 = Planner+Daily、Refinement 時刻 = Refinement…) を見て各 Agent の起動順・並列度を判定する。

各 Agent の査読は **チケット種別ルールエンジン (17 観点)** を共有する。Story / Task / Spike / Bug / Incident の種別ごとに「親なし Task」「価値の見えない DoD」「停滞」「再現手順なし」「見積もり割れ」等を宣言的ルール表で判定。

特に **Refinement Agent** は次スプリント候補の **6観点診断 + 種別ルール**:
1. Story 粒度過大 (SP > 8 → 分割推奨)
2. 依存関係未整理 (parentTicketId / blockedBy 欠落)
3. valueImpact 未設定
4. priority × valueImpact ミスマッチ (例: priority=urgent ∧ valueImpact=low)
5. 同 Epic 配下の SP 見積バラつき異常
6. **戦略整合性 (Epic.rationale 欠落 / チケット ↔ rationale ドリフト)** — 開発者が「何のために?」を見失う形骸化サインを検出
7. **種別ルール** (親なし Task / DoD 手続き的 / Spike の DoD / Bug 再現手順・回帰テスト / Incident 根本対応未起票 / 見積もりポーカーの開示後の割れ)

**見積もりポーカー**: SP 未設定の Story を、メンバが**互いに見えない状態で投票 → 一斉開示 → 採用** する会を Belvedere 内で完結 (スプレッドシート / 外部ポーカーサイト不要)。AI は投票者にはならず**会の運営**に徹する (未見積もり検出 / 隠蔽管理 / 開示後の割れ検出)。

**Reviewer Agent** は Sprint Review の準備を支援: review/done チケットからデモシナリオ草稿 + Cloud Run preview URL 集 + ステークホルダ通知。

## 6. 競合・既存ツールとの差

| 既存 | 限界 | Belvedere |
|---|---|---|
| Jira / Linear / GitHub Projects | データの倉庫。品質は人任せ | 起票時に AI が DoD/US/SP を補完提案 |
| Atlassian Intelligence / Notion AI | 操作補助。1ターンの要約 | 多ターン・自律・チーム単位の文脈保持 |
| ScrumGenius / Geekbot | デイリースタンドアップBotのみ | 5儀式 + チケット品質 を1エージェント体系で扱う |
| 各種ふりかえりツール | ふりかえり**だけ** | Try が翌スプリントWIPに繋がる |

## 7. 体験価値の魅力 (審査基準④)

「**チケットを書くのが軽くなる**」「**儀式の前後で何かが片付いている**」という驚き。

例:
- 月曜朝、Slackに「今週のプランニング議題4件・品質要修正3件・計画 68pt (velocity 実績 27pt を超過)」が届く
- ふりかえり後、「上がった Try 3件のうち 2件は翌スプリントWIPに転記済 (parentTicketId付き)、1件は要確認」が共有される
- ダッシュボードに「**儀式健全性 Daily が -8 で要注意**」と表示される

## 8. 実装の核 (審査基準⑤)

```
[ユーザー操作]                [AIエージェント自律動作]
   │                           │
   │ Web画面 / Slack            ├─▶ チケット保存 イベント受信
   ▼                           ├─▶ Slack 監視
[Belvedere Orchestrator]   ──────  ├─▶ GitHub PR 監視
   │  (gemini-2.5-flash)       ├─▶ Calendar 監視 (儀式時刻)
   │                           └─▶ 障害観測 (Sentry)
   ├─▶ Planner Agent       (Sprint Planning 支援)
   ├─▶ Daily Agent         (Daily Scrum 支援)
   ├─▶ Refinement Agent    (Backlog Refinement 5観点診断)
   ├─▶ Reviewer Agent      (Sprint Review 準備)
   └─▶ Retrospective Agent (Retrospective Try 抽出)
        │
        ▼ 統一データレイヤ (Workspace > Project > Epic > UserStory > Task / Ceremony / CeremonyHealthScore)
        │  (Project ごとに idPrefix 自由設定 / 例: BV for Belvedere Core)
        │
        └─▶ Web UI (Nuxt 3 + Vue 3 SSR / Cloud Run / Claude Design)
              6 画面: Backlog (00) + Planning / Daily / Refinement / Review / Retrospective (01-05、T9 で Refinement 専用画面を新設)
```

GCPスタック (必須要件):
- **実行**: Cloud Run (各エージェントを独立サービスに)
- **AI**: Gemini API + ADK (**Orchestrator + 5 Agent の宣言的マルチエージェント構成**)
- **データ**: Firestore (5 階層データモデル + 見積もりポーカーのセッション / エージェントログ)
- **イベント**: Pub/Sub (チケット保存・儀式時刻のトリガ)
- **観測**: Cloud Logging + Cloud Trace
- **CI/CD**: Cloud Build + Cloud Deploy
- **AI Agent エコシステム連携**: MCP server (stdio + HTTP / Cloud Run) — Claude Code / Cursor から Belvedere の Agent を直接呼べる

## 9. ピッチで使うフレーズ

> **「形骸化したスクラムを、AIが品質と運営で底上げする」**
>
> ── あなたのチケット、DoD は埋まっていますか? User Story に紐付いていますか? Story Point は妥当ですか?
> ── ふりかえりで出た Try、翌スプリントに繋がっていますか?
> ── 形だけ回っているスクラムから、本当に前進するスクラムへ。

## 10. 検証可能な仮説 (Boot Camp で検証したい)

1. チケット保存時のAI提案で、DoD/US/SP の充足率が 60% → 90% に改善する
2. ふりかえりの Try 達成率が、自動転記によって体感で改善する
3. 儀式健全性スコアの可視化で、形骸化の早期警告ができる

→ 最終ピッチ (8/19) では、上記のうち1〜2つを **デモ + 数字** で語る。
