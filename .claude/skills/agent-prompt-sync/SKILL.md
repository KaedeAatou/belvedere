---
name: agent-prompt-sync
description: Belvedere の TS prompt (`packages/agent/src/prompts.ts`) と Python ADK instruction (`apps/orchestrator-py/src/orchestrator/agents.py`) のキーワード差分を検出し、Mock LLM の役割判定 (英語 Agent 名: Planner / Daily / Refinement / Reviewer / Retrospective / Orchestrator) が壊れていないか確認する。Use this skill whenever the user edits or mentions `prompts.ts` / `agents.py` / agent 責務 / 5 儀式 Agent / Mock LLM ルーティング / Refinement の観点 / Reviewer の Multimodal — 片方だけ変えるとピッチ・デモ・テストが連鎖崩壊するため必ずチェックすること。`prompt-quality-reviewer` Subagent と並行して呼んで構わない (役割が補完的: こちらは drift 検出、あちらは prompting 品質)。
color: green
---

# Agent Prompt Sync

Belvedere プロジェクトでは、5儀式エージェント + Orchestrator の責務記述が **2箇所** に書かれている:

1. `packages/agent/src/prompts.ts` の `PER_AGENT[name]` (TS側、Mock LLMが起動時に渡す)
2. `apps/orchestrator-py/src/orchestrator/agents.py` の `*_INSTRUCTION` 定数 (Python側、ADKに渡す)

`packages/llm/src/mock.ts` の `detectRole` 関数は **system prompt 内の英語Agent名** で役割を判定している:

```ts
if (/Planner Agent/.test(sys)) return 'planner';
if (/Refinement Agent/.test(sys)) return 'refinement';
if (/Daily Agent/.test(sys)) return 'daily';
if (/Reviewer Agent/.test(sys)) return 'reviewer';
if (/Retrospective Agent/.test(sys)) return 'retrospective';
if (/Orchestrator/.test(sys)) return 'orchestrator';
```

そのため、**英語Agent名が TS prompt から消えると Mock LLM の役割判定が壊れる**。Python 側は ADK が直接ルーティングするので Agent 名は必須ではないが、責務記述は TS と整合している必要がある (ピッチ・ドキュメントとの一貫性)。

廃止済キーワード (2026-04-30/05-01): 翼メタファー (北翼/東翼/南翼/西翼) / 風 (WindEvent) / WingScore / 風車 (Kazaguruma 旧称) / 「価値タグ」(造語)。Agent の役割は **チケット品質補助 (DoD/SP/User Story紐付け) + 5儀式運営補助 + 健全性可視化 + バックログリファインメント診断 (粒度/依存/valueImpact/priority↔valueImpact ミスマッチ/SP分散)** に統一されている (詳細は `AGENT_DESIGN.md` / `PRODUCT_BRIEF.md`)。

## このスキルの役割

両ファイルを読み比べて以下を出す:
1. 6ロール (planner / refinement / daily / reviewer / retrospective / orchestrator) ごとに、TS と Python で言及されている責務の主要キーワードを抽出
2. 片方にしかないキーワードや、矛盾する責務記述を一覧
3. Mock LLM の `detectRole` が依存する英語 Agent 名が TS 側に残っているか確認
4. 廃止済キーワード (北翼/東翼/南翼/西翼/WindEvent/WingScore/風車/価値タグ) が混入していないか確認
5. もし更新が必要なら、両ファイルを揃える具体的な修正案を提示

## 実行手順

1. `packages/agent/src/prompts.ts` を Read
2. `apps/orchestrator-py/src/orchestrator/agents.py` を Read
3. `packages/llm/src/mock.ts` の `detectRole` 関数を Read (依存キーワードの確認)
4. ロール別に責務文を抽出して比較表を作る
5. 不整合 or 廃止済キーワード混入があれば箇条書きで報告、修正案も併記する
6. 整合していたら「✅ 両ファイル整合、Mock LLM ルーティングOK」だけ返す

## 出力フォーマット例

```
## Agent prompt sync report

| Role | TS keywords | Python keywords | Drift |
|---|---|---|---|
| planner | Planner Agent, Sprint Goal, SP容量, 品質診断 (DoD/SP/US紐付け) | Sprint Goal, 容量, 品質診断 | ✅ |
| refinement | Refinement Agent, 粒度過大, 依存, valueImpact, priority×valueImpact, SP分散 | 粒度, 依存, valueImpact, ミスマッチ | ✅ |
| daily | Daily Agent, Velocity整合, 2日完了率, 3日停滞 | Velocity, 2日完了, 停滞 | ✅ |
| reviewer | Reviewer Agent, デモシナリオ, preview URL | デモシナリオ, preview URL | ✅ |
| retrospective | Retrospective Agent, Try抽出, WIP転記 (L2), CeremonyHealthScore | Try抽出, WIP転記, 健全性 | ✅ |
| orchestrator | Orchestrator, ルーティング | ルーティング | ✅ |

Mock LLM 正規表現キー: Planner Agent / Refinement Agent / Daily Agent / Reviewer Agent / Retrospective Agent / Orchestrator — TS prompt に全存在 ✅
廃止済キーワード混入: なし ✅
```

不整合 or 廃止済キーワード混入がある場合は、修正パッチも示すこと。
