# Belvedere MCP Server セットアップ

> Belvedere を Claude Code / Cursor / 他の AI Agent クライアントから直接呼べるようにするための **MCP (Model Context Protocol) サーバ** の使い方。

---

## 概要

`apps/mcp-server` は **Belvedere HTTP API (Cloud Run) のクライアント** として動く stdio MCP サーバ。
Firestore を直接触らず、デプロイ済み API を HTTPS で叩く。これにより:

- web (belvedere-web-dev) が書き込むのと **同じ dev Firestore のデータ**を読み書きできる
  (= 「web でチケット起票 → MCP で取得 → 修正 → 完了」のサイクルが実データで繋がる)。
- API の認証 (サービストークン) → workspace 解決 → IDOR ガードと **同じ経路**を必ず通る (裏口を作らない)。
- データレイヤ / ビジネスロジックは API 側の単一ソースに集約され、MCP は薄い変換層に徹する。

公開している MCP Tool (14):

| MCP Tool | マップ先 API | 用途 |
|---|---|---|
| `belvedere_ticket_list` | `GET /api/tickets` (sprint/status/type/project/assignee/ritual 絞込) | チケット一覧。`type=bug` で current sprint の bug 抽出 |
| `belvedere_ticket_get` | `GET /api/tickets/:id` | 個別チケット取得 |
| `belvedere_epic_list` | `GET /api/epics` | Epic 一覧 (rationale/successMetric/strategicTheme 含む) |
| `belvedere_member_list` | `GET /api/members` | チームメンバ一覧 |
| `belvedere_quality_check` | `GET /api/tickets/:id/quality` | DoD/SP/User Story 紐付け診断 |
| `belvedere_refinement_check` | `GET /api/refinement` | 6 観点バックログ診断 (戦略整合性含む) + 種別ルール |
| `belvedere_sprint_list` | `GET /api/sprints` (+status 絞込) | スプリント一覧 |
| `belvedere_sprint_current` | `GET /api/sprints` → active 抽出 | 現行スプリント (bugfix ループの起点) |
| `belvedere_sprint_board` | `GET /api/sprints` + `GET /api/tickets` | 現行スプリント + status 別 + bug 一覧 |
| `belvedere_invoke_agent` | `POST /api/agents/:name` | 5 儀式エージェント直接呼び出し |
| `belvedere_ticket_create` | `POST /api/tickets` | チケット起票 (`type` 指定可 = bug 起票対応) |
| `belvedere_ticket_update` | `PATCH /api/tickets/:id` | チケット編集 (patch で部分更新) |
| `belvedere_ticket_status_change` | `PATCH /api/tickets/:id/status` | ステータス遷移 (→ done で completedAt 自動記録) |
| `belvedere_epic_update` | `PATCH /api/epics/:id` | Epic 編集 (rationale 等) |

書込承認は MCP server 側に持たず、**ホスト (Claude Code など) の標準ツール承認 UI に委譲**する設計
(`AGENT_DESIGN.md §4` L2 規範をホスト側で実現)。

---

## アーキテクチャ / セキュリティ

```
Claude Code ──stdio──> MCP server ──HTTPS(Bearer service token + X-Workspace-Id)──> Belvedere API (Cloud Run)
                                                                                        │
                                              authMiddleware (Firebase ID token もしくは MCP service token)
                                                                                        │
                                              workspaceMiddleware (member 解決 → workspaceId / role)
                                                                                        │
                                              handler (IDOR ガード: workspaceId 照合) ──> Firestore (dev)
```

**MCP サービストークン認証** (`apps/api/src/config/service-token.ts`):

- MCP は人間の Firebase (Google) ログインができないため、高エントロピーの**サービストークン**1 本で認証する。
- API は env `MCP_SERVICE_TOKEN` と **定数時間 (sha256 + timingSafeEqual)** で照合。一致したら専用の
  サービスプリンシパル (`svc:mcp` / `mcp@belvedere.svc`) として通す。
- このプリンシパルは email-allowlist 経由で **ws-belvedere の `po` member** に自動 bootstrap される
  (最小権限: member 招待 / workspace 削除は owner/sm 専用なので**不可**)。以降は人間ユーザーと完全に同じ
  workspace-scope / IDOR ガードを通る = **裏口にならない**。
- env `MCP_SERVICE_TOKEN` が未設定なら**この認証パス自体が無効** (Firebase のみ) = 安全側の既定。
- トークンはコードに置かない。Cloud Run には Secret Manager から注入、ローカルには Claude Code の mcp 設定の
  env で渡す。ローテーションは secret 更新 + 再デプロイ。
- 通信は Cloud Run の自動 HTTPS (TLS)。Firestore を直接触らない (= 個人 ADC や datastore.user 権限を MCP 側に持たせない)。

---

## ローカル動作確認

### Smoke test (19 ケース / 手元の通し確認・デモ用)

```bash
pnpm --filter @belvedere/mcp-server smoke
```

期待: `19 pass / 0 fail`。in-process で API (Hono app / memory backend + mock LLM) を立て、MCP service token で
認証する HTTP クライアント MCP を通して全ツールを叩く (ネットワーク不要)。
「MCP → HTTP → authMiddleware → workspaceMiddleware → handler → repo」の実経路を踏む。

### 単体/統合テスト (CI / regression 保証)

```bash
pnpm --filter @belvedere/mcp-server test   # MCP ↔ API 統合 (認証否定系 / IDOR / bugfix サイクル)
pnpm --filter @belvedere/api test          # API full-stack (service token 認証 / 新エンドポイント)
```

---

## 本番 (デプロイ済み API) へ繋ぐ — provisioning

> **secret / IAM の操作はユーザー実行**。以下のコマンドを `! <command>` でこのセッションから実行するか、手元のターミナルで実行する。

```bash
PROJECT=belvedere-dev-atrium
REGION=asia-northeast1

# 1. 高エントロピーのサービストークンを生成 (控えておく)
TOKEN=$(openssl rand -base64 32); echo "$TOKEN"

# 2. Secret Manager に保存
printf '%s' "$TOKEN" | gcloud secrets create mcp-service-token --data-file=- --project "$PROJECT"
#    更新時: printf '%s' "$NEW" | gcloud secrets versions add mcp-service-token --data-file=- --project "$PROJECT"

# 3. Cloud Run runtime SA に secret アクセス権を付与
gcloud secrets add-iam-policy-binding mcp-service-token --project "$PROJECT" \
  --member "serviceAccount:belvedere-runtime@${PROJECT}.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor

# 4. Cloud Run API サービスに env として注入 (secret 参照)
gcloud run services update belvedere-api-dev --region "$REGION" --project "$PROJECT" \
  --update-secrets MCP_SERVICE_TOKEN=mcp-service-token:latest
```

> **durable 化**: GitHub Actions の再デプロイで env が上書きされないよう、secret を作成した後に
> `infra/cloudbuild.yaml` / `.github/workflows/deploy-api.yml` の Cloud Run デプロイ引数へ
> `--set-secrets MCP_SERVICE_TOKEN=mcp-service-token:latest` を追記する (secret 作成前に追記するとデプロイが失敗するので順序に注意)。

---

## Claude Code から接続する

事前に build:

```bash
pnpm --filter @belvedere/mcp-server build
```

登録 (本番 API に対して / 上で生成した `$TOKEN` を渡す):

```bash
claude mcp add belvedere \
  --env BELVEDERE_API_BASE_URL=https://belvedere-api-dev-cpszmcqmuq-an.a.run.app \
  --env BELVEDERE_MCP_TOKEN="$TOKEN" \
  --env WORKSPACE_ID=ws-belvedere \
  -- node /path/to/ai-agent-hackathon/apps/mcp-server/dist/index.js   # ← クローンした絶対パスに置換
```

開発時 (再ビルド不要、tsx で直接起動):

```bash
claude mcp add belvedere \
  --env BELVEDERE_MCP_TOKEN="$TOKEN" \
  -- pnpm --silent --filter @belvedere/mcp-server dev
```

> 既に `belvedere` を登録済みなら、`claude mcp remove belvedere` してから上記で再登録する
> (旧版は repo 直結だったため、env と dist の更新が必要)。

### 接続確認

Claude Code 起動後 `/mcp` で `belvedere` が `connected` ならOK。`token=MISSING` が stderr に出ていたら
`BELVEDERE_MCP_TOKEN` が渡っていない。

### 使用例 (bugfix サイクル)

```
> Belvedere の current sprint の bug を出して。
  (Claude が belvedere_sprint_board / belvedere_ticket_list({type:'bug'}) を呼ぶ)

> WC-xxx をローカルで直すので in-progress にして。直したら done にして。
  (belvedere_ticket_status_change({id:'WC-xxx', to:'in-progress' / 'done'}))
```

---

## 環境変数

| 変数 | デフォルト | 効果 |
|---|---|---|
| `BELVEDERE_API_BASE_URL` | `https://belvedere-api-dev-cpszmcqmuq-an.a.run.app` | 接続先 API のベース URL |
| `BELVEDERE_MCP_TOKEN` | (空) | API の `MCP_SERVICE_TOKEN` と一致させるサービストークン。**必須** |
| `WORKSPACE_ID` | `ws-belvedere` | `X-Workspace-Id` ヘッダに載せる workspace |

API 側 (Cloud Run / ローカル `apps/api`):

| 変数 | デフォルト | 効果 |
|---|---|---|
| `MCP_SERVICE_TOKEN` | (空) | 設定時のみ MCP サービストークン認証パスが有効になる |
| `REPO_BACKEND` | `memory` | デプロイ済みは `firestore` |
| `LLM_PROVIDER` | `mock` | `gemini` / `vertex` は GCP セットアップ後 |

---

## ピッチでの位置づけ

`PITCH.md §5` 差別化軸:
> 「Belvedere は単独 SaaS ではなく **AI Agent エコシステムの一員**。Claude Code / Cursor / 他 MCP クライアントから直接呼べる」

セキュリティ面の訴求: MCP は Firestore を直接触る裏口ではなく、**サービストークンで HTTPS 認証して API の
認可境界 (workspace-scope / IDOR ガード) をそのまま通る**。これが Atlassian Intelligence / Notion AI には無い軸
(彼らは SaaS UI に閉じている)。
