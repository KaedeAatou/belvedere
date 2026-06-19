# Belvedere — Agent Design

> 審査基準①「AIエージェントが価値の中心になっているか」に対する答え。
> 2026-04-30 改訂: 「風 (WindEvent)」概念を廃止。
> 2026-05-03 改訂: **Refinement Agent (5番目) を追加** + Project エンティティ + valueImpact 軸 を導入。Agent の役割を「チケット品質補助 + 5儀式運営補助」に拡張。
> 2026-05-05 改訂: **Refinement Agent の診断観点を 5 → 6 に拡張**。第 6 観点「戦略整合性 (Strategic Intent Drift)」を追加 — Epic に `rationale` / `successMetric` / `strategicTheme` を新設し、rationale 欠落の Epic を「配下チケットが Why を見失う形骸化サイン」として警告する。「戦略があるから開発するはずだが、その戦略が開発者に伝わっていない」課題への直接対応。
> 2026-06-11 改訂: **Reviewer Multimodal (録画 → 指摘抽出 / ReviewRecording / video.extractIssues) を縮退削除** (2026-06-10)。代わりに **チケット種別 (Story/Task/Spike/Bug/Incident) + ルールエンジン (17 観点) + 見積もりポーカー** を導入。Refinement に第 7 観点「種別ルール」を追加。差別化の中心は **Orchestrator マルチエージェント (ADK で 5 Agent を編成)**。
> 2026-05-05 (夜) 改訂: **MCP (Model Context Protocol) サーバ追加** — `apps/mcp-server` で Belvedere の Tool / Agent を MCP 形式で外部公開。Phase 0 で stdio mode + 11 Tools (読み取り 6 + invoke_agent + CRUD 4 全実装)、Smoke test 14/14 pass。Phase 1-D で HTTP transport + Cloud Run + Firestore + OAuth 2.1。書込承認はホスト (Claude Code) の標準ツール承認 UI に委譲する設計 (MCP server 側に dryRun ロジックを持たない)。
> 2026-06-12 改訂: RetroTry (carry-forward 積み上げ) + retro.tries.list Tool 追加。Workspace 管理 (作成/招待/切替) を Phase 1-E 前倒しで実装。
> 2026-06-13 改訂: **儀式モデル確定**。チケットライフサイクルを **Backlog (US 起票) → Refinement (最小価値 Story に分割) → Planning (Task/Spike に分割し CURRENT 確定)** の一方向フローに整理。Backlog / Refinement / Planning の 3 画面を **CURRENT SPRINT / NEXT SPRINT / BACKLOG の 3 区画ビュー (orderIndex 共有 / 区画跨ぎ d&d でスプリント移動)** に統一し、画面差は「起票できる種別」と目的のみ。Refinement の **「ルール別グループ表示 (ワークキュー)」を廃止** — 品質指摘は行内 finding ピルで見せる。Planning は 2 週間スプリント初日に CURRENT の中身 (タスク/スパイク分割・スコープ) を確定する儀式と位置づけ直し。
> 2026-06-18 改訂: **Gemini 接続フェーズに着手**。(1) 要件を「画面 × 操作 × AI 応答」で可視化する **§0.6 要件マトリクス + 具体ケース①〜⑥** を新設。(2) 設計をコード実態に補正: `gemini.ts` は **実装済** (§8 修正 / throw は `vertex` のみ)、`/api/agents/:name` は **model `gemini-2.5-pro` 固定** (§2.6 agent→model マップ新設で解消予定)、Orchestrator は **TS scheduler 実行 + ADK 編成デモのハイブリッド** (§2-0 / 論点 A)、Reviewer の `cloudrun.previewUrl` は **未実装** (§2-4 注記)。実装フェーズ Phase A〜E は別計画。
> 2026-06-18 改訂(2): **Agent 運用モデル確定**（ユーザー決定）。(a) Orchestrator を「ルーター」→ **スクラムマスター＝全ユーザー操作の単一窓口**に。どの達人 agent を呼ぶか判定し、**agent↔agent 協議**を仲介・統括する。(b) **トリガーは画面操作のみ**（Cloud Scheduler / Pub-Sub による時間・イベント自動起動は**廃止**）。(c) **自律性は L1/L2 のみ**（L3/L4 自律実行は不採用）。(d) **Slack 連携を全除去**（agent 出力は **AI パネル**、retro 議事は手動ペースト）。

---

## 0.6. 要件マトリクス — 誰が・どの画面で・どの操作で・どの AI が何を言うか

> この節を読めば「どの AI が、いつ、どの画面のどの操作で、何をチェックして何を言うか」が分かる。各 Agent の詳細責務は §2 を、検出ルールの中身は §2-3 (6観点) / §3 (Tool) と `packages/tools/src/{ticket-rules,refinement,quality}.ts` を参照。

### 検出は 2 系統 (この区別が要件の土台)

| 系統 | 実体 | 性質 | 出方 | 状態 |
|---|---|---|---|---|
| **(A) ルールエンジン** | `ticket-rules.ts` (17 ルール) + `refinement.ts` (6 観点) + `quality.ts` (DoD/SP/US) の **pure function** | 決定論的・テスト可能。データを見て確定的に finding を出す | チケット行の **行内 finding ピル (赤/黄)** / `GET /api/findings` | **実装・配線済** |
| **(B) AI Agent** | `runAgent` ループ + Gemini (現状 Mock LLM)。Tool 越しに (A) を呼び、文脈を踏まえ自然言語で診断・提案 | 文脈依存・説明的。分割案・要約・デモ台本など非定型を生成 | **右レール Integrity AI パネル** (`POST /api/agents/:name`) | チャットは配線済 / 画面ボタン自動トリガーは未配線 |

> **Try は第 3 の横串**: 過去スプリントの改善 Try (例「AC に期日を入れる」) は **バックログに積まず**、全 Agent が起動時に `retro.tries.list` で読み込み「検出ルール」として各儀式に動的適用する (§2-5 / ケース⑤)。定型 Try は将来 (A) の pure fn に昇格、非定型は (B) の LLM 判断 (論点 B)。

### 画面 × 操作 × AI 応答 マトリクス

| Agent | 担当画面 | 主なユーザー操作 (トリガー) | 反応する系統 | AI 出力の型 | 自律性 |
|---|---|---|---|---|---|
| **Planner** | Planning (Floor 01) | BACKLOG→CURRENT へ d&d で詰める / 「スプリントを開始」/ AI パネルで質問 | (A) `SPRINT_OVER_VELOCITY`・`STORY_DOD_MISSING` 等 + (B) 議題・分割提案 | 議題候補 / Task・Spike 分割候補 / 計画ΣSP vs velocity 超過アラート / 品質要修正リスト | L2 |
| **Daily** | Daily (Floor 02) | Daily 画面を開く / カンバン列間 d&d で status 変更 / AI パネルで質問 | (A) `TASK_STALL`(2日)・`STORY_STALL`(3日)・`SPIKE_TIMEBOX_OVER`・`INCIDENT_ACTIVE` + (B) 要約 | 進捗 digest (AI パネル) / 停滞=「血のつまり」警告 / メンション候補 | L2 |
| **Refinement** | Refinement (Floor 03) | NEXT/BACKLOG に Story を d&d / 「ポーカー開始」/ AI パネルで質問 | (A) 6 観点 + 種別ルール (`STORY_SP_MISSING` 等) + (B) 分割案・戦略整合判定 | 最小価値ストーリー分割候補 / 6 観点 finding / 形骸化シグナル | L2 |
| **Reviewer** | Review (Floor 04) | 「デモ台本を生成」/ done・review チケット確認 / Carry-over d&d | (A) `BUG_NO_REGRESSION_DOD` + (B) デモシナリオ生成 | デモ順 + preview URL 集 / ステークホルダ通知文 / 受け入れ条件未充足リスク | L2 |
| **Retrospective** | Retro (Floor 05) | Try ノートを「積み上げ」へ d&d / KPT 記入 / AI パネルで質問 | (B) Try 抽出・分類 + CeremonyHealthScore 推移 | Try 一覧 + owner / 儀式健全性スコア / 翌スプリント転記候補 | L2 |
| **Orchestrator** | (専用画面なし / 裏方) | 全画面操作の**単一窓口** | — (どの達人を呼ぶか判定 + 協議統括) | 呼ぶ agent 名 + 順序 + 並列度 + 協議の取り回し | — |

### 具体ケース①〜⑥ (アジャイル 1 スプリントの流れ)

> ID は seed fixture の範囲 (EP-1..4 / US-101..US-402 / WC-101..112) に沿った**説明用の例**。

**ケース① Refinement — Story 品質を 6 観点で指摘**
PO が来週分の Story `US-210「ダッシュボードで売上を見たい」(SP=13)` を NEXT 区画へ d&d。
- (A) 行内ピル: 🔴 `STORY_SP_MISSING`→「ポーカー開始」ボタン出現 / 🟡 粒度過大 (SP13>8) / 🟡 valueImpact 未設定。
- (B) AI パネルで「この候補を診断して」→ 「US-210 は SP13 で過大。『売上サマリ表示』と『期間フィルタ』へ分割し親 US に紐付けを提案。配下 **EP-3 に rationale (戦略意図) が空** = 形骸化サインです」。
- 6 観点 = 粒度過大 / 依存未整理 / valueImpact 欠落 / priority×valueImpact ミスマッチ / SP 分散異常 / **Epic.rationale 欠落 (戦略整合)**。

**ケース② Planning — 過剰計画を velocity で止める**
スプリント初日、BACKLOG→CURRENT へチケットを d&d で積み増し。
- (A) 🔴 `SPRINT_OVER_VELOCITY`「計画 68pt / 平均 velocity 27pt → 過剰計画。低 valueImpact の Story を次へ」。
- (B) Planner「計画 SP が velocity 実績の 2.5 倍。完了見込みが低い。US-210 を 3 タスクに分割。DoD 未設定が 3 件 (WC-105 等)」。
- ※ 計画は **velocity 基準**。時間稼働ベースの「容量/capacity」は使わない (プロジェクト規約)。

**ケース③ Daily — 「血のつまり」(停滞) 検出**
スプリント中盤、**ユーザーが Daily 画面を開く**（＝起動。スケジュールはない）。
- (A) 🟡 `TASK_STALL`(2日) / 🔴 `STORY_STALL`(3日) / `SPIKE_TIMEBOX_OVER` / `INCIDENT_ACTIVE`。
- (B) **AI パネル**「本日の進捗: 残 42SP、in-progress 5 件。WC-106 が 3 日進捗なし、担当へブロッカー確認を推奨」（提案のみ＝L2 / **Slack へは出さない**）。Try 適用「Try『BLOCKED 時は理由記入』に対し WC-108 が理由なし」。

**ケース④ Review — デモ台本と preview URL (会前準備)**
**Review 画面で「デモ台本を生成」を押下**。
- (B) Reviewer「デモ順: ① US-201 (売上表示) → preview `https://…run.app` ② US-205…。受け入れ条件未充足 1 件 (WC-110)。ステークホルダ通知文を草稿（AI パネルに表示・Slack 送信しない）」。
- ※ 録画→指摘抽出 (Multimodal) は 2026-06-10 縮退削除。Reviewer は会**前**準備に専念。`cloudrun.previewUrl` Tool は未実装 (§2-4)。

**ケース⑤ Retro — Try を「次スプリントの検出ルール」化 (横串の肝)**
スプリント末、Try ノートを「積み上げ」へ d&d で昇格 → `RetroTry` 化。
- (B) Retrospective「Try 3 件抽出: 『AC に期日を入れる』(owner: PO) 等。**Daily の儀式健全性 -8%**。前回 Try『再現手順を必ず書く』達成率 70%」。
- 積み上げた Try は次スプリントで Planner/Daily/Refinement が `retro.tries.list` 経由で**検出ルールとして自動適用** (ケース①③に還流)。

**ケース⑥ Orchestrator — 単一窓口としての裁定 (裏方)**
ユーザーが画面を操作するたびに、Orchestrator(flash) が**窓口**として受け、「どの達人を呼ぶか・どの順で・並列か」を判定し、必要なら**達人同士の協議を仲介**する（例: Refinement の分割案を Planner に velocity 照会）。専用画面なし。実行は TS 実行ランナーが `/api/agents/:name` を順次/並列起動 (§2-0 / 論点 A)。**スケジュールによる自動起動はしない**。

---

## 0. 設計の柱

1. **マルチエージェント**: 5儀式に対応する5エージェント (Refinement含む) + Orchestrator
2. **AI は脇役、人が主役**: チケット起票・最終決定は人。Agent は補助・提案 (L2)
3. **画面操作トリガ**: ユーザーが該当儀式画面を操作した時に同期起動する（時間 / イベント / スケジュール起動は持たない）
4. **ツール越しに世界と接続**: GitHub / Calendar / Sentry / Firestore は全部 Tool として抽象化（Slack は不採用 / §6）
5. **記憶と学習**: 過去スプリントの議事・Try をベクトル検索 (RAG) でエージェントに渡す
6. **可観測性**: 全 thought / tool_call / tool_result を `AgentRun` に記録

---

## 0.5. 儀式モデル / チケットライフサイクル (2026-06-13 確定)

エージェントが「どの儀式で・何を補助するか」は、下記のスプリント運用とチケットフローに固定する。

### スプリント運用 (2 週間スプリント)

```
(Retro で前スプリントを締める = velocity 確定 + 次スプリント active 化)
  → スプリント初日に Planning: CURRENT スプリントの中身を確定
     (ストーリーをタスク/スパイクに分割、どこまでやるか決定)
  → 日々 Daily → 週 1 Refinement → 2 週目末に Review → Retro → 次スプリントへ
```

- スプリントを締めるのは **Retrospective** (velocity 確定 + 次スプリントを active 化)。
- **Planning** はスプリント初日に CURRENT の中身 (Task/Spike 分割・スコープ決定) を固める儀式。
- **Refinement** は週 1 回、BACKLOG を最小価値ストーリーへ分割する整理の儀式 (将来分の仕込み)。

### チケットライフサイクル (一方向フロー)

```
Backlog でユーザーストーリー起票
  → Refinement で最小価値ストーリーに分割
  → Planning でタスク/スパイクに分割 (parentTicketId で親ストーリーに紐付け)
```

### 3 区画ビュー (Backlog / Refinement / Planning 共通)

- 3 画面とも **CURRENT SPRINT / NEXT SPRINT / BACKLOG** の 3 セクションを表示する。
- 並び順 (`orderIndex`) は全画面で共有する。
- 区画を跨ぐ d&d でスプリント移動 (BACKLOG → CURRENT / NEXT)。
- **Refinement の「ルール別グループ表示 (ワークキュー)」は廃止** — 品質指摘は行内 finding ピル (種別ルール + 6観点) で見せる。
- 画面の違いは「起票できる種別」と目的だけ:

| 画面 | 起票できる種別 | 目的 |
|---|---|---|
| Backlog | story + incident/bug | US の受付。誰が / なぜ / 何を の 3 入力欄で起票 |
| Refinement | story (親 US から分割) + incident/bug | 最小価値ストーリーへの分割 |
| Planning | task / spike (ストーリーから分割) + incident/bug | CURRENT の確定 (タスク化・スコープ決定) |

> incident / bug は全画面で起票可能。

---

## 1. エージェント体系

```
                       ┌───────────────────────┐
                       │  Orchestrator (中心ハブ)│  ← スクラムマスター / 単一窓口 / 協議統括 (gemini-2.5-flash)
                       └───────────┬───────────┘
                                   │
        ┌────────────┬─────────────┼─────────────┬─────────────┐
        ▼            ▼             ▼             ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌─────────┐ ┌─────────────┐
  │ Planner  │ │  Daily   │ │ Refinement  │ │Reviewer │ │Retrospective│
  │ (FLOOR01)│ │ (FLOOR02)│ │ (FLOOR03)   │ │(FLOOR04)│ │ (FLOOR05)   │
  └──────────┘ └──────────┘ └─────────────┘ └─────────┘ └─────────────┘
        ▲            ▲             ▲             ▲             ▲
        │            │             │             │             │
        └────────────┴────────── Tool Server ────┴─────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
            GitHub            Calendar
           Firestore          Sentry             Cloud Run
```

---

## 2. 各エージェントの責務

### 2-0. Orchestrator (中心ハブ)

| 項目 | 内容 |
|---|---|
| 役割 | **スクラムマスター**。全ユーザー操作の**単一窓口**。画面操作を受けて (a) どの達人 agent (Planner / Daily / Refinement / Reviewer / Retrospective) を呼ぶか判定し、(b) **達人同士の協議 (agent↔agent の相互呼び出し)** を仲介・統括する |
| 起動 | **ユーザーの画面操作のみ**（時間・イベント・スケジュール起動は持たない）|
| LLM | gemini-2.5-flash (軽量) — 判断・取り回しのみ。深い推論は各達人(pro)が担う (§2.6 agent→model マップ) |
| Tool | sub-agent invocation（子 agent 呼び出し + 協議の仲介）|
| 実行方式 (2026-06-18 確定 / 論点 A) | **ハイブリッド**。トリガーは**画面操作のみ**（スケジューラは使わない）。ユーザーの操作を受けて **TS 実行ランナー** が Orchestrator(flash) の判定どおりに `POST /api/agents/:name` を順次/並列に起動し、**達人間の協議（agent↔agent 呼び出し）を中継**する (tool 実体が TS 側 `packages/tools` にあるため確実)。ピッチ差別化用に **Python ADK** (`apps/orchestrator-py`) で「Orchestrator が 5 子 agent を宣言的に編成」する最小デモを 1 本成立させ、PITCH §5「Gemini である必然性 = ADK 編成」を満たす。**ADK への全乗せ替えはしない** (回帰リスク大 / 単一 agent ループは TS runAgent で足りる)。`USE_REAL_ADK=false` の間はスタブ、デモ経路のみ `true` で実体化 |

### 2-1. Planner Agent

| 項目 | 内容 |
|---|---|
| 役割 | スプリント初日のプランニング支援。CURRENT スプリントの中身を確定する補助 — Story → Task/Spike 分割の提案 (parentTicketId で親 Story に紐付け)、計画 ΣSP vs velocity 実績の超過診断、議題ドラフト、Task のチケット品質診断 |
| 起動 | Planning 画面を操作した時（Pull from backlog / Story 分割 / スプリント開始 / AI パネル質問）|
| 入力 | CURRENT `Sprint`, CURRENT/NEXT/BACKLOG の `Ticket[]`, RetroTry 積み上げ (retro.tries.list), Epic 進捗, velocity 実績 |
| 出力 | 議題候補 / Task・Spike 分割候補 / 品質要修正リスト (DoD/SP/親 Story 紐付け不足) / 計画 ΣSP vs velocity 超過アラート / 候補値 |
| LLM | gemini-2.5-pro (推論重め) |
| 主な Tool | `firestore.query`, `ticket.list`, `ticket.quality.check`, `epic.list` |
| 自律性 | L2 (提案 → 人が承認) |

### 2-2. Daily Agent

| 項目 | 内容 |
|---|---|
| 役割 | デイリースクラム運営支援。進捗・障害・血のつまり (3日停滞) 検出 |
| 起動 | Daily 画面を操作した時（カンバン d&d / AI パネル質問）|
| 入力 | 現スプリントの `Ticket[]` (+ Phase 3 で各メンバの GitHub commit/PR 活動を追加予定) |
| 出力 | 短い要約 (AI パネル), 障害候補, 進捗ずれ, 品質警告 |
| LLM | gemini-flash (頻度高い、短い処理) |
| 主な Tool | `firestore.update`, `ticket.quality.check`, `github.activity` (Phase 3) |
| 自律性 | L2 (提案 → 人が承認。Slack 自動投稿はしない) |

### 2-3. Refinement Agent (2026-05-03 追加 / 2026-05-05 第6観点追加)

| 項目 | 内容 |
|---|---|
| 役割 | 週 1 回の Backlog Refinement 運営支援。BACKLOG / NEXT の候補 US を **最小価値ストーリーに分割** する補助が主役務。分割した子 Story は親 US に `parentTicketId` で紐付ける。品質面はルールエンジン (17 ルール / 6観点) を **AI 診断のバックエンド**として呼び、結果は画面上の行内 finding ピル (赤/黄) で見せる (ルール別グループ表示は廃止 → §0.5) |
| 起動 | Refinement 画面を操作した時（Story d&d / 分割 / ポーカー開始 / AI パネル質問）|
| 入力 | NEXT/BACKLOG 区画の候補 `Ticket[]` (sprintId 指定 or projectId 指定), `Workspace.productGoal`, 過去 Velocity, 同 Epic 配下の既存 Story, **`Epic.rationale` / `successMetric`** |
| 出力 | 最小価値ストーリーへの分割候補 + 形骸化シグナル一覧 (6観点 / 行内 finding ピルとして UI 表示) + 修正提案 |
| LLM | gemini-2.5-pro |
| 主な Tool | `project.list`, `epic.list`, `ticket.list`, `backlog.refinement.check` (6観点を一括診断する専用 Tool) |
| 自律性 | L2 (提案 → 人が承認後に反映) |

**6観点診断の中身** (`packages/tools/src/index.ts` の `backlogRefinementCheckTool` で実装。種別ルール (第7観点) は `packages/tools/src/ticket-rules.ts` の 17 ルールと合成):
1. **Story 粒度過大**: `estimatePt > 8` → 分割候補を提案 (例: WC-106 SP=13 → ①Eval set拡充 / ②few-shot rubric / ③コスト計測)
2. **依存関係未整理**: `parentTicketId` (US- 紐付け) も `blockedBy` も空 → 整理を促す
3. **valueImpact 未設定**: プロダクトゴール貢献度が空 → PO に確認推奨
4. **priority × valueImpact ミスマッチ**:
   - `priority=urgent ∧ valueImpact=low` → 緊急度の根拠を再確認
   - `priority=low ∧ valueImpact=high` → 引き上げ推奨
   - `priority=medium ∧ valueImpact=high` → ゴール直結なのに優先度低の可能性
5. **SP 見積バラつき異常**: 同 Epic 配下の SP の変動係数 (CV = stddev/mean) が 0.6 超 → 再見積推奨
6. **戦略整合性 (Strategic Intent Drift) ⭐NEW**:
   - `Epic.rationale` (戦略意図 / Why) が空のものを警告 → 配下チケットが「何のために?」を見失う形骸化サイン
   - rationale が存在する場合、各チケットの内容が rationale と整合しているかを判定 (本物 Gemini 接続後に prompt 駆動で実装)
   - **解く課題**: 「戦略があるから開発するはずだが、その戦略が開発者に伝わっていない」現象 (チケット → Epic 階層を 1 クリックで遡って Why が見える状態を作る)

### 2-4. Reviewer Agent

| 項目 | 内容 |
|---|---|
| 役割 | レビュー会用デモ準備 (デモシナリオ / preview URL 集 / ステークホルダ通知) — レビュー会 *前* |
| 起動 | Review 画面を操作した時（デモ台本生成 / carry-over 整理 / AI パネル質問）|
| 入力 | 完了/レビュー中チケット, デプロイ履歴 (+ Phase 3 で関連 PR 差分を追加予定), 参加メンバ一覧, Sprint Goal |
| 出力 | デモシナリオ草稿 / Cloud Run preview URL集 / ステークホルダ通知文の草稿（AI パネル表示・Slack 送信しない）|
| LLM | gemini-2.5-pro |
| 主な Tool | `cloudrun.previewUrl` (⚠️ **buildTools に未実装** / Phase B で本実装), `github.pr.diff` (Phase 3) |
| 自律性 | L2 (デモシナリオは人間確認後に確定) |

> 2026-06-10 縮退: Sprint Review 録画 → 指摘抽出 (Multimodal) 機能は削除。差別化の中心は
> **Orchestrator マルチエージェント (ADK で 5 Agent を単一窓口として協議編成) + チケット種別ルールエンジン
> (17 観点) + 見積もりポーカー** に置換。「他 LLM でなく Gemini である必然性」は ADK で
> Orchestrator + 5 Agent を宣言的に編成できる点で回答する (PITCH §5 / 質疑参照)。

### 2-5. Retrospective Agent

| 項目 | 内容 |
|---|---|
| 役割 | ふりかえり進行支援。Try抽出 + 翌スプリントWIP転記候補。**スプリントを締める儀式** (velocity 確定 + 次スプリントを active 化 = §0.5 の運用) の進行も支える |
| 起動 | Retro 画面を操作した時（Try 積み上げ d&d / KPT 記入 / AI パネル質問）|
| 入力 | 議事テキスト (手動ペースト), 過去 `CeremonyHealthScore`, 過去 Try の達成率 |
| 出力 | Try 一覧 + ownerId, 翌スプリント計画への WIP 転記候補, 健全性スコア更新。carry-forward 積み上げ (RetroTry / Firestore 永続) への蓄積は人間の d&d 操作 (L2 原則) |
| LLM | gemini-2.5-pro |
| 主な Tool | `retro.tries.list`, `vector.search`, `firestore.write` |
| 自律性 | L2 (Try 転記は人間確認後) |

> (prompt への参照誘導は Phase 3-A の Gemini 接続時に実装)

---

## 2.6. agent → model マップ (2026-06-18 確定 / 論点 D)

agent ごとに使う Gemini model を **1 箇所に集約**する。現状 `apps/api/src/app.ts` が全 agent を `gemini-2.5-pro` でハードコードしている (`POST /api/agents/:name`) が、これを除去し、下記マップを `packages/agent` (または `packages/shared`) に置いて `apps/api` / `apps/orchestrator-py` 双方が参照する (二重定義・drift 防止)。

| Agent | model | 理由 |
|---|---|---|
| Orchestrator | `gemini-2.5-flash` | 協議招集・統括の軽量処理 |
| Planner / Refinement / Reviewer / Retrospective | `gemini-2.5-pro` | 分割・診断・生成の推論が重い |
| Daily | `gemini-2.5-flash` | 高頻度・短い要約処理 |

> Gemini Provider 自体は実装済 (§8)。本マップ導入は Phase A の作業。

## 2.7. 設計判断ログ (2026-06-18 / 実装着手前に確定)

実装フェーズで手戻りを防ぐため、分岐を先に固定する。詳細な背景は実装計画を参照。

| 論点 | 確定 |
|---|---|
| **A. Orchestrator を TS か ADK か** | **ハイブリッド** (§2-0 参照)。TS 実行ランナー（画面操作トリガ）+ ADK 編成デモ 1 本 |
| **B. Try のルール化** | **二層**。定型 Try (「AC に期日」「BLOCKED 理由必須」) は `ticket-rules.ts` の pure fn に昇格 (確定的・テスト可能) / 非定型 Try は LLM 判断。新規は LLM → 定着で pure fn 昇格 |
| **C. 画面トリガー** | **全 agent は画面操作で同期起動**（チャットと同じ `/api/agents/:name` 即応答、出力は AI パネル）。**スケジュール / Pub-Sub による自動起動・自動 Slack は持たない**（2026-06-18 改訂(2)）|
| **D. agent 別 model** | §2.6 のマップに集約。`app.ts` のハードコード除去 |
| **E. prompt 二重管理** (`prompts.ts` ↔ `agents.py`) | 当面は二重管理 + `agent-prompt-sync` skill 監視を維持。ADK が Python を本当に使う段階で「TS を正・Python を生成物」へ寄せる |

---

## 3. Tool 一覧

| Tool 名 | 機能 | 認証 |
|---|---|---|
| `ticket.list` | チケット一覧取得 | SA |
| `ticket.quality.check` | DoD/SP/US紐付け診断 | SA |
| `backlog.refinement.check` | Refinement 6観点診断 (粒度/依存/valueImpact/ミスマッチ/SP分散/戦略整合性) | SA |
| `sprint.get` | スプリント情報取得 | SA |
| `project.list` | Project 一覧取得 | SA |
| `epic.list` | Epic 一覧取得 (projectId 絞り込み可) | SA |
| `member.list` | チームメンバ一覧 | SA |
| `github.pr.diff` | PR 差分取得 (Reviewer Agent / Phase 3 実装予定) | App / OAuth |
| `github.activity` | ユーザのコミット/PR活動 (Daily Agent / Phase 3 実装予定) | App / OAuth |
| `calendar.events.list` | 儀式の予定取得 | OAuth |
| `firestore.query` | Firestore クエリ | SA |
| `firestore.write` | Firestore 書込 | SA |
| `cloudrun.previewUrl` | preview revision URL 発行 | SA |
| `ticket.rules.check` | チケット種別ルール (17 観点) を儀式単位で実行 | SA |
| `retro.tries.list` | レトロ carry-forward 積み上げ一覧 (儀式 Agent のコンテキスト) | SA |
| `vector.search` | Vector Search クエリ | SA |
| `human.ask` | (HITL) 不確実な時に人間に投げる | AI パネル |

---

## 4. 自律性レベル (Run Levels)

| Level | 名前 | 説明 | 適用先 |
|---|---|---|---|
| L0 | 補助 | ユーザー操作の補助のみ | チャットUIでのQA |
| L1 | 提案 | 案を出す。実行は人間 | チケット品質提案 (DoD/SP) |
| L2 | 確認後実行 | 案を出して人間が承認したら実行 | Try の WIP 転記、AI パネルでのメンション提案 |
| L3 | 自律実行 + 通知 | 勝手に実行し、結果を通知 | **不採用**（スケジュール起動を持たないため）|
| L4 | 自律実行 + ロールバック可能 | 勝手にやるが取り消せる | **不採用** |

デフォルト: **全 5 ロール L2**（提案 → 人が承認/適用）。**L3/L4（人が居ない自律実行・自動通知）は不採用** — スケジュール起動を持たず、全 agent はユーザーが画面を操作した時に同期で動き、人が見ている前で提案するため。

> 2026-06-18 改訂(2): スケジュール起動を廃止したため **L3/L4 は不採用**。全 agent は **L1/L2**（画面操作で同期起動 → 提案 → 人が承認/適用）、出力は AI パネル。**Slack 等への自動通知はしない**。コスト上限は §7。

---

## 5. プロンプト構造 (共通テンプレート)

```
SYSTEM:
You are the {agent_name} of Belvedere, a Scrum facilitation system.
Your responsibility: {responsibility}.

Available tools: {tool_list}

Rules:
- Always cite source IDs (EP-xxx for epics, US-xxx for user stories, WC-xxx for tasks).
- If unsure, call `human.ask` with a one-sentence question. Do NOT guess.
- Output language: Japanese.
- Ticket creation is done by humans. Agents only suggest (L2 confirmation required for writes).
- When updating Firestore, always include `updatedAt` and `createdBy`.

USER:
{trigger_event}

CONTEXT:
- Sprint: {sprint_summary}
- Active Epics: {epic_digest}
- Backlog quality: {quality_summary}
- Carried-over Tries: {tries}

TASK:
{task_specific_instruction}
```

詳細な書き方は `docs/PROMPTING_GUIDE.md` 参照。

---

## 6. メッセージング (Pub/Sub) — 2026-06-18 改訂(2) で不採用

**スケジュール / イベントによる自動起動は採用しない**。全 agent は**ユーザーの画面操作で同期起動**する（§2.7 論点 C / §0 柱 3）。Pub/Sub による `topic.ceremony.upcoming` / `topic.ticket.created` 等の自動トリガーは設計から外した。チケット起票・更新時の品質診断は、ユーザーが Backlog / Refinement 画面を見た時に**行内 finding ピル（ルールエンジン）として即時表示**される（AI 呼び出し不要）。

---

## 7. 失敗・回復

- 各 `AgentRun` は冪等にする (同じ input なら同じ output)
- 失敗時は `error` フィールドに詳細、リトライは Pub/Sub の dead-letter
- LLM のハルシネーション対策: 重要な書込前に `tool_call.dry_run = true` で人間確認 (L2)
- コスト爆発対策: `AgentRun.llmUsage.costUsd` で workspace 単位のキャップ

---

## 8. ローカル開発

`packages/llm/` に provider abstraction:

```ts
type LLMProvider = {
  generate(req: LLMRequest): Promise<LLMResponse>;
};

// 切替: env LLM_PROVIDER=mock|gemini|vertex
```

mock provider は spec通りの構造化レスポンスを返す。これで GCP なしでも全フローが流せる。

**実装状況 (2026-06-18 補正)**: `gemini` provider は **実装済** (`packages/llm/src/gemini.ts`)。REST (`generateContent`) を直叩きし、system→systemInstruction / assistant.toolCalls→functionCall / tool→functionResponse / responseSchema / usageMetadata→costUsd まで全マッピング。**throw するのは `vertex` のみ** (採用見送り)。`runAgent` は LLMProvider 抽象にしか依存しないため、**`LLM_PROVIDER=gemini` への切替だけで Mock→Gemini が成立する**設計 (残作業は API キー注入 / agent別model解決 §2.6 / 疎通検証 / tool name のドット問題確認)。デフォルトは `mock` のままで、CI・CLI demo・テストは Mock で緑を保つ。

---

## 9. デモシナリオ (ピッチ用)

1. ユーザー: Refinement 画面で Story `US-210「ダッシュボードで売上を見たい」` をタイトルだけ書いて起票 → 行に 🔴`STORY_SP_MISSING` / 🟡 粒度過大 のピルが即時表示（ルールエンジン＝AI 不要）
2. AI パネルで「この候補を診断して」を送信 → **Orchestrator(単一窓口) が Refinement を呼ぶ**
3. Refinement が分割案を出す前に **Planner へ velocity 照会（協議）** → 「今は過剰計画なので NEXT へ」
4. AI 提案（パネル）: 「『売上サマリ(5pt)』『期間フィルタ(8pt)』へ分割し親 US に紐付け。NEXT 推奨。EP-3 の戦略意図が空＝形骸化サイン」
5. ユーザーが Apply で分割を確定 → Quality ピルが解消（人が最終決定＝L2）
6. Planning 画面へ移動し「スプリントを開始」 → 計画 ΣSP vs velocity を Planner が点検

90秒でこの流れ（**画面操作 → 単一窓口 → 達人の協議 → パネル提案 → 人が確定**）を見せられれば、審査基準①「AIエージェントが価値の中心」に答えたことになる。
