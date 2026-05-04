# Belvedere — Product Brief

> 1人1分で読める版。審査基準①〜⑤ に沿って組み立てた。
> 2026-04-30: 「風 (WindEvent)」概念を廃止。
> 2026-05-03: Refinement Agent (5番目) を追加 + Project エンティティ + valueImpact (priority と独立した high/medium/low 軸) を導入。

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
- **言いっぱなし**: ふりかえりで Try が出るが翌スプリントに繋がらない
- **疲弊**: スクラムマスターが議事・要約・転記で週8時間消費

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

ADK (Agent Development Kit) で **Planner / Daily / Refinement / Reviewer / Retrospective + Orchestrator** の **5+1 マルチエージェント構成**。各儀式に専用画面 + 専用 Agent。

特に **Refinement Agent** は次スプリント候補の **5観点診断**:
1. Story 粒度過大 (SP > 8 → 分割推奨)
2. 依存関係未整理 (parentTicketId / blockedBy 欠落)
3. valueImpact 未設定
4. priority × valueImpact ミスマッチ (例: priority=urgent ∧ valueImpact=low)
5. 同 Epic 配下の SP 見積バラつき異常

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
- 月曜朝、Slackに「今週のプランニング議題4件・品質要修正3件・容量24pt/30pt」が届く
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
              5 画面: Backlog (Refinement 統合) / Planning / Daily / Review / Retrospective
```

GCPスタック (必須要件):
- **実行**: Cloud Run (各エージェントを独立サービスに)
- **AI**: Gemini API + ADK (マルチエージェント構成)
- **データ**: Firestore + Cloud Storage
- **イベント**: Pub/Sub (チケット保存・儀式時刻のトリガ)
- **観測**: Cloud Logging + Cloud Trace
- **CI/CD**: Cloud Build + Cloud Deploy

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
