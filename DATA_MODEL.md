# Belvedere — Data Model

> Firestore (NoSQL ドキュメント) 前提。型は TypeScript / Python の両方を後続で生成。
> 2026-04-30 改訂: 「WindEvent」「WingScore」を廃止し、`Epic` / `UserStory` / `CeremonyHealthScore` に置き換え。

---

## 1. 主要エンティティ一覧

| エンティティ | 役割 | コレクションパス |
|---|---|---|
| `Workspace` | チーム単位 | `/workspaces/{wsId}` |
| `Epic` | 戦略単位 (複数 Story を束ねる、スプリント横断) | `/workspaces/{wsId}/epics/{epicId}` |
| `UserStory` | 要求の単位 (As a / I want / So that) | `/workspaces/{wsId}/stories/{storyId}` |
| `Sprint` | 2週間のスプリント | `/workspaces/{wsId}/sprints/{sprintId}` |
| `Ticket` | タスク (実作業単位、WC-xxx) | `/workspaces/{wsId}/tickets/{ticketId}` |
| `Ceremony` | 儀式の1回分 | `/workspaces/{wsId}/ceremonies/{ceremonyId}` |
| `CeremonyHealthScore` | 儀式ごとの健全性スコア時系列 | `/workspaces/{wsId}/ceremonyHealth/{scoreId}` |
| `AgentRun` | エージェント実行ログ | `/workspaces/{wsId}/agentRuns/{runId}` |
| `Member` | チームメンバ | `/workspaces/{wsId}/members/{userId}` |

階層: `Epic` (戦略) > `UserStory` (要求) > `Ticket` (実作業)

---

## 2. TypeScript 型定義

```ts
// packages/shared/src/types.ts (抜粋)

export type Status = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Ritual = 'planning' | 'daily' | 'review' | 'retrospective';

// === Workspace ===
export interface Workspace {
  id: string;
  name: string;
  slug: string;            // 'kazaguruma-team'
  productGoal: string;     // "形骸化したスクラムをAIが品質と運営で底上げする"
  createdAt: string;
  ownerId: string;
}

// === Epic ===
export interface Epic {
  id: string;              // "EP-1"
  name: string;
  description?: string;
  ownerId?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

// === UserStory ===
export interface UserStory {
  id: string;              // "US-101"
  epicId: string;          // "EP-2"
  role: string;            // "PO" / "SM" / ...
  want: string;            // "顧客の声をスプリント計画に流したい"
  so: string;              // "I want VOC in planning"
  title: string;
  taskIds: string[];       // ["WC-101", "WC-105"]
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
  id: string;              // "WC-105"
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  ritual?: Ritual;
  sprintId?: string;
  assigneeId?: string;
  estimatePt?: number;
  acceptanceCriteria?: string[];  // = Definition of Done
  labels?: string[];
  parentTicketId?: string;        // 親 Story や 元 Try
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
| 現スプリントのチケット一覧 | `/tickets` where `sprintId == X` orderBy `priority desc` | `(sprintId, priority)` |
| Story 配下のチケット | `/tickets` where `parentTicketId == US-xxx` | `parentTicketId` |
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
| 議事録音声 / 動画 | Cloud Storage `gs://kazaguruma-{env}-transcripts/` |
| エージェントの長文プロンプト履歴 | Cloud Storage `gs://kazaguruma-{env}-agent-logs/` |
| ベクトル (過去ふりかえりや過去類似タスク) | Vertex AI Vector Search |
| バックアップ | Firestore Daily Export → Cloud Storage |

---

## 6. シードデータ

`packages/seed/src/`:
- `epics.ts` — 4件 (EP-1..EP-4)
- `tickets.ts` — 12件 (WC-101..WC-112)
- `sprints.ts` — 3件 (Sprint 12-14)
- `members.ts` — 5名

User Story は `apps/web/lib/data.ts` で静的定義 (将来 seed/stories.ts に移管予定)。
