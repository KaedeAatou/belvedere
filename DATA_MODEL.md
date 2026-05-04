# Belvedere — Data Model

> Firestore (NoSQL ドキュメント) 前提。型は TypeScript / Python の両方を後続で生成。
> 2026-04-30 改訂: 「WindEvent」「WingScore」を廃止し、`Epic` / `UserStory` / `CeremonyHealthScore` に置き換え。
> 2026-05-03 改訂: **`Project` エンティティ追加** (Jira プロジェクト相当、`idPrefix` 自由設定) + **`valueImpact` 軸** (priority と独立した high/medium/low) + **`blockedBy`** (依存関係) + **`Ritual = 'refinement'` 追加** (5 リテラル化)。

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
| `AgentRun` | エージェント実行ログ | `/workspaces/{wsId}/agentRuns/{runId}` |
| `Member` | チームメンバ | `/workspaces/{wsId}/members/{userId}` |

階層: **`Workspace` > `Project` > `Epic` > `UserStory` > `Task` (5 階層)**

- `Project` ごとに `idPrefix` を自由設定 (例: `BV` for Belvedere Core)
- 配下の Epic / UserStory / Ticket の ID は `${idPrefix}-${number}` フォーマット
- 既存 seed (`EP-1..4` / `US-101..US-402` / `WC-101..112`) は **デフォルト Project (Belvedere Core, idPrefix=BV)** 配下と解釈し、ID 値は変更しない

---

## 2. TypeScript 型定義

```ts
// packages/shared/src/types.ts (抜粋)

export type Status = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ValueImpact = 'low' | 'medium' | 'high';   // プロダクトゴール貢献度 (priority と独立)
export type Ritual = 'planning' | 'daily' | 'refinement' | 'review' | 'retrospective';   // 5 リテラル

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
  number: number;
  startsAt: string;
  endsAt: string;
  goal: string;
  capacity: number;
  velocity?: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
}

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
  parentTicketId?: string;        // 親 Story (US-xxx) や 元 Try
  blockedBy?: string[];           // 依存先チケット ID (このチケットを進める前に完了が必要)
  createdAt: string;
  updatedAt: string;
  createdBy: 'human' | `agent:${string}`;
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
| 現スプリントのチケット一覧 | `/tickets` where `sprintId == X` orderBy `priority desc` | `(sprintId, priority)` |
| Refinement 候補 (high valueImpact / 未見積) | where `projectId == X and valueImpact == 'high' and estimatePt == null` | `(projectId, valueImpact, estimatePt)` |
| priority × valueImpact ミスマッチ | where `priority == 'urgent' and valueImpact == 'low'` | `(priority, valueImpact)` |
| Story 配下のチケット | `/tickets` where `parentTicketId == US-xxx` | `parentTicketId` |
| 依存先チケット | where `blockedBy contains WC-xxx` | `blockedBy` (array-contains) |
| Project 配下の Epic | `/epics` where `projectId == X` | `projectId` |
| Epic 配下の Story | `/stories` where `epicId == EP-xxx` | `epicId` |
| 担当者別アクティブ | where `assigneeId == U` and `status in [...]` | `(assigneeId, status)` |
| エージェント失敗履歴 | `/agentRuns` where `status=='failed'` orderBy `startedAt desc` | `(status, startedAt)` |
| 儀式健全性時系列 | `/ceremonyHealth` where `ritual==X` orderBy `computedAt desc` | `(ritual, computedAt)` |

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
| 議事録音声 / 動画 | Cloud Storage `gs://kazaguruma-{env}-transcripts/` (バケット名は内部識別子据え置き / displayName は Belvedere) |
| エージェントの長文プロンプト履歴 | Cloud Storage `gs://kazaguruma-{env}-agent-logs/` (同上) |
| ベクトル (過去ふりかえりや過去類似タスク) | Vertex AI Vector Search |
| バックアップ | Firestore Daily Export → Cloud Storage |

---

## 6. シードデータ

`packages/seed/src/`:
- `projects.ts` — 1件 (PRJ-belvedere-core, idPrefix=BV) — **2026-05-03 追加**
- `epics.ts` — 4件 (EP-1..EP-4) / 全件 `projectId: PRJ-belvedere-core` + `valueImpact`
- `tickets.ts` — 12件 (WC-101..WC-112) / 全件 `projectId` + `valueImpact` + 一部 `blockedBy`
- `sprints.ts` — 3件 (Sprint 12-14)
- `members.ts` — 5名 (会社メアドは `@example.com` ダミー化済 / 2026-05-04)

User Story (US-101..US-402) は実装移行中: 旧 `apps/web/lib/data.ts` (Next.js 時代) は **削除済**。現在は `apps/web/composables/useDemoData.ts` (Nuxt 3, BLV-201..227 デモ用) と Mock LLM 出力で参照されている。将来 `seed/stories.ts` に移管予定。
