# Belvedere

> **Scrum facilitation AI agent** — DevOps × AI Agent Hackathon 2026
>
> 形だけ回るスクラムを **AI が「チケット品質」と「儀式運営」の両面から底上げする** Jira 型 PM サービス。
> 比喩: 螺旋階段を上った先の眺望。

[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-deployed-2E7D32)](https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-WIF%20%E9%8D%B5%E3%83%AC%E3%82%B9-blue)](./.github/workflows/deploy-api.yml)
[![Hackathon](https://img.shields.io/badge/Hackathon-DevOps%20%C3%97%20AI%20Agent%202026-FF6B35)](https://findy.notion.site/devops-ai-agent-hackathon-2026)

---

## 動いているもの (今すぐ触れる)

> **DevOps × AI Agent Hackathon 2026 応募作品** — 7/10 提出予定 / 8/19 最終ピッチ (渋谷ストリーム)
> 公開 URL は審査用デモ環境。Firestore に seed の 12 チケット + 4 Epic + 5 メンバが投入済で、API から実データが返ってきます。

| 種類 | URL / 場所 |
|---|---|
| 🟢 **Web (Nuxt 3 SSR)** — 5 儀式 UI が見える | [https://belvedere-web-dev-cpszmcqmuq-an.a.run.app/](https://belvedere-web-dev-cpszmcqmuq-an.a.run.app/) |
| 🟢 **API /health** (Firestore 接続状態) | [https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health](https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health) |
| 🟢 **API /epics** (Firestore 実データ) | [https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/epics](https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/epics) |
| 🟢 **API /tickets** (seed の 12 チケット) | [https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/tickets](https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/tickets) |
| 🟢 **アーキテクチャ図** (Eraser) | [https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa](https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa) |
| 🟢 **GitHub Actions (鍵レス WIF deploy)** | [`deploy-api.yml`](./.github/workflows/deploy-api.yml) / [`deploy-web.yml`](./.github/workflows/deploy-web.yml) |

```bash
curl https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health
# {"status":"ok","llm":"mock","repo":"firestore"}

# Firestore から本物データが返ってくる (Phase 1-B 完了 / 2026-06-09):
curl https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/epics | jq '. | length'
# 4
```

---

## アーキテクチャ

![Architecture](./docs/images/architecture.png)

**色凡例 (実装ステータス / 2026-06-09 時点)**:
- 🟢 **緑** = Cloud Run / GCP で動作確認済 (deployed) — Web / API / Firestore backend / GitHub Actions (deploy-api + deploy-web) / WIF / Cloud Build / Artifact Registry / Cloud Logging
- 🟡 **黄** = コードあり / ローカル動作 / 空インスタンス (implemented) — MCP (stdio) / Orchestrator + 5 Agent (Mock LLM で動作中)
- ⚪ **灰** = 未実装、Phase 2 以降に着手予定 (planned) — Tool Server / IAP / Gemini 本物推論 / ADK ランタイム / Vector Search / Pub/Sub (アプリ内イベント配送 / スケジュール起動は不採用) / Firebase Auth

詳細: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 何を解決するか

1. **書き忘れ**: DoD 空 / SP 未定 / User Story 紐付けなしのチケットが溜まる
2. **形骸化**: 儀式が「時間通りやっただけ」で前進感が薄い
3. **言いっぱなし**: ふりかえり Try / レビュー会の指摘が翌スプリントに繋がらない
4. **戦略の不在**: 開発者が「何のためにこのチケットをやってるか」を見失う (Epic に Why が書かれていない)

→ **形だけ回るスクラム = 回ってるのに進んでない**。

## どう解決するか

- 人がチケットを起票する。AI Agent は **DoD / SP / User Story 紐付け / valueImpact / Epic.rationale** の不足を検出し提案 (人が承認 / L2 自律性)
- スクラムの **5 儀式 (Planning / Daily / Refinement / Review / Retrospective)** ごとに **専用画面** を持ち、儀式特有の形骸化シグナルを AI が診断 (Jira の 1 Sprint Board に対する差別化軸)
- ⭐ **Orchestrator** が単一窓口として 5 つの専門 Agent を協議編成 (ADK 宣言的マルチエージェント / 画面操作トリガ)。各 Agent は **チケット種別ルールエンジン (17 観点)** を共有
- ⭐ **見積もりポーカー** を Belvedere 内で完結 (隠蔽投票 → 一斉開示 → 採用、AI が会を運営。スプレッドシート / 外部サイト不要)
- ⭐ Refinement Agent の **第 6 観点「戦略整合性」** で Epic.rationale 欠落を検出
- ⭐ **MCP Server** で Claude Code / Cursor から本番 Belvedere を直接呼べる (= AI Agent エコシステム統合)

詳細: [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) / [`AGENT_DESIGN.md`](./AGENT_DESIGN.md)

---

## 採用技術

| 役割 | GCP | AWS で言うと |
|---|---|---|
| コンテナ実行 | **Cloud Run** | Fargate / App Runner |
| AI 推論 | **Gemini API** (本番実推論) | Bedrock Claude |
| マルチエージェント | **ADK** (`orchestrator-py` / Refinement を A2A で招集) + 自前 TS Orchestrator | AgentCore |
| RAG 意味検索 | **Firestore Vector** (Gemini 埋め込み) ⇄ **Elastic** 切替可 | Bedrock KB / OpenSearch |
| NoSQL | Firestore | DynamoDB |
| 鍵レス CI/CD | **Workload Identity Federation** | IAM OIDC Provider |
| MCP / A2A | MCP (垂直=ツール) + A2A (水平=エージェント間) | (固有概念なし) |

---

## 権限モデル (ロール)

Workspace ベースのマルチテナント。`Member.role` は **`admin | po | sm | dev`** の 4 値
(2026-06-23 再設計 / 旧 `owner` `guest` は廃止)。

| ロール | できること |
|---|---|
| **admin** | その Workspace の全権者 (= 作成者 / 全操作 bypass)。1 人運用・審査員デモはこれ。 |
| **po** | プロダクトオーナー。バックログ並び替え / Epic・Story 価値設定 / Sprint Goal / 招待。 |
| **sm** | スクラムマスター。Sprint 作成・開始 / 見積もり進行 / Sprint Goal / 招待。 |
| **dev** | 開発者。チケット編集 / 見積もり投票・採用 / AI Agent 実行。 |

> **owner はワークスペース内の役割ではない** — プラットフォーム全体で「人を招待する (ログイン許可を出す)」
> だけの本人。招待された人はログイン後、所属ゼロなら自分の Workspace 作成へ誘導され、作れば admin になる。

権限ゲートは `apps/api/src/permissions.ts` の `can()` 純粋関数に集約。操作ごとの許可ロール
(操作マトリクス) は [`DATA_MODEL.md` §7](./DATA_MODEL.md#7-権限モデル-ロールと操作マトリクス--2026-06-23-再設計) を単一ソースとする。

---

## ドキュメント

| ファイル | 役割 |
|---|---|
| [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md) | 課題・ターゲット・UVP・差別化 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | アーキ案 + GCP↔AWS 対応表 + Mermaid 図 (色分けステータス) |
| [DATA_MODEL.md](./DATA_MODEL.md) | 型定義 / Firestore コレクション設計 |
| [AGENT_DESIGN.md](./AGENT_DESIGN.md) | マルチエージェント / ツール / 自律性レベル |
| [ROADMAP.md](./ROADMAP.md) | 4/末 → 8/19 のマイルストーン |
| [PITCH.md](./PITCH.md) | 3 分ピッチ脚本 |
| [HACKATHON_COMPLIANCE.md](./HACKATHON_COMPLIANCE.md) | ハッカソン要件 ↔ 現状の対応表 |
| [PROJECT_PLAN.md](./PROJECT_PLAN.md) | 作業仕分け (Claude 単独 vs ユーザー必須) |
| [docs/setup-gcp.md](./docs/setup-gcp.md) | GCP セットアップ手順 |
| [docs/setup-github-wif.md](./docs/setup-github-wif.md) | WIF 鍵レス連携設定 |
| [docs/setup-mcp.md](./docs/setup-mcp.md) | MCP server を Claude Code から接続する手順 |

---

## リポジトリ構成

```
ai-agent-hackathon/
├── apps/
│   ├── web/                 # Nuxt 3 + Vue 3 SSR (Claude Designer 由来 5 画面)
│   ├── api/                 # Hono on Cloud Run ⭐ deployed
│   ├── cli/                 # Mock LLM CLI (5 ロール)
│   ├── orchestrator-py/     # FastAPI + ADK 雛形 (Python)
│   └── mcp-server/          # MCP server (stdio + HTTP / 11 Tools)
├── packages/
│   ├── shared/              # 型 (Project / Epic / UserStory / Ticket / CeremonyHealthScore)
│   ├── seed/                # 不変 fixture (1 project / 4 epics / 12 tickets / 3 sprints / 5 members)
│   ├── repo/                # Repository 抽象 (memory ✅ / firestore は Phase 1-B)
│   ├── llm/                 # LLMProvider 抽象 (mock ✅ / gemini / vertex は Phase 3)
│   ├── agent/               # Agent runtime (thought→tool→output ループ)
│   └── tools/               # Tool 実装 (refinement.check / quality.check / ticket.rules.check 等) + ticket-rules.ts (17 ルール)
├── infra/
│   └── cloudbuild.yaml      # Cloud Build パイプライン (build / push / deploy 3 step)
├── .github/workflows/
│   ├── ci.yml
│   └── deploy-api.yml       # WIF 経由 Cloud Run deploy
├── docs/
│   ├── setup-gcp.md
│   ├── setup-github-wif.md
│   ├── setup-mcp.md
│   └── images/architecture.png
├── package.json             # pnpm workspace ルート (@belvedere/* に統一)
└── tsconfig.base.json
```

---

## ローカル開発

### 前提

- Node.js 20.10+ / pnpm 9+ (corepack 推奨)
- Python 3.11+ + uv (orchestrator-py 用)

### セットアップ

```bash
pnpm install
pnpm typecheck                                              # 全 11 ワークスペース
```

### 起動コマンド

```bash
pnpm demo                                                   # Planner Mock LLM デモ
pnpm --filter @belvedere/cli dev plan       "Sprint 13 議題"
pnpm --filter @belvedere/cli dev daily      "本日のスタンドアップ要約"
pnpm --filter @belvedere/cli dev refinement "次スプリント候補のリファインメント診断"
pnpm --filter @belvedere/cli dev review     "デモシナリオ草稿"
pnpm --filter @belvedere/cli dev retro      "Sprint 12 のTry抽出"

pnpm --filter @belvedere/api dev                            # Hono :8080
pnpm --filter @belvedere/web dev                            # Nuxt 3 :3000
pnpm --filter @belvedere/mcp-server smoke                   # MCP server 14 ケース動作確認
pnpm --filter @belvedere/mcp-server dev                     # stdio MCP (Claude Code 接続用)

cd apps/orchestrator-py && uv run uvicorn orchestrator.main:app --reload --port 8081
```

### LLM プロバイダ切替

```bash
LLM_PROVIDER=mock pnpm demo            # デフォルト (動作版)
LLM_PROVIDER=gemini pnpm demo          # Phase 3 で実装 (現状 throw)
LLM_PROVIDER=vertex pnpm demo          # 〃
```

未実装プロバイダは silent fallback せず **明示的に throw** (= GCP セットアップ前提のサインポスト)。

---

## 進捗状況 (2026-05-06 現在)

### ✅ Phase 0 完了

- 設計ドキュメント全揃い (5 儀式 / Project / valueImpact / Epic.rationale / Reviewer Multimodal)
- ローカル動作の最小スキャフォールド (Mock LLM で 6 ロール: 5 儀式 + Orchestrator)
- Repository / LLM の抽象化 (memory / mock)
- Hono API / Nuxt 3 web / FastAPI orchestrator 雛形
- **MCP server (stdio + 11 Tools)** smoke 14/14 pass

### ✅ Phase 1-A 完了 (2026-05-06)

- GCP セットアップ全 10 ステップ (project / billing / API / Firestore / Artifact Registry / SA / 課金アラート $10/月)
- **WIF 鍵レス CI/CD**: `belvedere-ci-pool` / `belvedere-ci-github` Provider / `belvedere-deployer` SA + 6 ロール / principalSet で `KaedeAatou/belvedere` repo に絞込
- **Cloud Run 初回 deploy**: `belvedere-api-dev` が `asia-northeast1` で稼働、`/health` 200 OK 確認済
- ARCHITECTURE.md / Eraser 図に **実装ステータス色分け** 導入
- リポジトリ public 化 (MIT License)

### 🟡 Phase 1-B (5/18-22 予定 / 11 日バッファあり)
- Firestore データ層 (`packages/repo/src/firestore.ts`)
- Firebase Auth (個人 Google) で `/api/*` JWT 必須
- seed の Firestore 投入

### 🟡 Phase 1-C (5/23-29) — Web UI で CRUD 動作
### 🟡 Phase 1-D (5/30-6/3) — MCP server を Cloud Run へ
### 🟡 Phase 2 (6/10-6/30) — 画面操作トリガの AI パネル可視化
### 🟡 Phase 3 (7/1-7/27) — Gemini + ADK 本実装 + Reviewer Multimodal + RAG
### 🔴 Phase 4 (7/31-8/19) — 仕上げ + ピッチ + 最終発表

---

## ハッカソン情報

- **主催**: [ファインディ株式会社](https://findy.co.jp/) / メインスポンサー: グーグル・クラウド・ジャパン
- **公式ページ**: https://findy.notion.site/devops-ai-agent-hackathon-2026
- **作品提出 〆切**: 2026-07-10 (金) 23:59
- **最終ピッチ**: 2026-08-19 (水) Google 渋谷オフィス (10 チーム招待制)
- **賞金総額**: 200 万円 (最優秀 50 万 / 優秀 30 万×3 / 特別 10 万×6)
- **必須技術**: Cloud Run / GKE / Cloud Functions / App Engine / TPU・GPU から 1 つ以上 + Gemini / Vertex AI / ADK / 各種 AI API から 1 つ以上
- **個人参加**: KaedeAatou (個人 Google アカウント / 個人 GitHub)

---

## ライセンス

[MIT License](./LICENSE) — Copyright (c) 2026 KaedeAatou
