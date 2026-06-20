# 継続的改善設計 — 「まわす」軸の実装設計 (Elastic RAG + agent eval)

> **このドキュメントの位置づけ**: ハッカソン公式 (Google Cloud ブログ) が評価コンセプトを **「つくる・まわす・とどける」** の 3 軸で定義し、中央の **「まわす = CI/CD など DevOps のフローを構築し、AI を継続的に改善するサイクルを回す」** を据えている。本ドキュメントは Belvedere がこの **「まわす」** に正面から答えるための設計をまとめる。
>
> **スコープ**: 設計のみ。実装は**別セッション**で行う (§6 引き継ぎ参照)。設計と「まわす」軸の接続を常に意識すること。
> 出典: https://cloud.google.com/blog/ja/products/ai-machine-learning/devops-ai-agent-hackathon-2026?hl=ja
> 関連: `CLAUDE.md` / `AGENT_DESIGN.md` / memory `project_elastic_gemini_rag_plan`

---

## 0. 「まわす」を 2 つの仕組みに分解する

「まわす = AI を継続的に改善するサイクル」は、性質の異なる 2 枚看板で実現する。混同しないこと。

| | 何をする | 性質 | Belvedere の実体 |
|---|---|---|---|
| **A. 使うほど賢くなる (改善)** | プロダクトを使うほど AI の入力 (知識・文脈) が増え、提案がそのチームに最適化されていく | **改善** (賢くなる) | ① Retro Try → Agent コンテキスト供給 (**既に動作**) → ② Elastic RAG で意味検索化・スケール (**本設計**) |
| **B. 後退させない (品質担保)** | プロンプト/ルールを変えても AI の判断品質が落ちないよう CI で守る | **担保** (劣化防止) | agent eval を CI ゲートに (**本設計**) |

> **重要な区別**: eval は「改善」ではなく「劣化防止」。真に AI を賢くするのは A の知識ループ。両方そろって初めて「安心して回せる改善サイクル」になる。

「まわす」前半 (CI/CD フロー) の実体は既存: **WIF 鍵レスデプロイ / `pnpm test` 462 件を push でゲート / e2e (Playwright) / deploy-api・deploy-web 分離**。本ドキュメントは後半 (AI を改善するサイクル) を扱う。

---

## 1. 既に実装済みのもの (正確な棚卸し)

次セッションが「何が在って何を作るか」を取り違えないための事実 (調査済 / コード根拠つき)。

### 1-1. Retro Try → Agent 改善ループ ✅ 完全動作
- `packages/agent/src/prompts.ts` の `COMMON_RETRO_STEP` で、**全 6 ロール**が実行開始時に `retro.tries.list` を呼び、`done=false` の Try を「自分の儀式で検出するプロセスルール」として動的に取り込む。
  - 例: Try「AC に期日を入れる」→ Refinement が期日なし AC を指摘 / Try「BLOCKED 時は理由を書く」→ Daily が理由なし BLOCKED を検出。
- 保存先: `RetroTryRepository.list({workspaceId})` → Firestore collection `retroTries` (`packages/repo/src/firestore.ts`)。`RetroTry` 型 = `{id, workspaceId, text, sprintNumber, sprintId?, done, createdAt, createdBy}` (`packages/shared/src/types.ts`)。
- **意味**: ふりかえり (儀式) を回すほど、チーム固有の改善ルールが増え、Agent の検出基準が育つ。**Belvedere の儀式そのものが AI を育てる**最も本質的な改善ループ。これは新規実装不要で、図とストーリーで「まわす」として見せ切る。

### 1-2. RAG 検索層 (KnowledgeSearcher) ✅ ツール配線まで完了 (呼出指示は §3-3① で未実装) / 本番 OFF
- 抽象: `packages/tools/src/knowledge.ts`
  - `interface KnowledgeSearcher { name; search(query, opts: {workspaceId, topK?}): Promise<KnowledgeHit[]> }`、`KnowledgeHit = {sourceId, title, text, score}`。
  - `MockKnowledgeSearcher` (キーワード一致 / 決定的 / テスト・CLI 用)。
  - `ElasticKnowledgeSearcher` (Elastic Cloud `_search` を `query:{semantic:{field, query}}` = **ELSER 前提**で叩く / `Authorization: ApiKey`)。
  - index 決定: `${kbIndex},${triesIndexPrefix}${workspaceId}` = **全社 `belvedere-kb-scrum` + テナント別 `belvedere-kb-tries-<ws>`** を `ignore_unavailable=true` で横断。
  - `createKnowledgeSearcher(backend, cfg)`: `none`(既定→`undefined`) / `elastic` / `mock`。env (`SEARCH_BACKEND` / `ELASTIC_URL` / `ELASTIC_API_KEY`) は**呼出側が読む**。
- ツール: `packages/tools/src/index.ts` で `deps.knowledge` が注入された時のみ `knowledge.search` ツールを tools 配列に push (未注入なら出さない = Mock/CLI 温存)。
- 注入配線: `apps/api/src/index.ts` が env を読み `createKnowledgeSearcher(...)` → `createApp({repo, llm, knowledge})` → `app.ts` が `buildTools` / `buildOrchestratorTools` 双方に渡す。**= 配線は既に通っている**。
- runtime: `packages/agent/src/runtime.ts` の `runAgent` ループ (`thought→tool_call→tool_result→output` / `maxIter=6`) は、`knowledge.search` がツール登録されていれば**特別な改修なしで自然に呼べる**。

> つまり「Elastic を点火する」= ゼロから作るのではなく、**残り 4 点の配線 + 運用**を足すだけ (§3-3)。

---

## 2. 全体アーキテクチャ (Firestore=正本 / Elastic=意味検索層)

```
                  ┌─────────────── 書き込み (正本) ───────────────┐
   儀式の運営 ──▶  Firestore (retroTries / tickets / epics)  ←── 既存・変更なし
        │                         │
        │                         │ (indexer: 次セッションで実装)
        │                         ▼
        │              Elastic Cloud  index:
        │                belvedere-kb-scrum         (全社共通 / Scrum Guide・DoD・SP 等)
        │                belvedere-kb-tries-<ws>    (テナント別 / チーム自身の Try) ← 使うほど増える
        │                         ▲
        ▼                         │ semantic search (多言語E5 / semantic_text)
   Agent (Refinement/Planner/...) ─┘  ※ knowledge.search ツール (配線済) + prompts.ts 指示 (未)
```

- **Firestore は唯一の正本**。Elastic は意味検索の読み取り専用レプリカ的位置づけ (LLM 抽象 / Repo 抽象と同じ「差し替え可能な層」思想)。
- **使うほど賢くなる根拠**: チームが Retro を回すほど `belvedere-kb-tries-<ws>` が増え、Agent が `knowledge.search` で「今のチケットに**関連する**過去 Try + Scrum 標準」を意味検索で引けるようになる。素朴な全件供給 (Retro loop) → 関連だけを意味検索 (RAG) への進化。

---

## 3. Elastic RAG 設計

### 3-1. index 設計
| index | スコープ | 内容 | semantic field |
|---|---|---|---|
| `belvedere-kb-scrum` | 全社共通 | Scrum Guide 抜粋 / DoD の良い例 / Story Point の考え方 / WSJF など (静的コーパス) | `content` (多言語E5 / semantic_text) |
| `belvedere-kb-tries-<workspaceId>` | テナント別 | そのチームの `RetroTry.text` (+ 将来は ticket/epic の要約) | `content` (多言語E5 / semantic_text) |

- ドキュメント形: `{ sourceId, title, content }` (`KnowledgeHit` にマップ)。`sourceId` は引用用 (`US-xxx` / `try:<id>` / `scrum-guide#xx`)。
- テナント越境防止: 検索の index 名は `knowledge.search` ツールが `workspaceId` を closure で固定し LLM に選ばせない (既存の IDOR 思想と一致 / 実装済)。

### 3-2. 既存コードの接続点 (変更しない / そのまま使う)
- `ElasticKnowledgeSearcher` (`packages/tools/src/knowledge.ts`) — 検索クエリは実装済。ELSER 既定。
- env: 本番 Cloud Run に `SEARCH_BACKEND=elastic` / `ELASTIC_URL` / `ELASTIC_API_KEY` を与えると点火 (現状 `none` で無効 = 本番ゼロ影響)。`ELASTIC_API_KEY` は Secret Manager 管理。

### 3-3. 未実装配線 (= 次セッションの作業) — 4 点

1. **prompts.ts に `knowledge.search` 呼び出し指示を追加** (現状ゼロ / grep 確認済)
   - `COMMON_RETRO_STEP` と並ぶ `COMMON_KNOWLEDGE_STEP` を新設し、`buildSystemPrompt` に含める。様式は `COMMON_RETRO_STEP` を踏襲。
   - 文面の骨子 (案):
     > 提案や指摘の根拠を述べる前に、必要なら `knowledge.search` で「Scrum 標準 (DoD / Story Point / Sprint Goal の考え方)」と「このチームの過去 Try」を意味検索し、引いた知識は `sourceId` を引用して提案に織り込む。一般論でなくチーム文脈に根ざした助言にするための手段。
   - 適用ロールの優先: **Refinement / Planner / Retrospective** (知識依存が高い)。Daily / Reviewer は任意。
   - ⚠ **Mock LLM 役割判定 (`Agent-Id:` / `Your role:` anchor) を壊さないこと**。編集後は `agent-prompt-sync` skill + `mock-llm-reviewer` subagent + `prompt-quality-reviewer` を必ず通す (CLAUDE.md 規範)。`packages/llm/src/mock.ts` が `knowledge.search` の tool call を返すよう Mock 側も同期 (デモ・テストが Mock 駆動のため)。

2. **Firestore → Elastic indexer** (新規)
   - 役割: `retroTries` (最低限) と任意で `tickets`/`epics` を `belvedere-kb-tries-<ws>` / `belvedere-kb-scrum` に投入。
   - 方式の選択肢: (a) 書込時同期 (repo の upsert 後に index、結合度高) / (b) バッチ・再投入スクリプト (`apps/api/scripts/` に `index-elastic.ts` / seed と同型 / 疎結合・ハッカソン向き)。**推奨 = (b) バッチ**。デモは「Retro を追加 → 再 index → Agent が引ける」を手動 or 軽量 cron で回せば十分。
   - 静的コーパス (`belvedere-kb-scrum`) は Scrum Guide 抜粋を 1 回投入すれば足りる。
   - ELSER inference pipeline / `semantic_text` マッピングは Elastic 側 index 作成時に設定 (indexer のセットアップ手順に含める)。

3. **Elastic Cloud provision + コスト** (ユーザー協調 / GCP 外)
   - Elastic Cloud trial or 最小ノード。`ELASTIC_URL` / `ELASTIC_API_KEY` を Secret Manager に登録 (キーはリポジトリに置かない)。
   - コストは Elastic 側課金 (GCP クレジット外)。ハッカソン期間の小規模なら trial で足りる想定。**要ユーザー確認**。

4. **埋め込みモデル: ✅ 確定 = Elastic 多言語 E5 (2026-06-20 ユーザー決定 / 案A)**
   - 当初「ELSER 推奨」だったが、**ELSER は英語特化**でコーパスが日本語 (Scrum 知識 + Try) の Belvedere では精度が落ちる。→ 同じ **`semantic_text` / Elastic-hosted / 埋め込みパイプライン不要**のまま、**多言語モデル `.multilingual-e5-small`** を使う (日本語 OK)。「index 作るだけで意味検索が動く」手軽さはそのまま維持。
   - Gemini Embeddings は不採用 (= 案B)。**Elasticsearch を公式 AI 技術リスト (11 群) の加点**として採る方針 (A-2 は Gemini で既に充足、その上乗せ)。`ElasticKnowledgeSearcher.search` の `query:{semantic:...}` は不変で、index 側の inference を ELSER → `.multilingual-e5-small` にマップするだけ (I/F 不変)。
   - **コスト戦略 (✅ ユーザー決定)**: 開発中は **MockKnowledgeSearcher (キーワード / 常時 ¥0)** で進める。**Elastic Cloud は提出直前の 14 日無料トライアルだけ点火 → 使用後すぐ削除** (放置すると ~$99/月 / GCP クレジット対象外)。トライアル開始日に削除リマインダーを `/schedule`。個人アカウントで契約 (会社不可)。

---

## 4. agent eval ハーネス設計 (品質ゲート)

### 4-1. 2 層に分ける (これが eval の肝)
| 層 | 対象 | 決定性 | 厳しさ |
|---|---|---|---|
| **L1: ルールエンジン eval** | `runTicketRules(ceremony, ctx)` の純粋関数出力 | 完全決定的 | **厳格** (期待 `ruleId` を完全一致で要求) |
| **L2: Agent 出力 eval** | `runAgent(...)` の `outputArtifacts.summary` (Mock LLM 駆動) | Mock は決定的 | **構造的** (期待 ticketId / シグナルが要約に含まれるか) |
| (L3: Gemini 意味 eval) | 実 Gemini 出力 | 非決定的 | 任意・緩い (semantic 近似 / コスト高 / ハッカソンでは省略可) |

- **L1 が改善作業の安全網の本体**。ルール (`ticket-rules.ts`) や 6 観点 (`refinement.ts`) を変えたとき、退化入力を含む golden で「拾うべき指摘を拾えているか」を CI で固定する。`.claude/rules/testing.md` の「純粋関数 unit は退化入力を含める」と完全に整合。
- **L2 は配線の安全網**。prompts.ts を変えても Agent が指摘を要約に出すことを Mock 駆動で担保。`packages/llm/test/mock.test.ts` (役割判定) の隣に位置する「判断の質」層。
- Gemini eval (L3) は非決定的でコストもかかるため、ハッカソンでは L1+L2 で十分。

### 4-2. 実在ルール (golden の参照先 / `packages/tools/src/ticket-rules.ts`)
代表 `ruleId` (型 `TicketFinding = {ruleId, ticketId, severity, message, action?}`):
`STORY_DOD_MISSING`(AC 空/error) / `STORY_SP_MISSING`(estimatePt null/warn/open-estimation) / `TASK_NO_PARENT`(親 Story なし/error) / `STORY_STALL`(in-progress 3 日/warn) / `BUG_NO_REPRO`(再現記述なし/error) / `SPIKE_NO_TIMEBOX` / `SPRINT_OVER_VELOCITY`(ΣSP > velocity/aggregate/error) / `ESTIMATE_DIVERGENCE`(ポーカー 2 段割れ/info) ほか。6 観点側 (`refinement.ts`) は `oversize_story`(SP>8) / `strategic_intent_missing`(Epic.rationale 欠落) 等。

### 4-3. golden データ形式 + 具体例
1 ケース = `{ name, ceremony, inputTickets[], (sprints?/sessions?), expect: [{ ruleId, ticketId, severityAtLeast? }] }`。

```jsonc
// 例1: DoD 空の Story → STORY_DOD_MISSING (error)
{
  "name": "story-empty-DoD",
  "ceremony": "refinement",
  "inputTickets": [{
    "id": "G-DOD", "workspaceId": "ws-eval", "type": "story",
    "title": "決済結果をユーザーに通知する", "status": "backlog",
    "priority": "high", "valueImpact": "high",
    "estimatePt": 5, "acceptanceCriteria": [],          // ← 空 = DoD 欠落
    "createdAt": "2026-06-20T00:00:00Z", "updatedAt": "2026-06-20T00:00:00Z", "createdBy": "human"
  }],
  "expect": [{ "ruleId": "STORY_DOD_MISSING", "ticketId": "G-DOD", "severityAtLeast": "error" }]
}
// 例2: 親なし Task → TASK_NO_PARENT (error)  / 例3: ΣSP>velocity → SPRINT_OVER_VELOCITY (aggregate)
```

L1 アサーション (vitest / 既存 `packages/tools/test/ticket-rules.test.ts` 様式):
```ts
const findings = runTicketRules(c.ceremony, buildRuleContext(NOW, c.inputTickets, c.sprints ?? [], c.sessions ?? []));
for (const e of c.expect) {
  expect(findings).toContainEqual(expect.objectContaining({ ruleId: e.ruleId, ticketId: e.ticketId }));
}
```

L2 アサーション (Mock 駆動 / `runAgent` の `outputArtifacts.summary` に期待 ticketId が出るか):
```ts
const run = await runAgent({ agentName: 'refinement', /* Mock LLM */ ... }, '...');
expect(run.outputArtifacts?.summary).toContain('G-DOD');
```

- 配置: `packages/tools/test/eval/*.eval.test.ts` (or 専用 `packages/agent-evals/`)。**immutable seed (`WC-101..112` / `EP-1..4`) を改変しない**ため、golden は専用 fixture を新規に組む (seed-guard 回避不要)。
- スコア表示: 期待 finding の検出率を 1 行ログで出す (例: `agent-evals: 18/18 expected findings detected`)。

### 4-4. CI ゲート配線
- ルート `package.json` の `test` = `pnpm -r --filter "!@belvedere/e2e" --if-present test`。eval を持つ workspace に `"test": "vitest run"` があれば**自動的に `.github/workflows/ci.yml` の `pnpm test` ステップに乗る** (新ジョブ不要)。
- 可視化したい場合のみ、ci.yml に `agent-evals` 専用ステップ (`pnpm --filter @belvedere/agent-evals test`) を追加し、PR の必須チェックにする = 「プロンプト/ルール変更で品質が落ちたらマージできない」を視覚化 (ピッチの「まわす」証跡)。

---

## 5. 「まわす」ナラティブ (提出物で語る形)

> **使うほど賢くなる**: Belvedere の儀式 (特に Retrospective) を回すほど、チーム固有の改善 Try と知識が貯まり、Agent が `knowledge.search` でそれを意味検索して**そのチームに最適化された提案**を出すようになる (Retro loop → Elastic RAG)。
> **後退させない**: その AI を、agent eval が CI ゲートで守る。プロンプトやルールを改善してもデグレしたら CI が落ちる。
> **CI/CD で回す**: WIF 鍵レスデプロイ + 462 テスト + e2e が、改善を本番まで安全に届ける。

この 3 文が「まわす = CI/CD + AI を継続的に改善するサイクル」への直接の回答になる。Elasticsearch は公式 AI 技術リスト (11 群) の 1 つでもあり、採用は技術要件の上乗せにもなる (A-2 は Gemini で既に充足)。

---

## 6. 次セッション (実装) への引き継ぎ 🔑

**次のセッションは本ドキュメントを仕様として実装する。常に「まわす = AI を継続的に改善するサイクル」軸との接続を意識すること** (提出物の評価軸そのもの)。

### 進捗 (2026-06-20 / Stage 1-2 完了)
1. ✅ **eval ハーネス (L1)** 実装済 — `packages/agent-evals` (golden 9 ケース + 検出率ゲート / CI 名前付き step / commit a6d002c)。L2 (Mock agent 出力) は次段。
2. ✅ **prompts.ts に `COMMON_KNOWLEDGE_STEP` 追加** 済 — KNOWLEDGE_ROLES={refinement,planner,retrospective} / mock.ts + agents.py 同期 / agent-prompt-sync + mock-llm-reviewer + prompt-quality-reviewer 全 blocker ゼロ (commit 852e99e)。**Mock searcher で動く・本番(searcher 無し)は無害**。

### 残り (Stage 3 / 要ユーザー provision)
3. **Elastic indexer (バッチ)** — §3-3②。`apps/api/scripts/index-elastic.ts`。`belvedere-kb-scrum` の静的コーパス (`references/agile-knowledge-base/*` 8本) + `belvedere-kb-tries-<ws>`。index 側 inference を **`.multilingual-e5-small`** にマップ。
4. **provision + 点火** — §3-3③。`ELASTIC_URL`/`ELASTIC_API_KEY` を Secret Manager → 本番 `SEARCH_BACKEND=elastic`。**Secret 注入 / IAM はユーザー実行** (memory `feedback_gcp_user_executes`)。
   - (任意) ローカル demo で RAG を Mock で見せたい場合は `apps/api/src/index.ts` の `SEARCH_BACKEND=mock` 経路に 8本コーパスを `mockDocs` として読込む配線を足す。本番経路 (none/elastic) は無改修。
   - **リマインダー登録済**: provision したら自発点火するよう `.claude/reminders.tsv` の `elastic-ignite` (条件型) が毎セッション surface する ([[feedback_reminder_mechanism]])。

### 確定事項 (旧 未決 / 2026-06-20 解決)
- ✅ **埋め込み = Elastic 多言語 E5** 確定 (§3-3④。素の ELSER は英語特化のため回避)。
- ✅ **コスト**: 開発は Mock で常時¥0、Elastic Cloud は提出直前 14 日トライアルだけ点火→即削除 (削除リマインダーは reminders.tsv `elastic-trial-delete` + /schedule cron)。
- ✅ **見せ方**: Elasticsearch を公式 AI 技術リスト加点として本番点火する方針。

### 触らない / 守る
- 既存配線 (`knowledge.ts` / `buildTools` / `app.ts` / `apps/api/src/index.ts`) は完成しているので壊さない。
- immutable seed (`WC-101..112` / `EP-1..4`)。eval golden は専用 fixture で組む。
- Mock LLM 役割判定 anchor (`Agent-Id:` / `Your role:`)。
- Firestore = 正本。Elastic は読み取り意味検索層に留める (二重書き込みの整合は indexer で吸収)。

### 関連スキル / subagent (実装時に必ず使う)
`agent-prompt-sync` / `mock-llm-reviewer` / `prompt-quality-reviewer` (prompts.ts 編集時) / `belvedere-commit` (commit 時) / `.claude/rules/testing.md` (eval は純粋関数 unit + 退化入力 + 再現テスト先行)。
