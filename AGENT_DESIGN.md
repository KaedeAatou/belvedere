# Belvedere — Agent Design

> 審査基準①「AIエージェントが価値の中心になっているか」に対する答え。
> 2026-04-30 改訂: 「風 (WindEvent)」概念を廃止。
> 2026-05-03 改訂: **Refinement Agent (5番目) を追加** + Project エンティティ + valueImpact 軸 を導入。Agent の役割を「チケット品質補助 + 5儀式運営補助」に拡張。

---

## 0. 設計の柱

1. **マルチエージェント**: 5儀式に対応する5エージェント (Refinement含む) + Orchestrator
2. **AI は脇役、人が主役**: チケット起票・最終決定は人。Agent は補助・提案 (L2)
3. **自律トリガ**: ユーザー操作だけでなく、時間 / イベント / 閾値 から起動
4. **ツール越しに世界と接続**: Slack / GitHub / Calendar / Sentry / Firestore は全部 Tool として抽象化
5. **記憶と学習**: 過去スプリントの議事・Try をベクトル検索 (RAG) でエージェントに渡す
6. **可観測性**: 全 thought / tool_call / tool_result を `AgentRun` に記録

---

## 1. エージェント体系

```
                       ┌───────────────────────┐
                       │  Orchestrator (中心ハブ)│  ← 軽量ルーティング (gemini-2.5-flash)
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
            Slack             GitHub             Calendar
           Firestore          Sentry             Cloud Run
```

---

## 2. 各エージェントの責務

### 2-0. Orchestrator (中心ハブ)

| 項目 | 内容 |
|---|---|
| 役割 | 5儀式エージェント (Planner / Daily / Refinement / Reviewer / Retrospective) の起動順・並列度を判定するルーティング |
| 起動 | Cloud Scheduler / Pub/Sub / 人間の手動操作 |
| LLM | gemini-2.5-flash (軽量) — 判定のみ |
| Tool | sub-agent invocation, ceremony scheduler |

### 2-1. Planner Agent

| 項目 | 内容 |
|---|---|
| 役割 | プランニング会議の議題ドラフト + バックログのチケット品質診断 |
| 起動 | プランニング 30分前 (Cloud Scheduler) / 手動 |
| 入力 | 現スプリント `Sprint`, バックログ `Ticket[]`, 前スプリント Try, Epic 進捗 |
| 出力 | 議題候補 / 品質要修正リスト (DoD/SP/US紐付け不足) / 候補値 |
| LLM | gemini-2.5-pro (推論重め) |
| 主な Tool | `firestore.query`, `ticket.list`, `ticket.quality.check`, `epic.list`, `slack.message.post` |
| 自律性 | L2 (提案 → 人が承認) |

### 2-2. Daily Agent

| 項目 | 内容 |
|---|---|
| 役割 | デイリースクラム運営支援。進捗・障害・血のつまり (3日停滞) 検出 |
| 起動 | 毎営業日 09:55 |
| 入力 | 現スプリントの `Ticket[]`, 各メンバの直近 Slack/GitHub 活動 |
| 出力 | 短い要約 (Slack), 障害候補, 進捗ずれ, 品質警告 |
| LLM | gemini-flash (頻度高い、短い処理) |
| 主な Tool | `slack.thread.fetch`, `github.activity`, `firestore.update`, `ticket.quality.check` |
| 自律性 | L3 (要約は自動投稿、メンションは L2) |

### 2-3. Refinement Agent (2026-05-03 追加)

| 項目 | 内容 |
|---|---|
| 役割 | Backlog Refinement 運営支援。次スプリント以降の候補 Story を **5観点で診断** |
| 起動 | Refinement 30分前 / 手動 / `topic.ticket.created` (新規 Story 起票時) |
| 入力 | 次スプリント候補 `Ticket[]` (sprintId 指定 or projectId 指定), `Workspace.productGoal`, 過去 Velocity, 同 Epic 配下の既存 Story |
| 出力 | 形骸化シグナル一覧 (5観点) + 修正提案 |
| LLM | gemini-2.5-pro |
| 主な Tool | `project.list`, `epic.list`, `ticket.list`, `backlog.refinement.check` (5観点を一括診断する専用 Tool) |
| 自律性 | L2 (提案 → 人が承認後に反映) |

**5観点診断の中身** (`packages/tools/src/index.ts:160-222` で実装):
1. **Story 粒度過大**: `estimatePt > 8` → 分割候補を提案 (例: BLV-106 SP=13 → ①Eval set拡充 / ②few-shot rubric / ③コスト計測)
2. **依存関係未整理**: `parentTicketId` (US- 紐付け) も `blockedBy` も空 → 整理を促す
3. **valueImpact 未設定**: プロダクトゴール貢献度が空 → PO に確認推奨
4. **priority × valueImpact ミスマッチ**:
   - `priority=urgent ∧ valueImpact=low` → 緊急度の根拠を再確認
   - `priority=low ∧ valueImpact=high` → 引き上げ推奨
   - `priority=medium ∧ valueImpact=high` → ゴール直結なのに優先度低の可能性
5. **SP 見積バラつき異常**: 同 Epic 配下の SP の変動係数 (CV = stddev/mean) が 0.6 超 → 再見積推奨

### 2-4. Reviewer Agent

| 項目 | 内容 |
|---|---|
| 役割 | レビュー会用デモ準備 (デモシナリオ・preview URL集) |
| 起動 | レビュー 1営業日前 |
| 入力 | 完了/レビュー中チケット, 関連 PR, デプロイ履歴 |
| 出力 | デモシナリオ草稿 / Cloud Run preview URL集 / ステークホルダ通知 |
| LLM | gemini-2.5-pro |
| 主な Tool | `cloudrun.previewUrl`, `github.pr.diff`, `slack.notify` |
| 自律性 | L2 |

### 2-5. Retrospective Agent

| 項目 | 内容 |
|---|---|
| 役割 | ふりかえり進行支援。Try抽出 + 翌スプリントWIP転記候補 |
| 起動 | ふりかえり開始時 / 終了時 |
| 入力 | 議事 (音声→Speech-to-Text), 過去 `CeremonyHealthScore`, 過去 Try の達成率 |
| 出力 | Try 一覧 + ownerId, 翌スプリント計画への WIP 転記候補, 健全性スコア更新 |
| LLM | gemini-2.5-pro + Speech-to-Text |
| 主な Tool | `speech.transcribe`, `vector.search`, `firestore.write` |
| 自律性 | L2 (Try 転記は人間確認後) |

---

## 3. Tool 一覧

| Tool 名 | 機能 | 認証 |
|---|---|---|
| `ticket.list` | チケット一覧取得 | SA |
| `ticket.quality.check` | DoD/SP/US紐付け診断 | SA |
| `backlog.refinement.check` | Refinement 5観点診断 (粒度/依存/valueImpact/ミスマッチ/SP分散) | SA |
| `sprint.get` | スプリント情報取得 | SA |
| `project.list` | Project 一覧取得 | SA |
| `epic.list` | Epic 一覧取得 (projectId 絞り込み可) | SA |
| `member.list` | チームメンバ一覧 | SA |
| `slack.message.post` | Slack 投稿 | Bot token |
| `slack.thread.fetch` | スレッド取得 | Bot token |
| `github.issues.list` | Issue 検索 | App / OAuth |
| `github.pr.diff` | PR 差分取得 | App / OAuth |
| `github.activity` | ユーザのコミット/PR活動 | App / OAuth |
| `calendar.events.list` | 儀式の予定取得 | OAuth |
| `firestore.query` | Firestore クエリ | SA |
| `firestore.write` | Firestore 書込 | SA |
| `cloudrun.previewUrl` | preview revision URL 発行 | SA |
| `speech.transcribe` | 音声 → テキスト | SA |
| `vector.search` | Vector Search クエリ | SA |
| `human.ask` | (HITL) 不確実な時に人間に投げる | Slack |

---

## 4. 自律性レベル (Run Levels)

| Level | 名前 | 説明 | 適用先 |
|---|---|---|---|
| L0 | 補助 | ユーザー操作の補助のみ | チャットUIでのQA |
| L1 | 提案 | 案を出す。実行は人間 | チケット品質提案 (DoD/SP) |
| L2 | 確認後実行 | 案を出して人間が承認したら実行 | Try のWIP転記、Slackメンション |
| L3 | 自律実行 + 通知 | 勝手に実行し、結果を通知 | デイリーBot要約、デモ環境生成 |
| L4 | 自律実行 + ロールバック可能 | 勝手にやるが取り消せる | 健全性スコア更新 |

デフォルト: **Daily=L3, Planner=L2, Refinement=L2, Reviewer=L2, Retrospective=L2** (5 ロール分)。

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

## 6. メッセージング (Pub/Sub)

トピック例:
- `topic.ticket.created` → Planner Agent が拾って品質診断
- `topic.ticket.updated` → Daily Agent が品質再評価
- `topic.ceremony.upcoming` → 該当エージェントを起動
- `topic.try.persisted` → Planner Agent が翌スプリント計画に取り込み

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

---

## 9. デモシナリオ (ピッチ用)

1. ユーザー: Web画面で「Slack要約Botの起動安定化」とタイトルだけ書いてチケット保存
2. Pub/Sub に `ticket.created` イベント
3. Planner Agent が起動 → ticket.quality.check で診断
4. AI 提案: DoD候補3件 / US-201紐付け / SP=5pt
5. UI 右パネルに提案表示、ユーザー Apply で確定
6. Quality 100% 緑バッジ表示
7. (別フロー) 月曜朝、Planner Agent が議題4件と品質要修正3件をSlackに

90秒でこの流れを見せられれば、審査基準①「AIエージェントが価値の中心」に答えたことになる。
