# Belvedere — プロジェクトルール

## ドメイン哲学

**Belvedere** = 「形だけ回るスクラム」を AI が **チケット品質** と **儀式運営** の両面から底上げする Jira 型 PM サービス。比喩: 螺旋階段を上った先の眺望。**比喩は明示してから使う**、コード/業界語には持ち込まない。

> プロダクト概要・データ階層 (Workspace > Project > Epic > Story > Task)・儀式5つの表 + Agent 役割・`idPrefix` 仕様・自律性 L0–L4 (`AGENT_DESIGN.md §4` 参照) は **`CLAUDE.md` の「データモデルと儀式」セクション**に集約 (差別化軸として session start で常時表示)。本ファイルは命名規約・廃止語・ユーザー前提・UI 方針 などのドメイン規範を扱う。

## ハッカソン要件 (non-negotiable)

リポジトリの最終目的は応募・受賞。以下の判断は **絶対にしない**:

- ❌ Gemini を Anthropic Claude / OpenAI GPT に置き換える
- ❌ Cloud Run を Vercel / AWS Lambda / Render に置き換える
- ❌ マルチエージェント自律性を「ボタン押したら要約」に縮退
- ❌ 会社 Google アカウントで GCP プロジェクトを作る (個人参加要件違反)

採用技術: **Cloud Run** + **Gemini API + ADK**。要件チェックは `/hackathon-check` Skill で公式 Notion を一次参照。

## 命名規約・用語

- **出力言語: 日本語**。技術用語と識別子は原文のまま
- **造語禁止**: 設計・データモデル・Agent 出力・ピッチで勝手な造語を作らない。スクラム/PM の業界語を使う (Sprint Goal / Definition of Done / Velocity / Story Point / WSJF / Business Value)
- **比喩は明示**: 螺旋階段比喩は冒頭で「比喩」と宣言。コードや型名には持ち込まない
- **AI Agent 出力では source ID を引用**: `EP-xxx` / `US-xxx` / `WC-xxx`、外部参照は `slack:Cxx:Txx` / `gh:org/repo#nn`。fabricated ID は禁止

## Git commit メッセージ (non-negotiable)

**`git commit` 実行前に必ず `belvedere-commit` skill を呼ぶ**。Qiita itosho 流のフォーマット (1 行目: `[<種別>]<要約>` / 2 行目: 空行 / 3 行目以降: 変更理由) を強制。GitHub の commits 一覧で 1 行目だけで「なぜ必要か」が読み取れることが審査基準 (B-5 実装力評価)。

- **直接 `git commit` を Bash で実行する場合も**、メッセージは belvedere-commit のフォーマットに従う
- 既存 `commit-commands:commit` plugin は **使わない** (フォーマット強制しないため)
- 詳細: `.claude/skills/belvedere-commit/SKILL.md` + `references/examples.md`

## 廃止済キーワード (2026-04-30 / 05-01)

復活させない。`prompt-quality-reviewer` Subagent はこれらの混入を検出する:

- `WindEvent` / `WingScore` / `windCaptureRate`
- `北翼` / `東翼` / `南翼` / `西翼` / 翼メタファー
- `風車` / `Kazaguruma` (旧プロダクト名 — 完全廃止 / 2026-05-05)
- `@kazaguruma/*` (旧 workspace package 名 — `@belvedere/*` に完全統一 / 2026-05-05)
- `kazaguruma-dev-2026` / `kazaguruma-prod-2026` / `belvedere-dev-2026` / `belvedere-prod-2026` (旧 GCP プロジェクト ID — 初号機コードネーム `atrium` 採用で `belvedere-dev-atrium` / `belvedere-prod-atrium` に統一 / 2026-05-05)
- `kazaguruma-api` / `kazaguruma-runtime` (旧 Cloud Run / SA 名 — `belvedere-api` / `belvedere-runtime` に統一)
- `「価値タグ」` (造語) → `valueImpact` (`high` / `medium` / `low`) に置換済

## アーキテクチャ層

フォルダ構成と層分離の意図、env switch (`LLM_PROVIDER` / `REPO_BACKEND` / `USE_REAL_ADK`) のスタブ仕様は `CLAUDE.md` の「フォルダ構成」セクション参照。

## ユーザー前提

- AWS 実務経験あり / **GCP 未経験** → GCP サービス説明時は AWS 対応を必ず併記 (`Cloud Run = Lambda + ECS Fargate` 等)
- **Vue 経験あり / React (Next.js) 未経験** → フロントは Nuxt 3 を採用 (2026-05-01 切替)。React/JSX 概念で語らない、Vue 3 Composition API で説明する

## UI

UI は **Claude Design** で作成して Anthropic Design API Handoff で取り込む。

- Hoshino リゾート風: クリーム `#FCF5EF` + 暖オレンジ `#D95300` + Mohave 巨大英字 + Noto Sans JP + Albert Sans
- design tokens は `apps/web/assets/css/styles.css` の CSS variables (`--bg-0` / `--ink-0` / `--accent` 等)
- 画面構造: 左レール (5階 ceremonies) + ヘッダ (Backlog/Events Segmented Control) + メイン + 右 Integrity AI panel

## ドキュメント単一情報源

| Topic | File |
|---|---|
| What we're building & why | `PRODUCT_BRIEF.md` |
| GCP↔AWS architecture | `ARCHITECTURE.md` |
| Firestore / type schema | `DATA_MODEL.md` |
| Multi-agent design + autonomy levels | `AGENT_DESIGN.md` |
| Prompt engineering guide | `docs/PROMPTING_GUIDE.md` |
| Hackathon compliance | `HACKATHON_COMPLIANCE.md` |
| Timeline | `ROADMAP.md` |
| 3-min pitch script | `PITCH.md` |
| Claude vs user task split | `PROJECT_PLAN.md` |
| GCP first-time setup | `docs/setup-gcp.md` |
| GitHub Actions ↔ GCP WIF | `docs/setup-github-wif.md` |

新しい top-level `*.md` を勝手に作らない。既存のものを更新する。

## 大規模方針変更が頻出する性質

以下のクラスの変更が頻出する → 着手前に 1 問の確認 (CLAUDE.md「Common gotchas」参照):

- 再ブランド (旧称「風車 / Kazaguruma」→ Belvedere は完了 / 2026-05-05 に内部識別子も `@belvedere/*` / `belvedere-*` に統一)
- データモデル改編 (例: WindEvent 完全廃止 / Project エンティティ追加 / 階層 3→4)
- 儀式の追加・削除・順序変更 (5儀式の確定: Planning → Daily → Refinement → Review → Retrospective)
- Refinement Agent の責務観点の再定義 (5観点)
- Agent autonomy level (L0–L4) のデフォルト変更

無確認で進めると **コード・docs・mock LLM 応答・seed・Pitch まで一括書き換え** が発生。確認内容は具体的な選択肢 (A/B/C 案) で出す。

> CLI コマンド / .claude/ オートメーション / 意図的未実装 / seed-guard 迂回手順は `CLAUDE.md` 参照。
