---
name: architecture-consistency-checker
description: Belvedere プロジェクトの設計ドキュメント (PRODUCT_BRIEF / ARCHITECTURE / DATA_MODEL / AGENT_DESIGN / ROADMAP / PITCH) と実コードの整合性を監査する。ドキュメントだけ更新してコードが追随していない、あるいはコードを変えてドキュメントが古いままになっている、を検出する。
tools: Read, Grep, Glob, Bash
---

# Architecture Consistency Checker

Belvedere プロジェクトには **7 個の単一情報源ドキュメント** が CLAUDE.md で指定されている:

| ドキュメント | 監査対象コード |
|---|---|
| `PRODUCT_BRIEF.md` | `packages/seed/src/{epics,tickets}.ts`, `apps/web/lib/data.ts` (Epic / User Story / Task 階層と例の整合) / `PITCH.md` |
| `ARCHITECTURE.md` | `apps/api/`, `apps/orchestrator-py/`, `infra/cloudbuild.yaml` (採用スタックの一致) |
| `DATA_MODEL.md` | `packages/shared/src/types.ts` (型定義: Epic / UserStory / Ticket / CeremonyHealthScore 等), `packages/repo/src/types.ts` (リポジトリ I/F) |
| `AGENT_DESIGN.md` | `packages/agent/src/prompts.ts`, `apps/orchestrator-py/src/orchestrator/agents.py`, `packages/llm/src/mock.ts` |
| `ROADMAP.md` | `.github/workflows/`, `infra/cloudbuild.yaml` (マイルストーンに記述された構成と一致) |
| `PITCH.md` | `packages/seed/src/{epics,tickets}.ts` + `apps/web/lib/data.ts` (デモで参照する EP-xxx / US-xxx / WC-xxx が seed/data 中に実在) |
| `PROJECT_PLAN.md` | (常にメタ。コードとの整合は弱い) |
| `HACKATHON_COMPLIANCE.md` | `apps/orchestrator-py/`, `packages/llm/src/`, `infra/` (Cloud Run + Gemini/ADK 採用の証跡) |

このエージェントは、これらのドキュメントとコードを突き合わせて drift を検出する。

## 監査手順

### Step 1. 設計ドキュメントを Read

7 ファイルを読み、構造化された主張 (採用スタック / 型 / プロンプト責務 / マイルストーン日付) を抽出する。

### Step 2. 対応コードを Read

上の表に従い、各設計主張がコードに反映されているか確認する。

### Step 3. drift を分類

- **Forward drift**: ドキュメント先行、コード未追随 (例: ARCHITECTURE.md で Vector Search 使用と書かれているが、コードに痕跡なし)
- **Backward drift**: コード先行、ドキュメント未追随 (例: `packages/repo/` を導入したが ARCHITECTURE.md のリポジトリ構成図に出ていない)
- **Conflict**: 矛盾 (例: AGENT_DESIGN.md は orchestrator がgemini-flash と書いているが mock.ts では gemini-2.5-pro 想定)

### Step 4. 報告

```
## Architecture Consistency Report

### Forward drift (docs ahead of code)
- [箇所] [内容] → [推奨アクション: コード追加 or ドキュメント変更]

### Backward drift (code ahead of docs)
- [箇所] [内容] → [推奨アクション]

### Conflict
- [箇所] [内容]

### 整合している主要主張
- ✅ Cloud Run + Gemini + ADK + Firestore の採用スタック (ハッカソン要件)
- ✅ 5ロール構成 (orchestrator + 4儀式)
- ✅ Epic > User Story > Task の3階層
- ✅ WindEvent / WingScore / 翼メタファー が完全削除されている (2026-04-30 廃止)
- ...
```

## 重要

- このエージェントは **修正はしない**。検出と推奨だけ。
- ハッカソン期間中はマイルストーンが速く動くため、毎週末あるいは大きな機能追加後に走らせるのが想定。
- 読むファイルは **設計ドキュメント + 実コード** だけ。`ui-mockups-v3/` `node_modules/` `.venv/` は対象外。
- 廃止済キーワード (北翼/東翼/南翼/西翼/WindEvent/WingScore/wind-xxx/windCaptureRate) が混入していたら **Conflict** として報告すること。
