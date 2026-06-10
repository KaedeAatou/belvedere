# Belvedere — Pitch

> 想定: 3分ピッチ + 質疑 / スライド10枚以内 / デモ90秒
> 最終ピッチ: 2026-08-19 渋谷ストリーム
> 2026-04-30 改訂: 「形骸化したスクラムをAIが品質と運営で底上げする」軸に統一。風メタファーを廃止。
> 2026-05-03 改訂: **Refinement Agent (5番目)** 追加 + Project エンティティ + valueImpact 軸。比喩は「螺旋階段の眺望」(明示)。
> 2026-05-05 改訂: **Refinement Agent に第 6 観点「戦略整合性」追加** (Epic.rationale 欠落検出)。§2 課題に「戦略の不在 (開発者が Why を見失う)」を追加、デモ #4 で「BLV-110 ミスマッチ + EP-3 rationale 欠落」を見せる。
> 2026-05-05 (夜) 改訂: **MCP server 追加** — Claude Code / Cursor から Belvedere の Agent を直接呼べる。§5 差別化表に「MCP で AI Agent エコシステムに統合」軸追加、§6 stack に MCP server (stdio + HTTP)、デモ #7 を「Claude Code から Belvedere を呼んで Belvedere を開発している」シーンに差し替え可能。
> 2026-06-11 改訂: **Reviewer Multimodal (録画動画→指摘抽出) を縮退** (ROADMAP 縮退 2026-06-10)。キラーシーンを **Orchestrator マルチエージェント + チケット種別ルールエンジン (17 観点) + 見積もりポーカー** に置換。「なぜ Gemini か」を **ADK で Orchestrator + 5 Agent を宣言的に編成** に統一。録画関連の記述を全削除。

---

## 0. ピッチの設計指針

審査基準に1対1で対応:

1. **AIエージェントが価値の中心** → 中盤デモで「保存した瞬間にAIが品質を補完」
2. **設定した課題へのアプローチ力** → 冒頭で Jira ユーザーが頷く問いかけ
3. **ユーザビリティ** → Claude Design 由来の 5 画面 (Nuxt 3 + Vue 3 SSR) でデモ。Jira の 1 画面に対し **儀式の数だけ専用画面 = 5 画面**
4. **実用性・体験価値** → 「ふりかえり Try → 翌スプリント WIP」の繋がり
5. **実装力** → アーキ図1枚 + Cloud Run / Vertex AI / ADK の実物

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
3. **(12秒)** 月曜朝の画面に切替え → Slack に Planner Agent から「議題4件・品質要修正3件・容量24/30pt」
4. **(14秒)** Refinement 画面 → AI が次スプリント候補を **6観点で診断**: 「WC-110 は priority=medium だが valueImpact=high (ゴール直結)、引き上げ推奨」「WC-106 は SP=13 で過大、3つに分割候補」「⭐ EP-3 (デリバリー信頼化) に rationale 未設定 → 配下 3 チケットが Why を見失う形骸化サイン」 — クリックで Epic.rationale 編集画面へジャンプ
5. **(20秒) ★Orchestrator マルチエージェント キラーシーン★** AI Integrity Panel が一気に埋まる →
   **Orchestrator** が月曜朝の時刻を見て **Planner + Daily を並列起動**、各 Agent が **種別ルールエンジン (17 観点)** で査読した結果が 1 画面に集約:
   - 🔴 WC-103「デモ環境を Cloud Run に統一」は **task なのに親 Story なし** → 何の価値のための作業か追えない
   - 🔴 WC-108「Cloud Build → Deploy 分離」は **種別未設定** → 形骸化サイン
   - 🟡 WC-105 は **進行中のまま 4 日停滞** (着手時刻 startedAt 基準で検出)
   - そして **見積もりポーカー**: SP 未設定の Story で「見積もりセッション開始」→ メンバが**互いに見えない状態で投票** → 一斉開示 → 8 と 2 に割れる → **AI が「認識ズレの可能性、スコープを話し合って再投票を」と運営** (スプレッドシートも外部サイトも不要)
6. **(12秒)** ふりかえり画面 → 前スプリントの Try 3件のうち 2件が **翌スプリントWIPに自動転記済** (parentTicketIdで紐付き)
7. **(8秒)** Live Activity に「Daily Agent: 停滞警告 → 林 へ」と AI が自分で動いた履歴

> 「全部、**司令塔 (Orchestrator) が儀式の時刻に合わせて複数 AI を動かした結果**です。見積もりの会も AI が回します。ボタンを押したのは Apply だけ。」

---

## 5. なぜ AI エージェントである必然性 (3:00 - 3:25 / 25秒)

| 単なる機能 | Belvedereのエージェント |
|---|---|
| 「DoD空ですよ」と表示するだけ | 過去類似・US・コードを参照して **中身を生成** |
| 1機能=1ボタン | チケット品質→US候補→SP推定 を **連鎖** |
| 静的ルール | ふりかえりとチーム判断履歴から **学習** |
| ユーザー起点 | チケット保存・Slack・儀式時刻の **トリガで自分から動く** |
| 1 体の AI | **Orchestrator が儀式の時刻で 5 つの専門 Agent を編成** (ADK マルチエージェント) |
| 単独 SaaS に閉じる | **MCP** で Claude Code / Cursor から呼べる ── AI Agent エコシステム統合 |

---

## 6. 実装スタック (3:25 - 3:45 / 20秒)

スライド: アーキ図 (Cloud Run × 5 / Gemini + ADK / Firestore / Pub/Sub)

- **Cloud Run**: Frontend (Nuxt 3 SSR) + Orchestrator + 5 Ceremony Agents + Tool Server を独立サービスに
- **Gemini API + ADK**: マルチエージェント (Planner / Daily / **Refinement** / Reviewer / Retrospective + **Orchestrator**)。Orchestrator が gemini-2.5-flash で軽量ルーティング (儀式の時刻でどの Agent を起動するか判定)、各 Ceremony Agent が gemini-2.5-pro で文脈理解した査読
- **チケット種別ルールエンジン**: Story / Task / Spike / Bug / Incident の 17 観点 (親なし Task / 価値の見えない DoD / 停滞 / 見積もり割れ…) を宣言的ルール表に集約、5 Agent が共有
- **Firestore**: 5 階層データモデル (Workspace > Project > Epic > Story > Task / Project毎に idPrefix) + 見積もりポーカーのセッション
- **Vertex AI Vector Search + RAG Engine**: Refinement / Retrospective が過去 Try / Scrum Guide を参照
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
| Geminiでなく他LLMでもよくない? | **Orchestrator + 5 Agent を ADK (Agent Development Kit) で宣言的に編成**できるのが Gemini エコシステムの強み。儀式の時刻トリガで複数 AI を協調させる構成を、個別実装でなく宣言的に組める。Vertex AI でログ統合 |
| Atlassian Intelligence との差は? | 1機能ではなく "儀式" + "チケット品質" を統合的に扱う体系。**司令塔 (Orchestrator) が複数の専門 AI を儀式ごとに編成**するのは Atlassian には無い。**MCP で外部 AI Agent から呼べるのも独自軸** |
| 個人参加で完走できる? | Boot Camp 並行、Cloud Run + Firestore で MVP / 6/7 でチーム化判断。**Belvedere の開発自体を Claude Code + MCP で Belvedere に管理させているのが究極のドッグフード** |
| コスト規模は? | 1スプリント (2週間) で $5-10 想定。Plannerが重く Dailyは軽い。Orchestrator は gemini-2.5-flash で軽量ルーティングのみ |
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
> **Belvedere** は、保存した瞬間に AI がチケット品質を補強し、**司令塔 (Orchestrator) が儀式の時刻に合わせて 5 つの専門 AI を編成**して形骸化を査読し、**見積もりポーカーまで AI が運営**するスクラム支援サービスです。
> 形だけ回っているスクラムから、本当に前進するスクラムへ。」
