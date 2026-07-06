# Belvedere

> **Scrum facilitation AI agent** — DevOps × AI Agent Hackathon 2026
>
> 形だけ回るスクラムを **AI が「チケット品質」と「儀式運営」の両面から底上げする** Jira 型 PM サービス。
> 比喩: 螺旋階段を上った先の眺望。

[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-deployed-2E7D32)](https://belvedere-api-prod-iuep3t4nma-an.a.run.app/health)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-WIF%20%E9%8D%B5%E3%83%AC%E3%82%B9-blue)](./.github/workflows/deploy-api.yml)
[![Hackathon](https://img.shields.io/badge/Hackathon-DevOps%20%C3%97%20AI%20Agent%202026-FF6B35)](https://findy.notion.site/devops-ai-agent-hackathon-2026)

---

## 動いているもの (今すぐ触れる)

> **DevOps × AI Agent Hackathon 2026 応募作品** — 7/10 提出 / 8/19 最終ピッチ (渋谷ストリーム)
> 公開 URL は審査用デモ環境。Cloud Run + **本番 Gemini 推論** で稼働し、Firestore に seed (12 チケット / 4 Epic / 3 Sprint / 5 メンバ) を投入済です。

| 種類 | URL / 場所 |
|---|---|
| 🟢 **公開デモ (Web / Nuxt 3 SSR)** — 5 儀式 UI + AI パネル | **[https://belvedere-scrum.web.app](https://belvedere-scrum.web.app)** |
| 🟢 **API /health** (LLM / Firestore / RAG の稼働状態) | [https://belvedere-api-prod-iuep3t4nma-an.a.run.app/health](https://belvedere-api-prod-iuep3t4nma-an.a.run.app/health) |
| 🟢 **アーキテクチャ図** (Eraser) | [https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa](https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa) |
| 🟢 **GitHub Actions (鍵レス WIF deploy + prod 昇格ゲート)** | [`deploy-api.yml`](./.github/workflows/deploy-api.yml) / [`promote-prod.yml`](./.github/workflows/promote-prod.yml) |

> 🔑 **審査員向けデモアカウント**: 公開デモはログイン制です。`demo@belvedere.demo` (admin ロール / seed 投入済ワークスペースを全操作可) の**資格情報は応募フォーム / ProtoPedia 作品ページに記載**しています。

```bash
# 本番 API は Gemini 実推論 + Firestore + Vector RAG で稼働 (LLM は mock ではなく gemini):
curl https://belvedere-api-prod-iuep3t4nma-an.a.run.app/health
# {"status":"ok","llm":"gemini","repo":"firestore","knowledge":"firestore"}

# 業務データ (/api/tickets 等) は Firebase Auth 必須のため、公開デモ (要ログイン) で確認してください。
```

---

## アーキテクチャ

![Architecture](./docs/images/architecture.png)

**色凡例 (実装ステータス / 2026-07 提出時点)**:
- 🟢 **緑** = Cloud Run / GCP で稼働 (deployed) — Web / API (**dev + prod 昇格ゲート**) / **Gemini 本番実推論** / Firestore backend / **Firebase Auth (個人 Google + Email/Password)** / **Firestore Vector RAG (Gemini 埋め込み)** / MCP server / GitHub Actions (WIF 鍵レス) / Cloud Build / Artifact Registry / Cloud Logging
- 🟡 **黄** = 実装済み / flag で有効化 (implemented) — **ADK (google-adk) を A2A ピアとして公開** (`orchestrator-py` / Refinement を Strangler Fig で委譲・A2A 不達時は自前 TS runAgent へ自動 fallback) / Elastic 意味検索 (Firestore Vector と切替可)
- ⚪ **灰** = 不採用 / 対象外 (not adopted) — IAP / Pub/Sub (スケジュール起動は思想として不採用 = 人が画面を操作した時だけ AI が動く)

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
- ⭐ **Orchestrator** が単一窓口として 5 つの専門 Agent を協議編成 (本番は自前 TS runAgent / Refinement は ADK ピアにも A2A 委譲可 / 人の画面操作がトリガ)。各 Agent は **チケット種別ルールエンジン (17 観点)** を共有
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
│   ├── orchestrator-py/     # FastAPI + ADK (google-adk) — Refinement を A2A ピアとして公開 (Python)
│   └── mcp-server/          # MCP server (stdio + HTTP / 14 Tools)
├── packages/
│   ├── shared/              # 型 (Project / Epic / UserStory / Ticket / CeremonyHealthScore)
│   ├── seed/                # 不変 fixture (1 project / 4 epics / 12 tickets / 3 sprints / 5 members)
│   ├── repo/                # Repository 抽象 (memory / firestore ✅ 本番稼働)
│   ├── llm/                 # LLMProvider 抽象 (mock / gemini ✅ 本番稼働 / vertex)
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
pnpm --filter @belvedere/mcp-server smoke                   # MCP server 19 ケース動作確認
pnpm --filter @belvedere/mcp-server dev                     # stdio MCP (Claude Code 接続用)

cd apps/orchestrator-py && uv run uvicorn orchestrator.main:app --reload --port 8081
```

### LLM プロバイダ切替

```bash
LLM_PROVIDER=mock pnpm demo            # ローカル既定 (キー不要 / 役割別テンプレ応答)
LLM_PROVIDER=gemini pnpm demo          # 本番稼働中 (Cloud Run dev/prod は gemini)。GEMINI_API_KEY 必須
LLM_PROVIDER=vertex pnpm demo          # Vertex AI 経路 (未配線 / throw)
```

本番 (Cloud Run dev/prod) は `LLM_PROVIDER=gemini` で実推論。ローカル既定は `mock`。未配線プロバイダ (vertex) は silent fallback せず **明示的に throw** (= セットアップ前提のサインポスト)。

---

## 実装ハイライト (2026-07 提出時点)

設計 → 実装 → 本番デプロイまで完走。主要機能は Cloud Run 上で **本番 Gemini 推論** で稼働している。ハッカソンの企画3軸で整理する。

### つくる — AI を価値の中心に

- スクラムの **5 儀式それぞれに専用画面 + 専用 Agent** (Planner / Daily / Refinement / Reviewer / Retrospective)。Jira の 1 Sprint Board に対する差別化軸。
- ⭐ **Orchestrator 単一窓口** が 5 Agent を協議編成。子には `agent.invoke` を渡さず**孫協議を構造的に不可能化 (深さ1保証)**、1 リクエストにコストキャップ + 反復上限で暴走を抑止。
- ⭐ チケット種別 **ルールエンジン (17 観点)** を 5 Agent が共有し、DoD / SP / Story 紐付け / valueImpact / Epic.rationale 欠落を検出 (人が承認 = L2 自律性)。golden test で回帰を固定。
- ⭐ **見積もりポーカー**を Belvedere 内で完結。投票の隠蔽はサーバ側で強制 (一斉開示まで他人の値を返さない) → 採用まで AI が会を運営。

### まわす — CI/CD + AI 継続改善

- **WIF 鍵レス CI/CD** (typecheck / test / dev deploy / E2E)。prod は **テスト済み SHA だけを昇格**する `promote-prod.yml` (dev E2E 通過の verify ゲート + 承認ゲート = DevOps の promotion by tested SHA)。
- **継続改善ループ**: 前スプリントの Retrospective Try を全 Agent が起動時に参照し、次スプリントの診断基準へ反映 (**Firestore Vector RAG** / Gemini 埋め込みで意味検索)。
- ⭐ **ADK (google-adk)** を A2A ピアとして実装。Refinement を Strangler Fig で ADK へ委譲 (A2A 不達時は自前 TS runAgent へ**自動 fallback** = 本番 5 儀式は無傷)。

### とどける — マルチテナント + エコシステム統合

- **Firebase Auth** (個人 Google + Email/Password) + Workspace ベースの**マルチテナント**。全 tool が workspaceId を closure に閉じ込め、**IDOR / 越境を構造的に防止**。
- ロール権限 (`admin` / `po` / `sm` / `dev`) を `can()` 純粋関数に集約。
- ⭐ **MCP Server** で Claude Code / Cursor から本番 Belvedere を直接操作 (AI Agent エコシステム統合)。

> テストは全ワークスペースで vitest 緑 (純粋関数 unit / component unit / API 統合 / Playwright E2E / agent golden)。開発マイルストーンの詳細は [`ROADMAP.md`](./ROADMAP.md) / [`HACKATHON_COMPLIANCE.md`](./HACKATHON_COMPLIANCE.md)。

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
