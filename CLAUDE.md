# CLAUDE.md

> Belvedere — Scrum facilitation AI agent (DevOps × AI Agent Hackathon 2026, 最終ピッチ 2026-08-19)。形だけ回るスクラムを AI が **チケット品質** と **儀式運営** の両面で底上げする Jira 型 PM サービス。比喩: 螺旋階段の眺望。

> 命名規約・廃止語・ユーザー前提・UI 方針・大規模変更時の承認プロセスは **`.claude/rules/project.md`** に集約 (paths なしで auto-load)。本 CLAUDE.md は入口・5 儀式・コマンド・構造・Belvedere 固有 gotcha だけ。

## データモデルと 5 儀式 (差別化軸)

データ階層は Jira 型: **Workspace > Project > Epic > UserStory > Task**。Project ごとに `idPrefix` を自由設定 (デフォルト Belvedere Core = `BV`)。既存 seed (`EP-1..4` / `US-101..US-402` / `WC-101..112`) は immutable fixture。

儀式は **5つ** + Orchestrator。各儀式に専用画面を持つことが Jira (1 Sprint Board) との差別化軸:

| Floor | Ritual | Agent | 役割 (検出シグナル) | 自律性 |
|---|---|---|---|---|
| 01 | Planning | Planner | スプリント初日に CURRENT 確定 (Story→task/spike 分割) / Sprint Goal / 計画SP vs velocity (過剰計画) / DoD・US紐付け診断 | L2 |
| 02 | Daily | Daily | Velocity 整合 / 2日完了率 / 3日停滞 | L3 通知 / L2 メンション |
| 03 | Refinement | Refinement | US を最小価値 Story に分割 + 品質ピル (粒度SP>8 / 依存 / valueImpact / `priority×valueImpact` / SP分散 / **Epic.rationale 欠落** をルールエンジンが診断) | L2 |
| 04 | Review | Reviewer | (会前) デモシナリオ / Cloud Run preview URL集 / ステークホルダ通知 (録画 Multimodal は 2026-06-10 縮退削除) | L2 |
| 05 | Retrospective | Retrospective | Try 抽出 / 翌スプリント WIP 転記 | L2 |
| — | (router) | Orchestrator | 5 agent の起動順判定 (gemini-flash class) | — |

> 自律性 L0–L4 の定義は `AGENT_DESIGN.md §4`。**Mock LLM (`packages/llm/src/mock.ts`) は system prompt の英語 Agent 名で role を判定**するため、`packages/agent/src/prompts.ts` 編集時に英語名 (Planner Agent / Daily Agent / Refinement Agent / Reviewer Agent / Retrospective Agent / Orchestrator) を保持すること。

## ハッカソン要件 (non-negotiable)

最終目的は応募・受賞。採用: **Cloud Run + Gemini API + ADK**。「絶対にしない判断」リストは `.claude/rules/project.md`。一次情報は **公式 Notion** (`memory/hackathon_url.md`)。要件チェックは `/hackathon-check` Skill。

## Commands

前提: **Node 20.10+** / **pnpm 9+** (corepack 推奨) / **Python 3.11+** (orchestrator 用 / `uv` 管理)。

```bash
pnpm install                                                # TS workspaces
pnpm typecheck                                              # 全 11 ワークスペース
pnpm demo                                                   # Planner Mock LLM デモ
pnpm --filter @belvedere/cli dev <ritual> "..."             # plan / daily / refinement / review / retro
pnpm --filter @belvedere/web dev                            # Nuxt 3 :3000
pnpm --filter @belvedere/api dev                            # Hono :8080
pnpm --filter @belvedere/mcp-server smoke                   # MCP server 14 ケース動作確認
pnpm --filter @belvedere/mcp-server dev                     # stdio MCP server (Claude Code 接続用)
cd apps/orchestrator-py && uv run uvicorn orchestrator.main:app --reload --port 8081
```

`pnpm test` で全 workspace のテストを vitest 経由で実行 (2026-06-09 〜)。現状 `packages/llm` (Mock LLM 役割判定) + `packages/repo` (memory backend where) が test を持つ。新規 package を作る時は `"test": "vitest run"` script を package.json に追加する (`--if-present` で skip される)。

## Architecture (フォルダ構成 + 層分離)

LLM とストレージを差し替え可能にするための層分割。下から上に依存:

```
packages/
  shared/   ← 型定義 (Project / Epic / UserStory / Ticket / CeremonyHealthScore など)
  seed/     ← immutable demo fixture (1 project / 4 epics / 12 tickets / 3 sprints / 5 members)
  repo/     ← RepoContainer 抽象 (memory / firestore)
  llm/      ← LLMProvider 抽象 (mock / gemini / vertex)
  tools/    ← buildTools(repo) factory
  agent/    ← runAgent loop (thought → tool_call → tool_result → output)

apps/
  cli/             ← CLI demo (Mock LLM)
  api/             ← Hono on Cloud Run
  web/             ← Nuxt 3 + Vue 3 SSR (nitro=node-server, Cloud Run 想定)
  orchestrator-py/ ← FastAPI + ADK 雛形 (Python 3.11)
  mcp-server/      ← MCP server (stdio Phase 0 完成 / HTTP Phase 1-D で Cloud Run)
```

**未実装プロバイダは silent fallback せず throw する** = GCP セットアップ前提のサインポスト:

| env | default | 他の値 |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `gemini` / `vertex` (throw) |
| `REPO_BACKEND` | `memory` | `firestore` (throw) |
| `USE_REAL_ADK` | `false` | `true` (`NotImplementedError`) |

## Gotchas (Belvedere 固有 / 重複なし)

- **`packages/seed/src/*` 編集はデフォルト block** (`seed-guard.sh` PreToolUse)。正当な変更は (a) `CLAUDE_FORCE_SEED_EDIT=1 claude` 起動、または (b) Bash + heredoc 経由 (Edit/Write/MultiEdit hook を回避)。**正当性を会話に明記してから実行**
- **言語別の罠** (`.js` 拡張子なし import / nuxt dev 二重起動 / `.vue` typecheck 手動) は対象ファイル編集時に `.claude/rules/{languages,frameworks}/*.local.md` が auto-load される

## ルール参照階層

| 層 | ファイル | auto-load 条件 |
|---|---|---|
| ドメイン規範 | `.claude/rules/project.md` | 常時 (paths なし) |
| 言語別 | `.claude/rules/languages/{typescript,python}.{md,local.md}` | `.ts` / `.py` 編集時 |
| フレームワーク別 | `.claude/rules/frameworks/{nuxt,fastapi,vue}.{md,local.md}` | `.vue` / `apps/orchestrator-py/**` 編集時 |
| 設計ドキュメント | `PRODUCT_BRIEF / ARCHITECTURE / DATA_MODEL / AGENT_DESIGN / ROADMAP / PITCH / PROJECT_PLAN / HACKATHON_COMPLIANCE` + `docs/{PROMPTING_GUIDE,setup-gcp,setup-mcp,setup-github-wif}.md` | 必要時に Read |
| Memory | `memory/MEMORY.md` index 経由 | 関連話題が出た時 |

> 新しい top-level `*.md` を勝手に作らない。既存を更新する。

## 開発フロー (must)

**計画 → 実装 → 検証 → デプロイ/CI → クローズ** の 5 フェーズで回す。各フェーズで使う skill / subagent / hook の対応表・委譲ガイド・エスカレーション基準は **`autonomous-run` skill** に集約 (無人実行時は必読、有人時も同じフロー)。要点:

- prompts.ts / agents.py 編集 → `agent-prompt-sync` skill + `mock-llm-reviewer` subagent
- 大きな変更後の docs 乖離 → `architecture-consistency-checker` subagent で監査
- e2e 失敗 → CI 修正ループ (artifact 解析 → 原因分類 → 修正 → 再 push、3 周上限)
- UI 変更 → §V スクショ検証 (playwright-results の screens/*.png を Read で目視)
- e2e は **並行 2 本が同一 WS を共有** — 件数厳密比較の assert は書かない (テキスト存在 + 自己清掃)

## Git commit (must)

`git commit` 前に必ず **`belvedere-commit`** skill を呼ぶ。フォーマット強制 (1 行目 `[<種別>]<要約>` / 2 行目 空 / 3 行目以降 変更理由)。詳細: `.claude/skills/belvedere-commit/`。`commit-commands:commit` plugin は使わない。

## 自動化の可視化

`! ./.claude/status.sh` で hooks / subagents / skills の一覧 + 色 + 起動回数 + 直近発火履歴を表示。

- **Hooks の発火履歴**: `.claude/.hooks.log` (各 hook が起動するたびに追記)
- **Subagent / Skill の起動履歴**: `.claude/.usage.log` (`usage-tracker.sh` PreToolUse `Task|Skill` matcher で記録)
- **Usage audit**: SessionStart + UserPromptSubmit (4h rate-limit) で起動回数 0 の subagent/skill を Claude に通知 → 削除候補 / frontmatter 改善 / 維持 を判定依頼。長セッション中も `.claude/.last-usage-audit` で 4 時間ごとに再判定
- **Hackathon reminder**: SessionStart + UserPromptSubmit (4h rate-limit) で「最終 hackathon-check から 7 日経過」判定 → `/hackathon-check` を促す
