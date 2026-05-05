---
name: eraser-arch-sync
description: Belvedere の Eraser アーキテクチャ図 (https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa) を `ARCHITECTURE.md` の Mermaid 図と整合する形で同期更新する。儀式数・Agent 構成・GCP サービス選択・データ層に変更があった時に呼び出す
color: purple
---

# /eraser-arch-sync

Belvedere の Eraser ワークスペース上のアーキ図を `ARCHITECTURE.md` の最新内容に合わせて更新する。

## Eraser ワークスペース

- URL: https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa
- 用途: 公開ピッチ用のアーキ図 (審査員に見せる)
- フォーマット: Eraser DSL (`title:`, `[x] -> [y]`, `node {...}` など)

## 起動条件

以下のいずれかが起きたら呼ぶ:

1. **儀式数の変化** (例: 5 儀式 + Refinement Agent 追加 = 2026-05-03 のような構造変更)
2. **GCP サービス選択の変化** (Cloud Run → GKE 切替、Firestore → Spanner など)
3. **Agent 体系の変化** (Orchestrator + 5 ceremony agents 構成の変更)
4. **データ層の変化** (Project エンティティ追加 / valueImpact 軸追加など)
5. **`ARCHITECTURE.md` の §1 Mermaid 図を編集した直後**

## 起動時の動き

### Step 1. 一次情報の確認

`ARCHITECTURE.md` の §1 Mermaid 図 (graph TB ブロック) を読み、以下を抽出:
- ノード一覧 (subgraph + node)
- エッジ一覧 (`-->`, `-.->`)
- 各ノードのラベル / FLOOR 番号 / 採用技術

これが **Single Source of Truth**。

### Step 2. Eraser MCP / API 接続確認

優先順位:
1. **Eraser MCP server** (`mcp__eraser__authenticate` / `mcp__eraser__complete_authentication` がある場合)
   - 未認証なら `mcp__eraser__authenticate` を呼ぶ
2. MCP が無い / 失敗した場合は **手動同期モード**: Eraser DSL を生成してユーザーに提示し、ブラウザで手動コピペしてもらう

### Step 3. Eraser DSL 生成

`ARCHITECTURE.md` の Mermaid を Eraser のシンタックスに変換する。Eraser は `cloud-architecture` 形式が読める。

例 (Belvedere の現状を Eraser DSL に翻訳):

```eraser
title Belvedere - Cloud Run + Gemini + ADK + Firestore (5 儀式)

// User layer
User [icon: user]
Slack [icon: slack]
GitHub [icon: github]

// Edge
LoadBalancer [icon: gcp-cloud-load-balancing]
IAP [icon: gcp-identity-aware-proxy]

// Frontend
Web [icon: gcp-cloud-run, label: "apps/web (Nuxt 3 + Vue 3 SSR)"]

// Orchestrator
Orchestrator [icon: gcp-cloud-run, label: "Orchestrator (gemini-2.5-flash)"]

// 5 Ceremony Agents (FLOOR 01-05)
Planner       [icon: gcp-cloud-run, label: "Planner Agent (FLOOR 01)"]
Daily         [icon: gcp-cloud-run, label: "Daily Agent (FLOOR 02)"]
Refinement    [icon: gcp-cloud-run, label: "Refinement Agent (FLOOR 03)\n5観点診断"]
Reviewer      [icon: gcp-cloud-run, label: "Reviewer Agent (FLOOR 04)\n録画→指摘抽出 (Multimodal)"]
Retrospective [icon: gcp-cloud-run, label: "Retrospective Agent (FLOOR 05)"]

// Tool Server
ToolServer [icon: gcp-cloud-run, label: "Tool Server (Slack / GitHub / Calendar)"]

// AI Layer
Gemini [icon: gcp-vertex-ai, label: "Gemini API"]
ADK [icon: gcp-vertex-ai, label: "Agent Development Kit"]
VectorSearch [icon: gcp-vertex-ai, label: "Vector Search"]

// Data Layer
Firestore [icon: gcp-firestore]
CloudStorage [icon: gcp-cloud-storage, label: "Cloud Storage\nSprint Review 録画"]
SecretManager [icon: gcp-secret-manager]

// Async / Schedule
PubSub [icon: gcp-pubsub]
Scheduler [icon: gcp-cloud-scheduler]

// Observability
Logging [icon: gcp-cloud-logging]
Trace [icon: gcp-cloud-trace]

// Edges
User > LoadBalancer > IAP > Web > Orchestrator
Orchestrator > Planner, Daily, Refinement, Reviewer, Retrospective
{Planner, Daily, Refinement, Reviewer, Retrospective} > Gemini, ADK, ToolServer
ToolServer > Slack, GitHub
{Planner, Daily, Refinement, Reviewer, Retrospective} > Firestore, VectorSearch
Reviewer --> CloudStorage: 録画取得
Reviewer --> Gemini: Multimodal (動画+音声)
Scheduler --> Orchestrator: 儀式30分前
PubSub --> Orchestrator: review_recording.uploaded
```

### Step 4. 同期実行

#### Eraser MCP が使える場合
1. workspace ID `qDqUGUjPxoBCq8nP6bKa` の現在の DSL を取得
2. 上記の生成 DSL と比較 (構造の差分検出)
3. 差分があれば update API でアップロード
4. 完了通知

#### Eraser MCP が無い場合 (手動同期モード)
1. 生成した DSL をターミナルに表示
2. ユーザーに以下を案内:
   ```
   1. https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa を開く
   2. ダイアグラムエディタの DSL ビューに切り替え
   3. 表示された DSL を全選択 → 削除 → 上記 DSL を貼り付け
   4. 反映を確認
   ```
3. ユーザーから「貼り付けた」を確認したら完了

### Step 5. 完了後

1. `open https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa` でブラウザで開いて視覚確認
2. `HACKATHON_COMPLIANCE.md` の B-3 / B-5 セクションに「Eraser 図同期 (YYYY-MM-DD)」と1行記録 (任意)

## 注意事項

- **Eraser 図に会社情報を絶対含めない**: ノードラベルや title 等で `***company-redacted***` / `***company-account-redacted***` 等が混入しないよう、生成 DSL を grep スキャン
- **idPrefix は表記しても OK**: Belvedere Core (BV-) や他 Project の存在は図に書いてよい
- **比喩 (螺旋階段 / FLOOR) は明示的に**: ピッチ用なので「FLOOR 01-05」表記は維持。ただし「翼」「風車」「Kazaguruma」など廃止語は絶対に使わない
- 同期前に必ず `ARCHITECTURE.md` の Mermaid 図が最新であることを確認 (この skill は ARCHITECTURE.md → Eraser の一方向同期。逆同期はしない)

## トラブルシュート

| 症状 | 対処 |
|---|---|
| Eraser MCP が `authenticate` で失敗 | https://claude.ai/customize/connectors で Eraser を connect し直す |
| DSL が Eraser 側でパースエラー | アイコン名 (`gcp-cloud-run` など) が古い可能性。Eraser ドキュメントで最新のアイコン名を確認 |
| 図のレイアウトが崩れる | Eraser はレイアウト自動調整。Layout > Re-layout で修正 |
| 旧 Belvedere 表記が残っている | 即修正。会社情報・廃止語は絶対残さない |
