# Belvedere MCP Server セットアップ

> Belvedere を Claude Code / Cursor / 他の AI Agent クライアントから直接呼べるようにするための **MCP (Model Context Protocol) サーバ** の使い方。

---

## 概要

`apps/mcp-server` は Belvedere の以下を MCP Tool として外部に公開する:

| MCP Tool | 用途 | 状態 |
|---|---|---|
| `belvedere_ticket_list` | チケット一覧 (sprint/status/project で絞込) | ✅ Phase 0 |
| `belvedere_ticket_get` | 個別チケット取得 | ✅ Phase 0 |
| `belvedere_epic_list` | Epic 一覧 (rationale/successMetric/strategicTheme 含む) | ✅ Phase 0 |
| `belvedere_member_list` | チームメンバ一覧 | ✅ Phase 0 |
| `belvedere_quality_check` | DoD/SP/User Story 紐付け診断 | ✅ Phase 0 |
| `belvedere_refinement_check` | 6 観点バックログ診断 (戦略整合性含む) | ✅ Phase 0 |
| `belvedere_invoke_agent` | 5 儀式エージェント直接呼び出し (Mock LLM) | ✅ Phase 0 |
| `belvedere_ticket_create` | チケット起票 (id 自動採番) | ✅ Phase 0 (CRUD 前倒し) |
| `belvedere_ticket_update` | チケット編集 (patch で部分更新) | ✅ Phase 0 |
| `belvedere_ticket_status_change` | ステータス遷移 (backlog → done) | ✅ Phase 0 |
| `belvedere_epic_update` | Epic 編集 (rationale / successMetric / strategicTheme / valueImpact) | ✅ Phase 0 |

書込承認は MCP server 側に持たず、**ホスト (Claude Code など) の標準ツール承認 UI に委譲**する設計 (`AGENT_DESIGN.md §4` L2 規範をホスト側で実現)。

---

## ローカル動作確認

### Smoke test (14 ケース)

```bash
pnpm --filter @belvedere/mcp-server smoke
```

期待: `14 pass / 0 fail`。MCP プロトコルを介さずに `listTools` / `callTool` を直接呼ぶため、内部実装の動作確認に最適。読み取り 6 + invoke 1 + CRUD 4 (実書込) + エラーハンドリング 3 を網羅。

### stdio mode (本番想定)

```bash
pnpm --filter @belvedere/mcp-server dev
```

stdio 経由で待ち受け状態になる。これを Claude Code から呼ぶ。

---

## Claude Code から接続する

### 設定 (1 回だけ)

`~/.claude.json` に追加 (もしくは `claude mcp add` 経由):

```bash
claude mcp add belvedere stdio "node /Users/kagayayuuki/Projects/ai-agent-hackathon/apps/mcp-server/dist/index.js"
```

事前に `pnpm --filter @belvedere/mcp-server build` でビルドしておくこと。

開発時 (再ビルド不要) に tsx で直接起動する場合:

```bash
claude mcp add belvedere stdio "pnpm --silent --filter @belvedere/mcp-server dev"
```

### 接続確認

Claude Code 起動後、`/mcp` コマンドで `belvedere` server が `connected` と表示されればOK。

### 使用例

Claude Code のチャットで:

```
> Sprint 13 の停滞チケットを Belvedere で見て、Daily Agent に診断させて。

(Claude が自動的に belvedere_invoke_agent({ agent: 'daily', ... }) を呼ぶ)
```

```
> 次スプリント候補を Refinement Agent で 6 観点診断して、
  Epic.rationale が空のものを Apply で埋めて。

(Phase 2 で belvedere_epic_update が動くと、Apply が実際に書き込みになる)
```

---

## 環境変数

| 変数 | デフォルト | 効果 |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `gemini` / `vertex` は GCP セットアップ後に実装 |
| `REPO_BACKEND` | `memory` | `firestore` は Phase 2 で実装 (現状は throw) |

---

## Phase 計画 (2026-05-05 4 段階構成へ再編)

- **Phase 0** ✅: stdio mode + 11 Tool **全実装** (read 6 + invoke + CRUD 4)。Mock LLM / memory repo で動作。Smoke test 14/14 pass
- **Phase 1 (~6/9)**: HTTP transport (Streamable HTTP) で Cloud Run にデプロイ + Firestore Repository 接続 + OAuth 2.1 認証 (個人 Google)
- **Phase 2 (~6/30)**: AI Integrity Panel との統合 (`belvedere_invoke_agent` を Web UI 側からも叩く)
- **Phase 3 (~7/27)**: `belvedere_invoke_agent` が本物 Gemini を呼ぶようになる (LLM Provider 差し替え、MCP 側のコード変更不要)
- **Phase 4 (~8/19)**: ドッグフード期間で Claude Code 経由の実運用 + UX 改善

---

## ピッチでの位置づけ

`PITCH.md §5` 差別化軸:
> 「Belvedere は単独 SaaS ではなく **AI Agent エコシステムの一員**。Claude Code / Cursor / 他 MCP クライアントから直接呼べる」

これが Atlassian Intelligence / Notion AI には無い軸 (彼らは SaaS UI に閉じている)。
