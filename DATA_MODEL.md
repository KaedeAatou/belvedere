# Belvedere — Data Model

> Firestore (NoSQL ドキュメント) 前提。型は TypeScript / Python の両方を後続で生成。
> 2026-04-30 改訂: 「WindEvent」「WingScore」を廃止し、`Epic` / `UserStory` / `CeremonyHealthScore` に置き換え。
> 2026-05-03 改訂: **`Project` エンティティ追加** (Jira プロジェクト相当、`idPrefix` 自由設定) + **`valueImpact` 軸** (priority と独立した high/medium/low) + **`blockedBy`** (依存関係) + **`Ritual = 'refinement'` 追加** (5 リテラル化)。
> 2026-05-05 改訂: **Epic に `rationale` / `successMetric` / `strategicTheme` 追加** — 戦略意図 (Why) と達成判定の数値指標を明示する。Refinement Agent の **第 6 観点「戦略整合性」** が `Epic.rationale` 欠落を検出し、配下チケットが「何のために?」を見失う形骸化サインを警告する。
> 2026-06-11 改訂: **`ReviewRecording` エンティティ + Ticket の `source*` 4 フィールドを縮退削除** (録画 → 指摘抽出機能の縮退 2026-06-10)。代わりに **Ticket に `type` (種別) / `epicId` / `relatedIncidentId` / `timeboxHours` / `startedAt` / `completedAt` を追加** + **`EstimationSession` エンティティ (見積もりポーカー) を新設**。
> 2026-06-13 改訂: **儀式モデル確定によるチケットライフサイクルの明文化**。データ型の新フィールド追加は無し (既存 `parentTicketId` / `sprintId` / `orderIndex` / `type` で表現可能)。`Ticket.parentTicketId` = US 起票 → Refinement で最小価値 Story に分割 → Planning で Task/Spike に分割という一方向フローの親子線。`Ticket.sprintId` の有無 + 値で **CURRENT / NEXT / BACKLOG の 3 区画**を判定し、`orderIndex` が Backlog / Refinement / Planning の **3 画面共通の並び順** (区画跨ぎ d&d でスプリント移動)。Refinement の「ルール別グループ」クエリは廃止 (行内 finding ピルで品質指摘を見せるため、種別別/ルール別の事前グルーピングは不要)。

---

## 1. 主要エンティティ一覧

| エンティティ | 役割 | コレクションパス |
|---|---|---|
| `Workspace` | チーム単位 | `/workspaces/{wsId}` |
| `Project` | Jira プロジェクト相当 (idPrefix 自由設定) | `/workspaces/{wsId}/projects/{projectId}` |
| `Epic` | 戦略単位 (複数 Story を束ねる、スプリント横断) | `/workspaces/{wsId}/epics/{epicId}` |
| `UserStory` | 要求の単位 (As a / I want / So that) | `/workspaces/{wsId}/stories/{storyId}` |
| `Sprint` | 2週間のスプリント | `/workspaces/{wsId}/sprints/{sprintId}` |
| `Ticket` | タスク (実作業単位、`${idPrefix}-${number}`) | `/workspaces/{wsId}/tickets/{ticketId}` |
| `Ceremony` | 儀式の1回分 (5儀式: Planning / Daily / Refinement / Review / Retrospective) | `/workspaces/{wsId}/ceremonies/{ceremonyId}` |
| `CeremonyHealthScore` | 儀式ごとの健全性スコア時系列 | `/workspaces/{wsId}/ceremonyHealth/{scoreId}` |
| `EstimationSession` | 見積もりポーカーのセッション (隠蔽投票 → 開示 → 採用) | `/workspaces/{wsId}/estimationSessions/{sessionId}` |
| `RetroTry` | レトロの carry-forward 積み上げ (スプリント横断で蓄積する継続改善アクション) | `/workspaces/{wsId}/retroTries/{tryId}` |
| `RetroNote` | レトロの KPT ボード (Keep/Problem/Try) のノート 1 枚 (投票でホット度を可視化) | `/workspaces/{wsId}/retroNotes/{noteId}` |
| `AgentRun` | エージェント実行ログ | `/workspaces/{wsId}/agentRuns/{runId}` |
| `Member` | チームメンバ | `/workspaces/{wsId}/members/{userId}` |

階層: **`Workspace` > `Project` > `Epic` > `UserStory` > `Task` (5 階層)**

- `Project` ごとに `idPrefix` を自由設定 (例: `BV` for Belvedere Core)
- 配下の Epic / UserStory / Ticket の ID は `${idPrefix}-${number}` フォーマット

> **実装メモ (Phase 1-B / 2026-06-09)**: 上表のコレクションパスは論理設計 (将来のマルチテナント本格化時の目標形)。`packages/repo/src/firestore.ts` の Phase 1-B 実装は、`RepoContainer` インタフェースを無変更で memory backend と即 swap できることを優先し、**サブコレクションではなくトップレベルのフラットコレクション** (`/tickets/{id}` 等) を採用した。各ドキュメントは `workspaceId` / `projectId` をフィールドで保持し、ワークスペース分離は `where('workspaceId', '==', X)` で実現する (equality-only の AND は composite index 不要)。サブコレクション (`/workspaces/{wsId}/...`) への移行は、`RepoContainer` に `wsId` 引数を通す全層 (repo / tools / agent / mcp) 改修を伴うため Phase 4 以降に再検討する。
- 既存 seed (`EP-1..4` / `US-101..US-402` / `WC-101..112`) は **デフォルト Project (Belvedere Core, idPrefix=BV)** 配下と解釈し、ID 値は変更しない

> **実装メモ (Phase 1-E 前倒し / 2026-06-12)**: Workspace 作成 + メンバー招待 + Workspace 切替を実装した。Workspace は他エンティティと同じくフラットコレクション `/workspaces/{wsId}` に書き込む (`WorkspaceRepository.upsert`)。新規 Workspace は `POST /api/workspaces` で作成し作成者を `admin` Member に登録 (2026-06-23 再設計 / 旧 `owner` / §7 参照)、`GET /api/workspaces` で所属一覧を返す (この 2 ルートのみ `workspaceMiddleware` を skip = 所属ゼロでも呼べる)。**招待は実 uid 未確定なので Member doc を `userId = invite:<workspaceId>:<email>` のセンチネルで事前作成**し、招待された人が初回ログインした時に `workspaceMiddleware` が email 一致でセンチネルを実 uid に bind する (旧センチネル doc 削除 + 実 uid doc 作成)。doc id に `workspaceId` を含めるのは同 email を複数 Workspace が招待しても doc id が衝突しないため。seed の `ws-belvedere` は Workspace doc を持たない (members のみ) ため、一覧では `{ id, name: id }` にフォールバックする。

---

## 2. TypeScript 型定義

> 2026-06-10 改訂: 全エンティティに workspaceId 必須化 (IDOR fix)。以下の型抜粋では省略している場合がある。

```ts
// packages/shared/src/types.ts (抜粋)

export type Status = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ValueImpact = 'low' | 'medium' | 'high';   // プロダクトゴール貢献度 (priority と独立)
export type Ritual = 'planning' | 'daily' | 'refinement' | 'review' | 'retrospective';   // 5 リテラル
export type TicketType = 'story' | 'task' | 'spike' | 'bug' | 'incident';   // 種別 (2026-06-10)

// === Workspace ===
export interface Workspace {
  id: string;
  name: string;
  slug: string;            // 'belvedere-team'
  productGoal: string;     // "形骸化したスクラムをAIが品質と運営で底上げする"
  createdAt: string;
  ownerId: string;
}

// === Project (Jira プロジェクト相当 / 2026-05-03 追加) ===
export interface Project {
  id: string;              // "PRJ-belvedere-core"
  workspaceId: string;
  name: string;            // "Belvedere Core"
  idPrefix: string;        // "BV" — Epic/Story/Ticket ID の接頭辞
  description?: string;
  ownerId?: string;
  createdAt: string;
}

// === Epic ===
export interface Epic {
  id: string;              // "EP-1" (デフォルト Project) or "${idPrefix}-${number}"
  projectId?: string;      // 省略時は Workspace のデフォルト Project
  name: string;
  description?: string;
  ownerId?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  valueImpact?: ValueImpact;  // Epic レベルでも持てる
  // 戦略意図 (2026-05-05 追加 / Refinement Agent 第6観点が rationale 欠落を検出)
  rationale?: string;          // なぜこの Epic が必要か (Why)
  successMetric?: string;      // 達成判定の数値指標 (例: "DoD 充足率 60→90%")
  strategicTheme?: string;     // 上位戦略テーマ (任意、SAFe Strategic Theme 流)
  createdAt: string;
}

// === UserStory ===
export interface UserStory {
  id: string;              // "US-101"
  projectId?: string;      // 省略時はデフォルト Project
  epicId: string;          // "EP-2"
  role: string;            // "PO" / "SM" / ...
  want: string;            // "顧客の声をスプリント計画に流したい"
  so: string;              // 理由・効果
  title: string;
  taskIds: string[];       // ["WC-101", "WC-105"]
  valueImpact?: ValueImpact;
}

// === Sprint ===
export interface Sprint {
  id: string;
  workspaceId: string;
  number: number;
  name?: string;           // 表示名 (任意)。未設定時「Sprint 13」/ 設定時「Sprint 13 · 決済MVP」
  startsAt: string;
  endsAt: string;
  goal: string;
  capacity: number;        // velocity 駆動方針により UI 非表示・0 初期化 (SPRINT_OVER_VELOCITY)
  velocity?: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
}
```

**Sprint ライフサイクル (2026-06-11/12 / カデンス 2026-06-16 改訂)**: POST /api/sprints/:id/start で `planned`→`active`、同時に旧 `active` を `completed` 化し velocity を done チケット SP 合計で確定 → 繰上げで新 `planned` ('Next Sprint') を自動生成。PATCH /api/sprints/:id は goal/期間/name のみ (`completed`/`cancelled` は不変)。**常時稼働カデンス**: workspace は常に active 1 + planned 1 を保持し、GET 時に `ensureSprintCadence` が不足分を遅延補充する (手動「新規作成」UI は撤去 / number は ws 内 max+1)。

```ts
// === Ticket ===
export interface Ticket {
  id: string;              // "WC-105" / "${idPrefix}-${number}"
  projectId?: string;      // 省略時はデフォルト Project
  title: string;
  description?: string;
  status: Status;
  priority: Priority;             // 緊急度
  valueImpact?: ValueImpact;      // プロダクトゴール貢献度 (priority と独立)
  ritual?: Ritual;                // 5 リテラル (Refinement 含む)
  sprintId?: string;
  assigneeId?: string;
  estimatePt?: number;
  acceptanceCriteria?: string[];  // = Definition of Done
  labels?: string[];
  orderIndex?: number;            // 3 区画ビュー (CURRENT/NEXT/BACKLOG) 共通の並び順 (手動 d&d / 区画跨ぎでスプリント移動)
  parentTicketId?: string;        // 親 Story (US-xxx) や 元 Try。ライフサイクル: Backlog で US 起票 → Refinement で最小価値 Story に分割 → Planning で Task/Spike に分割し親 Story を指す
  blockedBy?: string[];           // 依存先チケット ID (このチケットを進める前に完了が必要)
  // 種別 + 見積もり/停滞判定フィールド (2026-06-10 追加)
  type?: TicketType;              // 種別 (未設定は TYPE_MISSING ルールが検出)。起票元: story=Backlog 直接 / 子 story=Refinement の分割 / task・spike=Planning の分割でのみ生成 / incident・bug=全画面で起票可
  epicId?: string;               // type='story' の親 Epic (Story を Epic に直結)
  relatedIncidentId?: string;     // type='bug' が Incident の根本対応なら、その Incident の id
  timeboxHours?: number;          // type='spike' のタイムボックス (時間)
  startedAt?: string;            // 初めて in-progress に遷移した時刻 (status 変更が自動記録)
  completedAt?: string;          // done に遷移した時刻 (同上)
  createdAt: string;
  updatedAt: string;
  createdBy: 'human' | `agent:${string}`;
}

// === EstimationSession (見積もりポーカー / 2026-06-10 追加) ===
// SP 未設定 Story を隠蔽投票 → 一斉開示 → 採用 で見積もる。
// 開示前はサーバが他人の vote を返さない (隠蔽はサーバ側で強制)。
export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;
export type EstimationValue = (typeof FIBONACCI_POINTS)[number] | '?';
export interface EstimationVote { userId: string; value: EstimationValue; submittedAt: string; }
export interface EstimationSession {
  id: string;
  workspaceId: string;
  ticketId: string;
  status: 'voting' | 'revealed' | 'adopted' | 'discarded';
  votes: EstimationVote[];
  adoptedValue?: number;
  createdAt: string;
  createdBy: string;       // userId
  revealedAt?: string;
  adoptedAt?: string;
}

// === RetroTry (carry-forward 積み上げ / 2026-06-11 追加) ===
// Retrospective で「次に試すこと (Try)」を d&d で積み上げると生成される。
// スプリントを跨いで蓄積され、各儀式 Agent がコンテキスト (retro.tries.list tool) として参照する。
export interface RetroTry {
  id: string;
  workspaceId: string;
  text: string;
  sprintNumber: number;    // 由来スプリントの番号 (表示バッジ S{number})
  sprintId?: string;       // 由来スプリント id (seed 由来等で不明なら省略)
  done: boolean;
  createdAt: string;
  createdBy: string;       // userId
}

// === RetroNote (KPT ボードのノート / 2026-06-13 追加) ===
// Retrospective の KPT ボード (Keep / Problem / Try) に貼る 1 枚。レトロを実際に
// 開催するための実データ。投票 (votes: userId 配列の toggle) でホット度を可視化する。
// Try 列のノートは UI 側で d&d により RetroTry (carry-forward 積み上げ) へ昇格できる。
export interface RetroNote {
  id: string;
  workspaceId: string;
  sprintNumber: number;             // 由来スプリントの番号 (どのレトロのノートか)
  column: 'keep' | 'problem' | 'try';
  text: string;
  authorId: string;                 // ノートを書いた人 (userId)
  votes: string[];                  // 投票した userId 配列 (toggle 式、votes.length がホット度)
  createdAt: string;
  createdBy: string;                // userId (authorId と同一 / audit 用)
}

// === Ceremony ===
export interface Ceremony {
  id: string;
  ritual: Ritual;
  sprintId: string;
  scheduledAt: string;
  completedAt?: string;
  participants: string[];
  agendaItems: AgendaItem[];
  decisions: Decision[];
  tries?: TryItem[];
  rawTranscriptUrl?: string;
  summary?: string;
  agentRunIds: string[];
  healthScore?: number;
}

// === CeremonyHealthScore ===
export interface CeremonyHealthScore {
  id: string;
  sprintId: string;
  ritual: Ritual;
  score: number;           // 0-100
  signals: {
    attendance: number;     // 出席率
    onTime: number;         // 開始時刻通り
    durationVariance: number; // 予定時間との差
    actionableOutputs: number; // 出てきたアクション数
    qualityRate: number;    // チケット品質充足率 (DoD/SP/US紐付けが揃っている割合)
  };
  computedAt: string;
}

// (AgentRun / Member は変更なし)
```

---

## 3. インデックス / クエリパターン

| ユースケース | クエリ | 必要インデックス |
|---|---|---|
| Project 配下のチケット | `/tickets` where `projectId == X` orderBy `priority desc` | `(projectId, priority)` |
| 3 区画ビュー (Backlog/Refinement/Planning 共通) | `/tickets` where `workspaceId == X` を取得し、`sprintId` (CURRENT/NEXT) と未設定 (BACKLOG) で 3 区画に振り分け、各区画内を `orderIndex` 昇順表示 | `workspaceId` (区画分け・並びはクライアント側) |
| 現スプリントのチケット一覧 | `/tickets` where `sprintId == X` orderBy `priority desc` | `(sprintId, priority)` |
| Refinement 候補 (high valueImpact / 未見積) | where `projectId == X and valueImpact == 'high' and estimatePt == null` | `(projectId, valueImpact, estimatePt)` |
| priority × valueImpact ミスマッチ | where `priority == 'urgent' and valueImpact == 'low'` | `(priority, valueImpact)` |
| 戦略意図欠落 Epic (Refinement 第6観点) | `/epics` where `rationale == null` (or empty) | `rationale` |
| Story 配下のチケット | `/tickets` where `parentTicketId == US-xxx` | `parentTicketId` |
| 依存先チケット | where `blockedBy contains WC-xxx` | `blockedBy` (array-contains) |
| Project 配下の Epic | `/epics` where `projectId == X` | `projectId` |
| Epic 配下の Story | `/stories` where `epicId == EP-xxx` | `epicId` |
| 担当者別アクティブ | where `assigneeId == U` and `status in [...]` | `(assigneeId, status)` |
| エージェント失敗履歴 | `/agentRuns` where `status=='failed'` orderBy `startedAt desc` | `(status, startedAt)` |
| 儀式健全性時系列 | `/ceremonyHealth` where `ritual==X` orderBy `computedAt desc` | `(ritual, computedAt)` |
| チケットの見積もりセッション | `/estimationSessions` where `ticketId == X and status in ['voting','revealed']` | `(ticketId, status)` |
| 種別別チケット (ルールエンジン入力) | `/tickets` where `workspaceId == X` (全件取得しクライアント側で type 判定) | `workspaceId` |
| RetroTry 積み上げ一覧 | `/retroTries` where `workspaceId == X` orderBy `createdAt desc` | `(workspaceId, createdAt)` |
| RetroNote ボード一覧 | `/retroNotes` where `workspaceId == X` (ソート/列分けはクライアント側) | `workspaceId` |
| 招待 bind 用メンバー検索 | `members.listByEmail` (全 ws 横断で email 一致のセンチネル doc を検索) | `email` |

---

## 4. 健全性スコア計算式

各儀式の `score` (0-100) =
- `0.25 × attendance`               (出席率)
- `0.20 × onTime`                   (時刻通り開始)
- `0.15 × (1 - durationVariance)`   (時間内に終わったか)
- `0.20 × normalize(actionableOutputs)` (出力されたアクション数)
- `0.20 × qualityRate`              (チケット品質充足率)

→ 「儀式は時間通り終わっているけど、Try が消化されていない (actionableOutputs=20%) / チケット品質が低い (qualityRate=40%)」のような診断が出せる。

---

## 5. ストレージレイアウト

| データ種別 | 保存先 |
|---|---|
| ドキュメント (型定義のもの) | Firestore |
| エージェントの長文プロンプト履歴 | Cloud Storage `gs://belvedere-{env}-agent-logs/` |
| ベクトル (過去ふりかえりや過去類似タスク) | Vertex AI Vector Search |
| バックアップ | Firestore Daily Export → Cloud Storage |

---

## 6. シードデータ

`packages/seed/src/`:
- `projects.ts` — 1件 (PRJ-belvedere-core, idPrefix=BV) — **2026-05-03 追加**
- `epics.ts` — 4件 (EP-1..EP-4) / 全件 `projectId: PRJ-belvedere-core` + `valueImpact`
- `tickets.ts` — 12件 (WC-101..WC-112) / 全件 `projectId` + `valueImpact` + 一部 `blockedBy` / type は全チケット設定済 (WC-108 のみ意図的未設定 = TYPE_MISSING デモ) / WC-105 は startedAt 付き (停滞デモ)
- `sprints.ts` — 3件 (Sprint 12-14)
- `members.ts` — 5名 (会社メアドは `@example.com` ダミー化済 / 2026-05-04)

User Story (US-101..US-402) は実装移行中: 旧 `apps/web/lib/data.ts` (Next.js 時代) は **削除済**。`useDemoData.ts` は R3 (2026-06-11) で削除し全画面 shared Ticket + 実 API に統一。US-* は Mock LLM 出力のみで参照。将来 `seed/stories.ts` に移管予定。

---

## 7. 権限モデル (ロールと操作マトリクス / 2026-06-23 再設計)

`Member.role` の正準値は **`admin | po | sm | dev`** (`WorkspaceRole`)。旧 `owner` / `guest` は廃止し、
永続値に残る移行期は middleware の `normalizeRole` が `owner→admin` / `guest→dev` に読み替える
(handler が見る `ctx.role` は常にこの 4 値)。

| ロール | 位置づけ |
|---|---|
| **admin** | その Workspace の全権者。**全操作を bypass**。Workspace を作った人が自動で admin (1 人運用 / 審査員デモはこれ)。 |
| **po** | プロダクトオーナー。価値・優先順位・バックログ整序を司る。 |
| **sm** | スクラムマスター。儀式運営 (Sprint 作成/開始、見積もり進行) を司る。 |
| **dev** | 開発者。チケット編集と見積もり投票に参加する。 |

> **owner はワークスペース内の役割ではない** — プラットフォーム全体で「人を Belvedere に招待する
> (ログイン許可を出す)」だけの本人 (`mygolanglearn@gmail.com`)。実装上は `config/email-allowlist.ts`
> に `login-only` エントリを足すこと = 招待。所属ゼロでログインした人は `needs_workspace` で自分の
> Workspace 作成へ誘導され、作成すればその部屋の admin になる。

### 操作マトリクス (`apps/api/src/permissions.ts` の `MATRIX` が単一ソース)

admin は全 ✅ (bypass)。下表は po/sm/dev の許可。`forbidden(action)` が 403 時に「どの操作が・誰なら
可能か」を日本語 message で返す。

| 操作 (Action) | admin | po | sm | dev |
|---|:--:|:--:|:--:|:--:|
| メンバー招待 `member.invite` | ✅ | ✅ | ✅ | ❌ |
| バックログ並び替え `backlog.reorder` | ✅ | ✅ | ❌ | ❌ |
| Epic/Story 価値・優先度 `epic.write` | ✅ | ✅ | ❌ | ❌ |
| Sprint Goal `sprint.goal` | ✅ | ✅ | ✅ | ❌ |
| Sprint 作成/開始/終了 `sprint.manage` | ✅ | ❌ | ✅ | ❌ |
| 見積 開始/開示 `estimation.facilitate` | ✅ | ❌ | ✅ | ❌ |
| 見積 投票 `estimation.vote` | ✅ | ❌ | ❌ | ✅ |
| 見積 採用 `estimation.adopt` | ✅ | ❌ | ✅ | ✅ |
| Ticket CRUD `ticket.write` | ✅ | ✅ | ✅ | ✅ |
| AI Agent 実行 `agent.invoke` | ✅ | ✅ | ✅ | ✅ |

> この表と `permissions.ts` の `MATRIX` がドリフトしたら `apps/api/test/permissions.test.ts` /
> `permission-enforcement.test.ts` が落ちる (action×role を実際に handler で踏むため)。表を直す時は
> 両方を直す。本番 Firestore の役割 migration (`owner→admin` 等) と zod enum の締めは提出後。
