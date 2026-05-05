# Belvedere

> Scrum facilitation AI agent for **DevOps × AI Agent Hackathon 2026**
>
> 「あなたのチームのスクラムは、形だけ回っていませんか?」

---

## 何をするプロダクトか

**Belvedere** は、形骸化したスクラムを **AI が「チケット品質」と「儀式運営」の両面から底上げする** Jira型プロジェクト管理サービス。

- 人がチケットを起票する。AI Agent は **Definition of Done / Story Point / User Story 紐付け / valueImpact** の不足を検出し提案する (人が承認 / L2)
- スクラムの5儀式 (**Planning / Daily / Refinement / Review / Retrospective**) ごとに **専用画面** を持ち、儀式特有の形骸化シグナルを AI が診断する。これが Jira (Sprint Board 1画面) との差別化軸

比喩: 螺旋階段を上った先にある眺望。形だけ回るスクラムから、儀式とチケット品質を一段ずつ底上げして眺望を獲得する。

詳細: [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md)

---

## ドキュメント

| ファイル | 役割 |
|---|---|
| [PROJECT_PLAN.md](./PROJECT_PLAN.md) | 作業仕分け / 依存度マップ (Claude単独 vs ユーザー必須) |
| [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md) | 課題・ターゲット・UVP・差別化 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | アーキ案 + GCP↔AWS対応表 |
| [DATA_MODEL.md](./DATA_MODEL.md) | 型定義 / Firestore コレクション設計 |
| [AGENT_DESIGN.md](./AGENT_DESIGN.md) | マルチエージェント / ツール / 自律性レベル |
| [ROADMAP.md](./ROADMAP.md) | 4月末→8/19 のマイルストーン |
| [PITCH.md](./PITCH.md) | 3分ピッチの台本 |
| [HACKATHON_COMPLIANCE.md](./HACKATHON_COMPLIANCE.md) | ハッカソン要件↔現状の対応 |
| [docs/setup-gcp.md](./docs/setup-gcp.md) | ユーザー作業のGCPセットアップ手順 |
| [docs/setup-mcp.md](./docs/setup-mcp.md) | MCP server を Claude Code / Cursor から接続する手順 |

---

## リポジトリ構成

```
ai-agent-hackathon/
├── apps/
│   ├── web/                 # Nuxt 3 + Vue 3 SSR (UI再設計中・ガラのみ / Cloud Run 想定)
│   ├── cli/                 # Mock LLM で動く CLI デモ (5ロール)
│   ├── api/                 # Hono サーバ (Cloud Run想定 / TS)
│   ├── orchestrator-py/     # FastAPI + ADK 雛形 (Python)
│   └── mcp-server/          # MCP (Model Context Protocol) サーバ (Claude Code 接続用)
├── packages/
│   ├── shared/              # 型定義 / 定数 (Project / Epic / UserStory / Ticket / CeremonyHealthScore など)
│   ├── seed/                # 不変デモfixture (1 project, 4 epics, 12 tickets, 3 sprints, 5 members)
│   ├── repo/                # Repository抽象 (memory / firestore)
│   ├── llm/                 # LLMプロバイダ抽象 (mock / gemini / vertex)
│   ├── agent/               # Agent runtime (Tool呼び出しループ)
│   └── tools/               # Tool 実装
├── infra/
│   └── cloudbuild.yaml      # Cloud Build パイプライン
├── .github/workflows/       # CI / Cloud Run デプロイ (WIF経由)
├── docs/
│   ├── setup-gcp.md         # ユーザー作業のGCPセットアップ手順
│   └── setup-github-wif.md  # Workload Identity Federation設定
├── package.json             # pnpm workspace ルート (内部パッケージ名 @belvedere/* で統一)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## ローカル開発

### 前提

- Node.js 20.10+
- pnpm 9+ (corepack で有効化推奨)

### セットアップ

```bash
pnpm install
pnpm typecheck
```

### CLI デモ (Mock LLM, 5ロール)

```bash
pnpm demo                                                       # Plannerデモ
pnpm --filter @belvedere/cli dev plan       "Sprint 13 議題"
pnpm --filter @belvedere/cli dev daily      "本日のスタンドアップ要約"
pnpm --filter @belvedere/cli dev refinement "次スプリント候補のリファインメント診断"
pnpm --filter @belvedere/cli dev review     "デモシナリオ草稿"
pnpm --filter @belvedere/cli dev retro      "Sprint 12 のTry抽出"
```

### API サーバ (Hono / Cloud Run想定)

```bash
pnpm --filter @belvedere/api dev
# → http://localhost:8080/health, /tickets, /sprints/:id, /epics, POST /agents/:name
```

### Python Orchestrator (FastAPI + ADK 雛形)

```bash
cd apps/orchestrator-py && uv sync
uv run uvicorn orchestrator.main:app --reload --port 8081
# ADK 接続は USE_REAL_ADK=true (GCPセットアップ後)
```

### LLMプロバイダ切替

```bash
LLM_PROVIDER=mock pnpm demo            # デフォルト (現在唯一の動作版)
LLM_PROVIDER=gemini pnpm demo          # GCPセットアップ後に追加実装
LLM_PROVIDER=vertex pnpm demo          # 〃
```

---

## 進捗状況 (2026-05-04 現在 / Phase 0 完了 → Phase 1 着手目前)

### ✅ Phase 0 完了
- [x] プロダクト・アーキ・データ・エージェント設計ドキュメント (5 儀式 / Project / valueImpact 反映済)
- [x] ローカル動作の最小スキャフォールド (Mock LLM で5ロール + Orchestrator 動作)
- [x] Repository パターン (memory 実装 / Firestore は GCP 接続後)
- [x] API サーバ (Hono on Cloud Run想定) + Dockerfile + Cloud Build
- [x] Python Orchestrator (FastAPI + ADK 雛形 / 5 ロール INSTRUCTION)
- [x] GitHub Actions CI / Cloud Run デプロイ (WIF想定)
- [x] GCPセットアップ手順書 (ユーザー向け `docs/setup-gcp.md`)
- [x] Belvedere 再ブランド + Project エンティティ + Refinement Agent (5ロール目)
- [x] **Nuxt 3 + Vue 3 SSR** + Claude Design 由来 5 画面 + AI Integrity Panel
- [x] **個人 GitHub repo** (KaedeAatou/belvedere private) + 個人 Google アカウント設定
- [x] **Eraser アーキ図** (https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa) + 自動同期 hook
- [x] **週次 hackathon-check routine** (毎週月曜 09:00 JST 自動実行)
- [x] **MCP server (stdio + CRUD 本実装)** (`apps/mcp-server/`): 11 Tools (6 read + 1 invoke + 4 CRUD)、Smoke 14/14 pass、`docs/setup-mcp.md` で Claude Code から接続可能

### 🟡 Phase 1: 手動 Belvedere SaaS (期限 2026-06-09)
ゴール: Agent なしで Jira 風 SaaS が Cloud Run 上で動く。MCP も Cloud Run にホストして Claude Code から本番 Belvedere を操作。
- [ ] **次にユーザーがやること**: GCP プロジェクト作成 (5/7 の 300 ドルクーポン受領後 / `/gcp-setup` skill 経由)
- [ ] Cloud Run 初回デプロイ (5/17 までに `/health` 200)
- [ ] Firestore 実装 (`packages/repo/src/firestore.ts`)
- [ ] Firebase Auth (個人 Google) で UI / API / MCP 保護
- [ ] Web UI で チケット CRUD / Sprint 切替 / Epic 編集
- [ ] MCP server を Cloud Run へ (HTTP transport + OAuth 2.1)
- [ ] ピッチデモ動画 1 本 (5/末まで / Mock UI 範囲で)

### Phase 2: Agent トリガ可視化 Mock (6/10 〜 6/30)
- [ ] Pub/Sub + Cloud Scheduler 配線
- [ ] AI Integrity Panel が Mock 応答を即時表示
- [ ] Live Activity 履歴画面
- [ ] Slack Bot Mock (or 実 Slack 投稿)
- [ ] 応募提出 / 中間提出

### Phase 3: Agent 本実装 (7/1 〜 7/27)
- [ ] Vertex AI Gemini 接続 (`packages/llm/src/gemini.ts`)
- [ ] Python `USE_REAL_ADK=true` 実装
- [ ] **Reviewer Multimodal**: 録画 → 指摘抽出 → Ticket 起票 (ピッチキラーシーン)
- [ ] Vector Search + RAG (Refinement / Retrospective)
- [ ] CeremonyHealthScore 計算 + GitHub 連携

---

## ハッカソン情報

- 主催: ファインディ株式会社 / メインスポンサー: グーグル・クラウド・ジャパン
- 公式ページ: https://findy.notion.site/devops-ai-agent-hackathon-2026
- 最終ピッチ: 2026-08-19 渋谷ストリーム (10チーム)
- 賞金総額: 200万円
- 必須技術: Cloud Run / GKE / Cloud Functions / App Engine / TPU/GPU から1つ以上 + Gemini / Vertex AI / ADK / 各種AI APIから1つ以上

---

## ライセンス

未定 (ハッカソン期間中は private 想定)
