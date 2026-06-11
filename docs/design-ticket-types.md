# チケット種別 + ルールエンジン + 見積もりポーカー 設計書 (2026-06-10 策定)

> 策定: Fable 5 / 実行: Opus・Sonnet 等の実装モデル
> 位置づけ: `docs/refactoring-plan.md` の R4 を本書に拡張置換。実行順は R1 → R2 → 本書 T1〜 (T5/T7 のみ R3 後)。
> 実行モデルは `docs/refactoring-plan.md` の **§1 不可侵リスト / §6 検証ゲート / §7 エスカレーション基準** を本書でもそのまま適用すること。

---

## 0. 何を作るか (3 点セット)

1. **チケット種別**: Story / Task / Spike / Bug / Incident の 5 分類を `Ticket.type` として導入
2. **ルールエンジン**: 種別 × 儀式の監査マトリクスを「宣言的なルール表 (1 ファイル)」として実装。
   Refinement / Planner / Daily の各 Agent ツールと UI バッジが同じ表を共有する
3. **見積もりポーカー**: 未見積もり Story に対し、Workspace メンバが**互いに見えない状態で投票**→
   一斉開示→採用、を Belvedere 内で完結させる (スプレッドシート / 外部ポーカーサイトの排除)

**ユーザー決定事項 (2026-06-10 確定、変更には再承認が必要):**
- Story はチケットの type で表現する。既存 `UserStory` エンティティと `US-*` は過去資産として温存、新規には作らない
- seed に「意図的なデモ用不備」を仕込む (type 未設定 1 件 / 「調査」タイトルなのに story 1 件)
- status 遷移時刻 (`startedAt` / `completedAt`) を自動記録し、停滞・タイムボックス判定に使う
- **AI は投票者にならない** (AI 見積もりには基準が必要でコスト過大)。AI の役割はポーカーの運営
  (未見積もり検出 / 隠蔽管理 / 開示後の割れ検出) に限定する

---

## 1. チケット種別仕様 (各種別に何を書くか)

### 📖 story — ユーザーストーリー (価値の単位、PBI)
- title: 短く / description: 「As a / I want / So that」
- DoD (acceptanceCriteria): **価値完了** (例: ユーザがログイン後、プロフィールが見える)
- 見積: estimatePt (Story Point) — **見積もりポーカーで決める**
- リンク: `epicId` (親 Epic)

### 🔨 task — Story の作業分解 (How、PBI ではない)
- title: 設計 / 実装 / テスト 等 / description: 技術手順
- DoD: **作業完了** (例: PR Merge、テスト緑)
- 見積: 1 日以内目安 (estimatePt は使わない)
- リンク: `parentTicketId` **必須** (story 型チケットの id、または旧 US-*)

### 🔍 spike — 調査 (タイムボックス制)
- title: 「調査: A か B か」 / description: 何を明らかにしたいか
- DoD: **判断材料が揃った** / 結論を文書化した
- 見積: `timeboxHours` (例: 4 = 4 時間で打ち切り)
- リンク: `epicId`

### 🐛 bug — 不具合修正
- title: 現象 / description: **再現手順** + 期待 vs 実動作 + 影響範囲
- DoD: 再現しない + **回帰テスト追加**
- 見積: estimatePt
- リンク: 関連 story、Incident 由来なら `relatedIncidentId`

### 🚨 incident — 突発インシデント (計画外割込み)
- title: 現象 / description: 発生時刻 + 影響範囲 + 一時対応
- DoD: 復旧 + Postmortem 実施 + **根本対応 Bug の起票**
- 見積: なし
- リンク: 根本対応 Bug 側から `relatedIncidentId` で逆参照される

---

## 2. データモデル変更

### 2-1. Ticket への追加フィールド (全部 optional / 既存 seed を壊さない)

```ts
// packages/shared/src/types.ts の Ticket に追加
export type TicketType = 'story' | 'task' | 'spike' | 'bug' | 'incident';

  /** チケット種別 (2026-06-10 導入)。未設定は TYPE_MISSING ルールが検出する */
  type?: TicketType;
  /** type='story' の親 Epic (Story を Epic に直結。UserStory entity は経由しない) */
  epicId?: string;
  /** type='bug' が Incident の根本対応である場合、その Incident チケットの id */
  relatedIncidentId?: string;
  /** type='spike' のタイムボックス (時間)。超過は SPIKE_TIMEBOX_OVER が検出 */
  timeboxHours?: number;
  /** 初めて in-progress に遷移した時刻 (status 変更処理が自動記録。手入力しない) */
  startedAt?: string;
  /** done に遷移した時刻 (同上) */
  completedAt?: string;
```

`schemas.ts` を同期 (`Equal<>` drift check が強制してくれる)。

### 2-2. status 遷移の自動スタンプ

`packages/shared/src/utils.ts` (R2 で新設済のはず。無ければ作る) に追加:

```ts
/** status 遷移に伴う startedAt / completedAt の自動記録。全 status 変更経路で必ず通すこと */
export function applyStatusTransition(t: Ticket, to: Status, now: string): Ticket {
  const next = { ...t, status: to, updatedAt: now };
  if (to === 'in-progress' && !t.startedAt) next.startedAt = now;   // 初回着手のみ記録
  if (to === 'done' && !t.completedAt) next.completedAt = now;
  return next;
}
```

適用箇所 (3 箇所、漏らさない):
1. `apps/api/src/handlers/ticket-handlers.ts` の `changeTicketStatus`
2. 同 `patchTicket` (patch body に status が含まれる場合)
3. `apps/mcp-server/src/server.ts` の `belvedere_ticket_status_change`

### 2-3. 新エンティティ EstimationSession (見積もりポーカー)

```ts
// packages/shared/src/types.ts に追加
export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;
export type EstimationValue = (typeof FIBONACCI_POINTS)[number] | '?';  // '?' = 分からない

export interface EstimationVote {
  userId: string;
  value: EstimationValue;
  submittedAt: string;
}

export interface EstimationSession {
  id: string;              // `EST-${Date.now().toString(36).toUpperCase()}`
  workspaceId: string;
  ticketId: string;
  status: 'voting' | 'revealed' | 'adopted' | 'discarded';
  votes: EstimationVote[];     // 開示前はサーバが他人の vote を返さない (§4-3)
  adoptedValue?: number;
  createdAt: string;
  createdBy: string;           // userId
  revealedAt?: string;
  adoptedAt?: string;
}
```

- zod schema 追加 + drift check
- `packages/repo`: `EstimationRepository { list(opts: { workspaceId; ticketId?; status? }), get, upsert }` を
  memory / firestore 両実装 (既存 `FsAgentRunRepo` のパターンを踏襲)。コレクション名 `estimationSessions`。
  where は equality のみ (composite index 不要、firestore.ts の既存方針通り)
- `RepoContainer` に `estimations` を追加

---

## 3. ルールエンジン

### 3-1. 形

```ts
// packages/tools/src/ticket-rules.ts (新規)
export interface TicketFinding {
  ruleId: string;
  ticketId: string;
  severity: 'error' | 'warn' | 'info';
  message: string;        // 日本語、ユーザー向け文。fallback 判定なら末尾に「(推定)」
  /** UI の 1 クリックアクション用 (最小実装は kind と label のみ) */
  action?: { kind: 'open-estimation' | 'edit-ticket' | 'create-bug' | 'link-parent'; label: string };
}

export interface RuleContext {
  now: string;                       // ISO8601。呼出側が注入 (テスト容易性のため Date.now() を直接呼ばない)
  tickets: Ticket[];                 // workspace 内全件
  ticketsById: Map<string, Ticket>;
  sprints: Sprint[];
  estimationSessions: EstimationSession[];
}

export interface TicketRule {
  id: string;
  appliesTo: TicketType[] | 'all' | 'aggregate';   // aggregate = チケット横断 (過剰計画など)
  ceremonies: Ritual[];                             // どの儀式で発火するか
  check(t: Ticket | null, ctx: RuleContext): TicketFinding[];  // aggregate は t=null で呼ぶ
}

export const ticketRules: TicketRule[] = [ /* §3-2 の全ルール */ ];

/** 儀式でフィルタして全ルールを実行する唯一の入口 */
export function runTicketRules(ceremony: Ritual, ctx: RuleContext): TicketFinding[];
```

**既存 6 観点 (`backlogRefinementCheckTool` 内の inline 実装) は触らない**。新ルールは本レジストリに追加し、
ツール側で両方の結果を合成する (additive 方針。統合はパーキングロット)。

### 3-2. ルール表 (実装する判定の正)

ヘルパ: `hoursSince(iso, now)` / `daysSince(iso, now)` / `fibIndex(v)` (FIBONACCI_POINTS の添字)。
`startedAt` が無い場合は `updatedAt` で代替し finding の message 末尾に「(推定)」を付ける。

| ruleId | 対象 | 儀式 | severity | 判定 (この通り実装) |
|---|---|---|---|---|
| TYPE_MISSING | all | refinement | warn | `!t.type` |
| TASK_NO_PARENT | task | refinement, planning | error | 親なし: `!t.parentTicketId`、または親が story でない: `!(t.parentTicketId.startsWith('US-') \|\| ctx.ticketsById.get(t.parentTicketId)?.type === 'story')` |
| TASK_STALL | task | daily | warn | `status==='in-progress' && daysSince(startedAt ?? updatedAt) >= 2` |
| STORY_DOD_MISSING | story | planning, refinement | error | `!t.acceptanceCriteria \|\| t.acceptanceCriteria.length === 0` |
| STORY_DOD_PROCEDURAL | story | refinement | warn | AC が 1 行以上あり、**全行**が `/(実装|設計|対応|作成|修正|追加|変更|テスト|リリース)(する|します)?$/` にマッチ (= 手段しか書かれていない) |
| STORY_SP_MISSING | story | refinement | warn | `t.estimatePt == null`。`action: { kind: 'open-estimation', label: '見積もりセッションを開始' }` |
| STORY_STALL | story | daily | warn | `status==='in-progress' && daysSince(startedAt ?? updatedAt) >= 3` |
| SPIKE_NO_TIMEBOX | spike | planning, refinement | warn | `t.timeboxHours == null` |
| SPIKE_TIMEBOX_OVER | spike | daily | error | `status==='in-progress' && timeboxHours != null && hoursSince(startedAt ?? updatedAt) > timeboxHours` |
| SPIKE_DOD_NOT_DECISION | spike | refinement | warn | AC のどの行にも `/(判断|結論|比較|わかる|分かる|明らか|決定|選定)/` が含まれない |
| BUG_NO_REPRO | bug | refinement | error | `!/(再現|手順|steps)/i.test(t.description ?? '')` |
| BUG_NO_REGRESSION_DOD | bug | refinement, review | warn | AC のどの行にも `/(回帰|リグレッション|テスト追加|自動テスト)/` が含まれない |
| INCIDENT_ACTIVE | incident | daily | error | `t.status !== 'done'` |
| INCIDENT_NO_FOLLOWUP_BUG | incident | refinement | warn | `t.status === 'done' && !ctx.tickets.some(b => b.type === 'bug' && b.relatedIncidentId === t.id)`。`action: { kind: 'create-bug', label: '根本対応 Bug を起票' }` |
| MISMATCH_SPIKE_TITLE | story, task | refinement | info | `/(調査|検証|比較|スパイク)/.test(t.title) && t.type !== 'spike'` |
| SPRINT_OVER_VELOCITY | aggregate | planning | error | active sprint について `Σ(sprint 内 ticket の estimatePt) > 完了スプリントの平均 velocity`。velocity 実績が無ければ判定不能 (skip) |
| ESTIMATE_DIVERGENCE | aggregate | refinement | info | revealed な session ごとに: '?' を除く votes の `fibIndex(max) - fibIndex(min) >= 2` → 「見積もりが大きく割れています (X と Y)。暗黙の前提が違う可能性。スコープを話し合って再投票を検討してください」。'?' 投票が 1 つでもあれば「情報不足のサイン」を追記 |

**unit test**: ルール 1 個につき最低「発火する / しない」の 2 case。`packages/tools/test/ticket-rules.test.ts` 新規
(packages/tools に test script が無ければ package.json に `"test": "vitest run"` を追加 — `--if-present` で他に影響しない)。

### 3-3. 消費者 (3 つが同じ表を使う)

1. **Agent ツール** (`packages/tools/src/index.ts` に追加):
   - `ticket.rules.check` — params `{ ceremony, sprintId? }` → `runTicketRules` を呼んで findings を返す汎用ツール
   - 既存 `backlogRefinementCheckTool` は invoke 内で `runTicketRules('refinement', ctx)` の結果を既存 findings に**追加合成**
2. **API** (`apps/api/src/index.ts`): `GET /api/findings?ceremony=refinement` — UI バッジ用。
   handler は `apps/api/src/handlers/finding-handlers.ts` (純関数 + test、既存パターン踏襲)
3. **prompts**: `packages/agent/src/prompts.ts` の Refinement を「6 観点 + 種別ルール」に更新、
   Planner / Daily にも該当ルールの言及を追加。
   ⚠ **英語 Agent 名と `Your role:` アンカー保持。編集後に `mock-llm-reviewer` + `agent-prompt-sync` を必ず実行**

---

## 4. 見積もりポーカー (人間のみ)

### 4-1. フロー

```
1. Story に SP が無い → Refinement の STORY_SP_MISSING が検出、「見積もりセッションを開始」アクション提示
2. owner/sm/po がセッション開始 (POST)
3. 各メンバが投票 (PUT)。開示まで他人の値は見えない。誰が投票済みかは見える。開示前は何度でも上書き可
4. owner/sm/po が開示 (POST reveal) → 全員の値が見える
5a. 揃った → 採用 (POST adopt) → ticket.estimatePt に書き込み
5b. 割れた → ESTIMATE_DIVERGENCE が議論を促す → 再投票 = 新セッション開始 (旧は discarded)
```

### 4-2. API (全部 /api/* 配下 = 認証 + workspace 解決 + IDOR ガード済の世界)

| Method/Path | 権限 | 動作 |
|---|---|---|
| POST `/api/tickets/:id/estimation` | owner/sm/po | セッション開始。voting 中のセッションが既にあれば 409。revealed のまま残っていれば discarded にして新規作成 |
| GET `/api/tickets/:id/estimation` | member | アクティブなセッション取得 (§4-3 の隠蔽形式) |
| PUT `/api/tickets/:id/estimation/vote` | member | body `{ value: 1\|2\|3\|5\|8\|13\|'?' }`。自分の票を upsert。revealed 後は 409 |
| POST `/api/tickets/:id/estimation/reveal` | owner/sm/po | 開示。投票 0 件なら 409 |
| POST `/api/tickets/:id/estimation/adopt` | owner/sm/po | body `{ value: number }` → `ticket.estimatePt` 更新 + session を adopted に |

handler は `apps/api/src/handlers/estimation-handlers.ts` (純関数、`HandlerContext`/`HandlerResult` 流用)。
IDOR: ticket の workspaceId 照合 (既存 patchTicket と同じ)。role は `ctx` に追加して渡す
(`HandlerContext` に `role` を足す。workspaceMiddleware が既に c.set('role') 済なので buildCtx で詰めるだけ)。

### 4-3. 隠蔽仕様 (サーバ側で強制 — UI 側の隠蔽だけにしない)

```
GET のレスポンス (status === 'voting' のとき):
  { status: 'voting', myVote: <自分の票 or null>, votedUserIds: [...], voteCount: n }
  → 他人の value はレスポンスに**含めない** (フロント改造でも見えない)

GET のレスポンス (revealed / adopted):
  { status, votes: [{ userId, value }...], adoptedValue?, revealedAt }
```

unit test 必須ケース: 「voting 中の GET に他人の value が含まれない」「reveal 後は全票見える」
「reveal 後の vote は 409」「member でない workspace のチケットには 404」「dev role の reveal は 403」。

### 4-4. UI (T7 / R3 完了後)

- チケット詳細 (DetailSheet) に見積もりセクション: フィボナッチボタン 1/2/3/5/8/13/? +
  「n/5 人投票済」表示 + (owner/sm/po に) 開示ボタン → 開示後は全員の票 + 採用ボタン
- 開始導線: STORY_SP_MISSING の finding バッジから 1 クリック
- 更新: パネルを開いている間 5 秒ポーリングで GET 再取得 (リアルタイム配線は Phase 2 以降の onSnapshot 候補)
- デモ方法: 2 ブラウザ (通常 + シークレットウィンドウで別アカウント) で投票 → 開示。Phase 1-E の招待 UI 完成後は招待した実アカウントで可

---

## 5. seed 変更 (T2 内 / ユーザー承認済み 2026-06-10)

> seed-guard 対象。理由を会話に明記して Bash heredoc 経由で編集すること。ID 値は変更禁止。

- WC-101〜112 に `type` を付与する (内容から story / task / bug を分類。判断に迷うものは story)
- **意図的デモ不備** (EP-3 の rationale 空と同じ思想):
  - 1 件だけ `type` 未設定のまま残す → TYPE_MISSING のデモ
  - 1 件「調査」を含む title のチケットを `type: 'story'` にする → MISMATCH_SPIKE_TITLE のデモ
- in-progress の seed チケット 1 件に `startedAt` を 4 日前で付与 → STORY_STALL / Daily デモ
- 変更後 `pnpm test` (EP-3 canonical case 等の既存契約 test が緑のままであること)

---

## 6. 実装フェーズ (実行モデル向け)

> 順序: R1 → R2 (リファクタ計画、承認済) → T1 → T2 → T3 → T4 → T6 → (R3) → T5 → T7 → T8
> T5 / T7 だけ R3 (Demo/Live 統一) 完了が前提。T6 までは R3 と独立に進められる。

| Phase | 内容 | 主な対象 | 目安 |
|---|---|---|---|
| T1 | `docs/agile-knowledge-base/ticket-types.md` 新規 — §1 の種別仕様 + ルール表を知識ベース化 (Phase 3-B RAG の投入源) | docs | 30 分 |
| T2 | データモデル: Ticket 6 フィールド + `applyStatusTransition` (適用 3 箇所) + EstimationSession entity + repo (memory/firestore) + zod 同期 + seed 分類 (§5) | shared / repo / api / mcp / seed | 1 日 |
| T3 | `ticket-rules.ts` レジストリ + §3-2 全ルール + ルール単位 unit test | tools | 1 日 |
| T4 | `ticket.rules.check` ツール + 既存 refinement ツールへの合成 + `GET /api/findings` + prompts.ts / agents.py 更新 (**mock-llm-reviewer + agent-prompt-sync 必須**) | tools / api / agent | 0.5 日 |
| T6 | 見積もり API 5 endpoint + estimation-handlers + 隠蔽/権限/IDOR test (§4-3 の必須ケース) | api | 1 日 |
| T5 | UI: 種別バッジ (TypeMark 拡張) + 作成ダイアログ種別セレクタ + 「調査」入力で spike 推奨 + 行内 finding バッジ (`GET /api/findings`) | web | 1 日 |
| T7 | UI: 見積もりパネル (DetailSheet) + STORY_SP_MISSING からの導線 + 5 秒ポーリング | web | 1 日 |
| T8 | ESTIMATE_DIVERGENCE の e2e (vote → reveal → adopt の happy path) + Backlog バッジの e2e 1 本 | e2e | 0.5 日 |

各 Phase の完了条件: `docs/refactoring-plan.md` §6 の検証ゲート (typecheck / test 全緑 / belvedere-commit 形式 /
push 後 CI 確認)。T2 と T4 は加えて該当 subagent / skill の実行。

---

## 7. スケジュール影響 (案 A への追記)

- 新規工数: T1〜T8 ≈ **6 日** (うち T5/T7/T8 の 2.5 日は R3 後)
- Phase 1-C (6/11-19, 9 日枠): R1+R2 (1 日) + R3 (1.5-2 日) + T1〜T8 (6 日) = **8.5-9 日 → 1-2 日あふれる可能性**
- あふれた場合: Phase 1-D (MCP HTTP) を 6/22-24 に圧縮。1-D には縮退ライン「stdio のまま提出」が
  ROADMAP に既設のため許容範囲。**Phase 3-A (6/27-30) には絶対に食い込ませない**
- 時間が苦しくなった場合の切り捨て順: T8 (e2e) → T5 の行内バッジ (種別セレクタは残す) → ESTIMATE_DIVERGENCE

## 8. パーキングロット (本設計では やらない)

- AI による見積もり提案 (基準データが必要。Phase 3-B の RAG 蓄積後に再検討)
- リアルタイム同期 (onSnapshot / Pub/Sub) — 当面 5 秒ポーリング
- 既存 6 観点のレジストリへの統合移植
- 見積もりセッションの履歴分析 (割れ頻度 → Retro 連携)
- reveal の役割ゲート細分化 / 投票の匿名化オプション
