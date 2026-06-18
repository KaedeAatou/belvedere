---
name: agent-prompt-sync
description: Belvedere の TS prompt (`packages/agent/src/prompts.ts`) と Python ADK instruction (`apps/orchestrator-py/src/orchestrator/agents.py`) のキーワード差分を検出し、Mock LLM の役割判定 (英語 Agent 名: Planner / Daily / Refinement / Reviewer / Retrospective / Orchestrator) が壊れていないか確認する。Use this skill whenever the user edits or mentions `prompts.ts` / `agents.py` / agent 責務 / 5 儀式 Agent / Mock LLM ルーティング / Refinement の観点 / Reviewer の Multimodal — 片方だけ変えるとピッチ・デモ・テストが連鎖崩壊するため必ずチェックすること。`prompt-quality-reviewer` Subagent と並行して呼んで構わない (役割が補完的: こちらは drift 検出、あちらは prompting 品質)。
color: green
---

# Agent Prompt Sync

Belvedere プロジェクトでは、5儀式エージェント + Orchestrator の責務記述が **2箇所** に書かれている:

1. `packages/agent/src/prompts.ts` の `PER_AGENT[name]` (TS側、Mock LLMが起動時に渡す)
2. `apps/orchestrator-py/src/orchestrator/agents.py` の `*_INSTRUCTION` 定数 (Python側、ADKに渡す)

`packages/llm/src/mock.ts` の `detectRole` 関数は **二段化** されている (R1 / 2026-06-18):

```ts
// 1段目 (一次 anchor): buildSystemPrompt が先頭行に埋める機械可読 `Agent-Id: <name>` (AgentName リテラル)
const idMatch = sys.match(/^Agent-Id:[^\S\n]*([a-z]+)/im);
if (idMatch && isRoutableRole(idMatch[1].toLowerCase())) return idMatch[1].toLowerCase();
// 2段目 (fallback): 人間向け `Your role: <Role>` 文の英語 Agent 名
if (/Your role: Planner Agent/i.test(sys)) return 'planner';
if (/Your role: Refinement Agent/i.test(sys)) return 'refinement';
// ... daily / reviewer / retrospective / orchestrator も同様
```

そのため `prompts.ts` の `buildSystemPrompt` は **2 つの anchor を保つ**こと:
- **1 行目 `Agent-Id: ${name}`** (AgentName リテラル / 一次 anchor) — これが消えると Gemini フェーズで人間向け文を編集したとき役割判定が静かに壊れる。R1 が導入した編集耐性の要。
- **2 行目 `Your role: <X> Agent`** (英語 Agent 名 / fallback anchor) — 従来からの人間向け表記。これも消すと fallback が効かなくなる。

**Agent-Id は TS prompt 専用** (Python `agents.py` には足さない)。理由: Python は ADK 実ルーティングで mock detectRole を使わず、FastAPI stub が `INSTRUCTIONS[name].strip().splitlines()[1]` で責務行を抜くため、先頭に Agent-Id 行を入れると stub 出力がずれる。Python 側は ADK が直接ルーティングするので Agent 名は必須ではないが、責務記述は TS と整合している必要がある (ピッチ・ドキュメントとの一貫性)。

回帰ガード: `packages/llm/test/mock.test.ts` (Agent-Id 単独 routing / 優先順位 / 行頭限定) と `packages/agent/test/prompt-routing.test.ts` (実 buildSystemPrompt 出力 → 6 role) が両 anchor を固定している。prompt 編集後はこの 2 テストを流す。

廃止済キーワード (2026-04-30/05-01): 翼メタファー (北翼/東翼/南翼/西翼) / 風 (WindEvent) / WingScore / 風車 (Kazaguruma 旧称) / 「価値タグ」(造語)。Agent の役割は **チケット品質補助 (DoD/SP/User Story紐付け) + 5儀式運営補助 + 健全性可視化 + バックログリファインメント診断 (粒度/依存/valueImpact/priority↔valueImpact ミスマッチ/SP分散)** に統一されている (詳細は `AGENT_DESIGN.md` / `PRODUCT_BRIEF.md`)。

## このスキルの役割

両ファイルを読み比べて以下を出す:
1. 6ロール (planner / refinement / daily / reviewer / retrospective / orchestrator) ごとに、TS と Python で言及されている責務の主要キーワードを抽出
2. 片方にしかないキーワードや、矛盾する責務記述を一覧
3. Mock LLM の `detectRole` が依存する 2 anchor を確認:
   - 1段目 `Agent-Id: <name>` が `buildSystemPrompt` 先頭行に全 6 role 分あるか
   - 2段目 `Your role: <X> Agent` の英語 Agent 名が TS 側に残っているか
4. 廃止済キーワード (北翼/東翼/南翼/西翼/WindEvent/WingScore/風車/価値タグ) が混入していないか確認
5. もし更新が必要なら、両ファイルを揃える具体的な修正案を提示

## 実行手順

1. `packages/agent/src/prompts.ts` を Read (`buildSystemPrompt` の Agent-Id 行 + `Your role:` 行を確認)
2. `apps/orchestrator-py/src/orchestrator/agents.py` を Read
3. `packages/llm/src/mock.ts` の `detectRole` 関数を Read (二段化 anchor の確認)
4. ロール別に責務文を抽出して比較表を作る
5. 不整合 or 廃止済キーワード混入があれば箇条書きで報告、修正案も併記する
6. 整合していたら「✅ 両ファイル整合、Mock LLM ルーティング (Agent-Id + Your role 二段) OK」だけ返す

## 出力フォーマット例

```
## Agent prompt sync report

| Role | TS keywords | Python keywords | Drift |
|---|---|---|---|
| planner | Planner Agent, Sprint Goal, 計画SP vs velocity, 品質診断 (DoD/SP/US紐付け) | Sprint Goal, velocity, 品質診断 | ✅ |
| refinement | Refinement Agent, 粒度過大, 依存, valueImpact, priority×valueImpact, SP分散 | 粒度, 依存, valueImpact, ミスマッチ | ✅ |
| daily | Daily Agent, Velocity整合, 2日完了率, 3日停滞 | Velocity, 2日完了, 停滞 | ✅ |
| reviewer | Reviewer Agent, デモシナリオ, preview URL | デモシナリオ, preview URL | ✅ |
| retrospective | Retrospective Agent, Try抽出, WIP転記 (L2), CeremonyHealthScore | Try抽出, WIP転記, 健全性 | ✅ |
| orchestrator | Orchestrator, ルーティング | ルーティング | ✅ |

Mock detectRole 1段目 (Agent-Id anchor): buildSystemPrompt 先頭行 `Agent-Id: <name>` 全 6 role に存在 ✅
Mock detectRole 2段目 (Your role fallback): Planner / Refinement / Daily / Reviewer / Retrospective / Orchestrator Agent 名 TS prompt に全存在 ✅
Agent-Id は agents.py には不在 (= 意図通り / Python stub の splitlines 保護) ✅
廃止済キーワード混入: なし ✅
```

不整合 or 廃止済キーワード混入がある場合は、修正パッチも示すこと。
