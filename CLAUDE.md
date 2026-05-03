# CLAUDE.md

> Belvedere — Scrum facilitation AI agent (DevOps × AI Agent Hackathon 2026, 最終ピッチ 2026-08-19)。形だけ回るスクラムを AI が **チケット品質** と **儀式運営** の両面で底上げする Jira 型 PM サービス。比喩: 螺旋階段の眺望。

**ドメイン規範・命名規約・廃止語・ユーザー前提・UI 方針 は `.claude/rules/project.md` に集約 (paths なしで auto-load)**。本 CLAUDE.md は入口・コマンド・構造・gotcha を扱う。

## データモデルと儀式 (差別化軸)

データ階層は Jira 型: **Workspace > Project > Epic > UserStory > Task**。Project ごとに `idPrefix` を自由設定 (デフォルト Belvedere Core = `BV`)。既存 seed (`EP-1..4` / `US-101..US-402` / `WC-101..112`) は immutable fixture (Belvedere Core 配下と解釈、ID 値は変更しない)。

儀式は **5つ** + Orchestrator。各儀式に専用画面を持つことが Jira (1 Sprint Board) との差別化軸:

| Floor | Ritual | Agent | 役割 (検出シグナル) | 自律性 |
|---|---|---|---|---|
| 01 | Planning | Planner | Sprint Goal / SP容量 / DoD・US紐付け診断 | L2 |
| 02 | Daily | Daily | Velocity 整合 / 2日完了率 / 3日停滞 | L3 通知 / L2 メンション |
| 03 | Refinement | Refinement | 粒度 (SP>8) / 依存 / valueImpact / `priority×valueImpact` / SP分散 | L2 |
| 04 | Review | Reviewer | デモシナリオ / Cloud Run preview URL集 | L2 |
| 05 | Retrospective | Retrospective | Try 抽出 / 翌スプリント WIP 転記 | L2 |
| — | (router) | Orchestrator | 5 agent の起動順判定 (gemini-flash class) | — |

自律性 L0–L4 の定義は `AGENT_DESIGN.md §4`。Mock LLM (`packages/llm/src/mock.ts`) は **system prompt の英語 Agent 名** で role を判定するため、prompts.ts 編集時に英語名を保持すること。

## ハッカソン要件 (non-negotiable)

最終目的は応募・受賞。採用: **Cloud Run + Gemini API + ADK**。詳細・絶対しない判断 → `.claude/rules/project.md` / `HACKATHON_COMPLIANCE.md`。一次情報は **公式 Notion** (`memory/hackathon_url.md` の取得手順)。要件チェックは `/hackathon-check` Skill。

## Quick start

前提: **Node 20.10+** / **pnpm 9+** (corepack 推奨) / **Python 3.11+** (orchestrator 用 / `uv` で管理)。

```bash
pnpm install                                                    # TS workspaces
cd apps/orchestrator-py && uv sync                              # Python orchestrator
pnpm typecheck                                                  # all TS packages
pnpm demo                                                       # Planner Mock LLM デモ
pnpm --filter @kazaguruma/cli dev <ritual> "..."                # plan / daily / refinement / review / retro
pnpm --filter @kazaguruma/web dev                               # Nuxt 3 :3000
pnpm --filter @kazaguruma/api dev                               # Hono :8080
cd apps/orchestrator-py && uv run uvicorn orchestrator.main:app --reload --port 8081
```

> 内部パッケージ名は `@kazaguruma/*` のまま据え置き (再ブランドは UI/docs/pitch 層で先行)。`pnpm test` は何も実行しない (テストスイートは未整備、fabrication 禁止)。

## フォルダ構成 (層分離の意図)

LLM とストレージを差し替え可能にするための層分割。下から上に依存:

```
packages/
  shared/   ← 型定義 (Project / Epic / UserStory / Ticket / CeremonyHealthScore など)
  seed/     ← immutable demo fixture (1 project / 4 epics / 12 tickets / 3 sprints / 5 members)
  repo/     ← RepoContainer 抽象 (memory / firestore)
  llm/      ← LLMProvider 抽象 (mock / gemini / vertex)
  tools/    ← buildTools(repo) factory (Slack/GitHub/Firestore-shaped tool functions)
  agent/    ← runAgent loop (thought → tool_call → tool_result → output)

apps/
  cli/             ← CLI demo (Mock LLM)
  api/             ← Hono on Cloud Run
  web/             ← Nuxt 3 + Vue 3 SSR (nitro=node-server, Cloud Run 想定)
  orchestrator-py/ ← FastAPI + ADK 雛形 (Python 3.11)

docs/         ← GCP setup, prompting guide 等の人読みドキュメント
infra/        ← Cloud Build パイプライン
.claude/      ← rules / hooks / skills / agents (Claude Code オートメーション)
```

**未実装プロバイダは silent fallback せず throw する** = GCP セットアップ (`docs/setup-gcp.md`) が前提条件のサインポスト:

- `LLM_PROVIDER`: `mock` (default) / `gemini` / `vertex` (後者2つは throw)
- `REPO_BACKEND`: `memory` (default) / `firestore` (throw)
- `USE_REAL_ADK`: `false` (default, スタブ応答) / `true` (`NotImplementedError`)

## Common gotchas (踏みやすい罠)

- **`.js` 拡張子なし import**: workspace 内部 import は `from './types'` (NOT `'./types.js'`)。Nuxt 3 (Nitro/Vite/Rollup) が dist build なしの `.js` 拡張子を解決できないため。`nuxt.config.ts` で `build.transpile: ['@kazaguruma/*']` も必要
- **`nuxt dev` 二重起動禁止**: 2nd インスタンスは `acquireDevLock` で失敗 → `pkill -f nuxt` してから再起動
- **`packages/seed/src/*` 編集はデフォルト block** (`seed-guard.sh` PreToolUse)。正当な変更は (a) `CLAUDE_FORCE_SEED_EDIT=1 claude` 起動、または (b) Bash + heredoc 経由 (Edit/Write/MultiEdit hook を回避)。**正当性を会話に明記してから実行**
- **`.vue` 編集は ts-typecheck hook の対象外** (`.ts`/`.tsx` のみ自動チェック)。Vue SFC 編集後は手動で `pnpm typecheck`
- **大規模方針変更 (再ブランド / データモデル改編 / 儀式追加・順序変更 / autonomy default 変更) は Auto Mode でも 1 問の確認を挟む**。無確認で進めると code/docs/mock LLM/seed/Pitch まで連鎖書き換え発生

## ルール参照階層

| 層 | ファイル | 用途 |
|---|---|---|
| ドメイン規範 (auto-load) | `.claude/rules/project.md` | Belvedere / 5儀式 / 廃止語 / アーキ層 / ユーザー前提 / 大規模変更時の承認 / seed-guard 迂回手順 |
| 言語別 (paths-based) | `.claude/rules/languages/{typescript,python}.md` + `.local.md` | 編集対象が `.ts` / `.py` の時に auto-load |
| フレームワーク別 | `.claude/rules/frameworks/{vue,nuxt,fastapi}.md` + `.local.md` | 編集対象が `.vue` / `apps/orchestrator-py/**` の時に auto-load |
| 設計ドキュメント (人読み) | `PRODUCT_BRIEF.md` / `ARCHITECTURE.md` / `DATA_MODEL.md` / `AGENT_DESIGN.md` / `ROADMAP.md` / `PITCH.md` / `PROJECT_PLAN.md` / `HACKATHON_COMPLIANCE.md` / `docs/PROMPTING_GUIDE.md` / `docs/setup-gcp.md` / `docs/setup-github-wif.md` | トピック別の単一情報源。新しい top-level `*.md` を勝手に作らない |
| Memory (user-specific) | `memory/MEMORY.md` index 経由 | user 経験 (AWS / Vue) / 過去のミス経緯 / 外部 URL のみ。汎用ドメイン情報は置かない |

## Project automation (`.claude/`)

- **Hooks**: `seed-guard.sh` (PreToolUse, `packages/seed/src/*` 編集 block / 迂回は `CLAUDE_FORCE_SEED_EDIT=1` または Bash + heredoc) / `ts-typecheck.sh` (PostToolUse, `.ts`/`.tsx` 編集後 `pnpm typecheck`) / `hackathon-check-reminder.sh` (SessionStart, 7日経過リマインダ)
- **Skills**: `agent-prompt-sync` / `gcp-setup` / `hackathon-check`
- **Subagents**: `mock-llm-reviewer` / `architecture-consistency-checker` / `hackathon-compliance-auditor` / `prompt-quality-reviewer`

## 意図的未実装 (バグではない)

GCP セットアップ待ち (Live Gemini / Vertex / Firestore) / ADK runtime / Tests / `apps/web` 認証 — `ROADMAP.md` でシーケンス済。
