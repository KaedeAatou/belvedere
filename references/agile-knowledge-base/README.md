# Belvedere — アジャイル知識ベース (Agile Knowledge Base)

> 作成: 2026-06-09 / 用途: Belvedere AI Agent が参照する **L2 静的知識層**
> Phase 3 末 (7/3-9) で Elastic + Gemini Embeddings にこのディレクトリの内容を index 化し、Refinement / Retrospective Agent が RAG で横断検索する。

---

## 知識の 3 階層

| 階層 | 何 | 場所 | 更新頻度 |
|---|---|---|---|
| **L1: prompt 埋め込み** | Agent が常時参照する基本ルール (Refinement 6 観点 / Daily 停滞検出 / Retrospective KPT 抽出 等) | `packages/agent/src/prompts.ts` + `apps/orchestrator-py/src/orchestrator/agents.py` (XML 構造化済) | 設計変更時のみ |
| **L2: 静的 markdown (このディレクトリ)** | 公式 Scrum Guide 抜粋 / 儀式別ベストプラクティス / 用語集 / 引用可能フレーズ | `references/agile-knowledge-base/*.md` | 月次レビュー (新しい公式更新があれば) |
| **L3: Elastic + Gemini Embeddings** | L2 + チーム固有の振り返り (Ceremony.tries[]) / 過去の Refinement findings / 解決事例 | Elastic Cloud (Phase 3 末で構築) | チームの儀式ごとに自動 ingest |

---

## なぜ「毎回ネット参照」しないか

LLM の hallucination (もっともらしいウソ) を防ぐため、Belvedere の Agent は **必ず引用可能な静的知識源だけを根拠にする**。「公式 Scrum Guide §2.3 によると...」のように source ID を提示できることが差別化軸。

ネットから動的に情報を取る場合は:
1. `human.ask` ツールでユーザーに「最新の出典を教えて」と問う
2. or `web.fetch` ツールで明示的に取得し source URL を提示

→ Agent が独断で「最新と思われる」情報を生成することは禁止 ([[prompts.ts dont 節]] 参照)。

---

## ファイル一覧 (Phase 1-B 末時点)

| ファイル | 出典 | 参照する Agent | 想定行数 |
|---|---|---|---|
| `scrum-guide-2020.md` | Scrum Guide 2020 (Ken Schwaber & Jeff Sutherland) [CC BY-SA 4.0] | 全 Agent | 200 行 |
| `refinement.md` | Atlassian Agile Coach + Mike Cohn "Agile Estimating and Planning" | Refinement / Planner | 200 行 |
| `daily-scrum.md` | Scrum Guide §6.1 + Mountain Goat Software blog | Daily | 150 行 |
| `retrospective.md` | Esther Derby & Diana Larsen "Agile Retrospectives" + KPT / Mad-Sad-Glad / 4Ls / 5 Whys | Retrospective | 250 行 |
| `definition-of-done.md` | Scrum Guide §3 + Atlassian DoD ガイド | Planner / Refinement / Reviewer | 150 行 |
| `story-points.md` | Mike Cohn "Agile Estimating" + Planning Poker | Planner / Refinement | 150 行 |
| `ticket-types.md` | Scrum Guide + Scrum.org + Mike Cohn + ITIL/SRE (2026-06-10 追加) | 全 Agent (ルールエンジンの出典) | 120 行 |

---

## チーム固有の振り返り内容の取扱い (Phase 3 で実装)

ユーザー企業ごとの過去 Retrospective (Ceremony.tries[]) は L3 Elastic の **テナント別 index** に蓄積される。Refinement Agent が「テストが遅い」相談を受けた時、まず:
1. **L2 の `refinement.md`** で標準ベストプラクティスを参照
2. **L3 (テナント別 Elastic)** で過去 Try を横断検索 → 「3 スプリント前に同じ問題で 'CI を pull-only にする' という Try が出ていた」を提示
3. **L1 prompts.ts** の Refinement 6 観点ロジックで指摘を生成

この 3 層が組み合わさることで、汎用ベストプラクティス + チーム固有の歴史 + Agent ロジックを統合した提案が出る。

---

## マルチテナント分離 (Phase 3 設計)

Elastic index は workspace 単位で分離:
- `belvedere-kb-scrum` (L2 全社共通)
- `belvedere-kb-tries-{workspaceId}` (L3 テナント別)

検索クエリ時は `index: belvedere-kb-scrum,belvedere-kb-tries-${ctx.workspaceId}` で両方を横断 (テナント越境は不可)。これによりユーザー A のチームの振り返りがユーザー B に漏れない。

---

## L2 更新運用

- 公式 Scrum Guide の改訂 (現行 2020 版) があった場合: 該当ファイルを更新 + commit
- 新しいフレームワーク採用 (例: SAFe / LeSS) が必要になった時: 新規ファイル追加 + 本 README に追記
- ハッカソン提出 (7/10) までは Scrum Guide 2020 + Atlassian + Mike Cohn の 3 軸に絞る

---

## 関連

- `packages/agent/src/prompts.ts` - L1 prompt 埋め込み (XML 構造化済)
- `ROADMAP.md` Phase 3 末 (7/5-9) - Elastic + Gemini RAG 実装計画
- `ARCHITECTURE.md` §3 案A - Vector Search (Elastic に差し替え)
