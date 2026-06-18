# Phase A 実装プラン（承認待ち / 2026-06-18 夜 自走で作成）

> このドキュメントは**提案（PROPOSAL）**です。実装前にユーザー承認が要る決定を §4 にまとめています。
> 9-agent ワークフロー (`organize-autonomous-run`) の調査結果を統合。詳細根拠は各 file:line を参照。

## 0. 夜間自走で完了したこと（承認不要・実装済）

| | 内容 | commit | 状態 |
|---|---|---|---|
| A | 設計を合意モデル（SM 単一窓口/協議・スケジュール無し・L1L2・Slack 除去）へ + GEM 矛盾修正 | `336c55a` | CI green |
| B | agent→model マップ集約（Orchestrator/Daily=flash, 他=pro）+ ハードコード除去 | `57ff9c7` | CI/Deploy/E2E 全 green |
| C | Gemini 疎通検証（無料枠キー）+ ドット名ツール（`ticket.list` 等）実機検証 | — | ✅ 受理・tool_call 成功＝**リネーム不要** |

---

## 1. Orchestrator「単一窓口＋協議」実装プラン（承認待ち）

3 案（MVP最小 / リスク先回り / 段階的移行）を judge し統合。**骨格=段階的移行 / 検証層=リスク先回りの純粋関数ガード+コストキャップ / スコープ=MVP規律**。

**配線方式（核）**: 既存 `POST /api/agents/:name` を**温存**（web/MCP/CLI/smoke が依存）。協議は `name==='orchestrator'` のハンドラ内部に閉じ、Orchestrator の tools にだけ新 tool `agent.invoke` を 1 個足し、in-process で子 `runAgent` を再帰起動（HTTP 往復なし＝workspaceId closure と auth を継承）。子には `agent.invoke` を渡さない＝**深さ1固定で無限協議を物理的に断つ**。`AgentRun` に `childRuns` を追加（既存 summary 経路不変＝後方互換）。

**段階（各フェーズ単独 revert 可）**:
- **0**: characterization test で現状固定（orchestrator は今 routedTo を返すだけ＝空ハブ）。`AGENT_MODEL`↔`agents.py` の agent 集合一致ガード。
- **1**: web の AI パネル送信を `/api/agents/orchestrator` に向ける **feature flag**（既定 OFF・回帰ゼロ）。
- **2**: `agent.invoke` tool を buildTools に追加 → orchestrator のみに渡す。子 runAgent 再帰 + 自己参照/未知名 reject。
- **2-validate**: 引数検証を純粋関数 `validateInvocation` に切り出し**退化入力を直接テスト**（testing.md）。1 リクエスト costUsd ハードキャップ（Mock=0 で CI 無害）。
- **3**: Mock LLM の orchestrator 戦略 + `prompts.ts` の Orchestrator 責務を「単一窓口=協議統括」へ改稿（**agent-prompt-sync + mock-llm-reviewer 必須**・英語 Agent 名/anchor 保持）。
- **4**: 統合テスト（childRuns・IDOR 越境不可・コスト集計を assert）。e2e は 2xx 存在のみ。
- **5**（任意）: 双方向協議（Refinement→Planner velocity 照会＝§9）。深さ 1→2 で循環検出を導入してから許可。
- **6**（ピッチ専用・隔離）: `USE_REAL_ADK=true` のデモ経路でのみ ADK 編成を実体化。本番 web は TS in-process のまま。

**主なリスクと対策**: 無限協議→深さ1固定+自己参照禁止+maxIterations / Mock 役割判定崩壊（最大リスク）→review subagent 必須 / **tool 名ドット問題→C で実機検証済（Gemini はドット受理）だが `agent.invoke` の命名は §4 で確認** / IDOR→子に親 workspaceId closure / autonomy→子は read/diagnose 系に限定（書込 tool 走らせない）。

---

## 2. epic 機能（WC-2860a6e2）決定パッケージ（承認待ち）

ユーザー決定: 「Story を作れる儀式で Epic も作成可 ＋ Story 作成時に**必ず**親 Epic 選択」。

**判明した実態（朗報）**: `Ticket.epicId?` は型・スキーマに既存（types.ts:94 / schemas.ts:85）、Epic CRUD も API 完成済（epic-handlers.ts）。**shared 層は変更不要**。足すのは「API が epicId を受ける + UI 入力欄 + create 時必須化」。

**⚠️ blast radius（必須化が壊す既存フロー）**:
- `crud-handlers.test.ts:64`（story を epicId 無しで作成）/ `estimation.spec.ts:20`（e2e が UI で epicId 無し story 作成）/ `create-dev-workspace.ts`（dev seed script）/ MCP `ticket_create`（epicId 無し）/ Mock LLM・`prompts.ts`（agent が epicId 無し story 生成）→ いずれも必須化で 400。
- **既存 seed（WC-101..112 の story 10 件・epicId 0 件）は無傷**（必須化を create 経路のみに限定すれば read/list/PATCH に触れない。TicketSchema 全体や PATCH に refine を掛けないこと）。

**A/B/C（要選択）**:
- **A（最も「必ず」に忠実・推奨）**: 全 type='story' の create に epicId 必須（server `.refine`）。**分割子 Story は親の epicId を継承**。cascade（e2e helper・dev script・1 unit test・MCP・prompts）も同時更新。blast radius 大だが網羅的。
- **B**: Backlog の新規 Story 起票のみ必須（UI + create refine）、分割子は親継承/任意。中間。
- **C**: 任意のまま + UI で強く推奨（selector は出すが server 必須化なし）。blast radius 最小だが「必ず」にならない。

**推奨 = A**（「必ず」に忠実 + 分割子は親継承で分割フロー維持。blast radius は管理可能）。実装順は §steps（ワークフロー出力）参照。

**追加の小決定**: ① Epic 存在検証（fabricated EP-xxx を 400 で弾く）を入れるか zod 形式のみか ② MCP に `epic_create`/`ticket_create.epicId` を今回含めるか。

---

## 3. code↔doc 整合 to-do（Slack 除去・承認済み方向 / Orchestrator §3 と同時実行）

設計で Slack を全除去したが、コードに残骸 7 件（ワークフロー scan）。**Orchestrator フェーズ3 の prompts.ts/mock.ts 改稿と同じ review pass で一括処理**:
- `prompts.ts:116`（Daily の Slack要約/L3）→ AI パネル提示(L2) に書換
- `prompts.ts:166`（Reviewer の Slack通知文）→ AI パネル提示に書換
- `mock.ts:255,345,360`（Slack #channel 投稿表現 3 件）→ AI パネル表示に書換
- `packages/tools/src/index.ts:258-275`（`slackPostTool` 定義）→ 削除 + 330 行の tools 配列から除去
- ※ `slack.message.post` を参照する Mock/test の有無を実装時に確認（mock-llm-reviewer で role 判定維持）

---

## 4. 朝に承認してほしい決定（まとめ）

1. **epic 必須化スコープ**: A（全 story 必須・分割子継承・推奨）/ B（Backlog のみ）/ C（任意+UI推奨）
2. **Orchestrator prompt 責務再定義**（project.md 大規模変更条項）: A案（時刻ルーティング廃止・窓口一本化）/ B案（時刻ルーティング残し窓口追加）/ C案（窓口は web flag のみ・prompt 据え置き）
3. **`agent.invoke` の命名**: ドット（`agent.invoke`・既存統一）/ アンダースコア（`agent_invoke`・実 Gemini 安全側）。※ C でドット受理は確認済だが協議 tool は要最終確認
4. **web の窓口切替 feature flag 既定**: ON / OFF（推奨 OFF で回帰ゼロ start）

> 承認をもらえれば、Orchestrator は §1 の段階で（フェーズ0→）実装、epic は選んだ案で実装し、いずれも test→push→CI→review まで回します。
