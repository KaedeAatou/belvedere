// Belvedere — 共通型定義
// DATA_MODEL.md と同期

export type Status = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
/** プロダクトゴール (Workspace.productGoal) への貢献度。priority (緊急度寄り) と独立した軸 */
export type ValueImpact = 'low' | 'medium' | 'high';
export type Ritual = 'planning' | 'daily' | 'refinement' | 'review' | 'retrospective';

export type AgentName =
  | 'orchestrator'
  | 'planner'
  | 'daily'
  | 'refinement'
  | 'reviewer'
  | 'retrospective';

export type AgentSource =
  | 'human'
  | `agent:${AgentName}`;

// === Workspace ===
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  productGoal: string;
  ownerId: string;
  createdAt: string; // ISO8601
}

// === Project ===
/**
 * Workspace 内の Jira プロジェクト相当。idPrefix は Project ごとに自由設定可能で、
 * 配下の Epic / UserStory / Ticket の ID は `${idPrefix}-${number}` フォーマットになる。
 * 既存 seed (EP-/US-/WC-) はデフォルト Project "Belvedere Core" 配下と解釈する。
 */
export interface Project {
  id: string;
  workspaceId: string;
  /** プロジェクト名 (例: "Belvedere Core") */
  name: string;
  /** ID 接頭辞 (例: "BV"). Epic/UserStory/Ticket の ID 採番に使う */
  idPrefix: string;
  description?: string;
  ownerId?: string;
  createdAt: string;
}

// === Sprint ===
export interface Sprint {
  id: string;
  workspaceId: string;
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
  id: string;
  /** 所属 Workspace (IDOR fix 用、Phase 1-B / 2026-06-10 で必須化)。projectId から導けるが where 1-hop で済ますために denormalize */
  workspaceId: string;
  /** 所属 Project (省略時は Workspace のデフォルト Project = Belvedere Core を指す) */
  projectId?: string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  /** プロダクトゴールへの貢献度 (priority と独立した軸) */
  valueImpact?: ValueImpact;
  ritual?: Ritual;
  sprintId?: string;
  assigneeId?: string;
  estimatePt?: number;
  acceptanceCriteria?: string[];
  labels?: string[];
  parentTicketId?: string;
  /** 依存先チケット ID (このチケットを進めるために先行で完了が必要) */
  blockedBy?: string[];
  /** Sprint Review 録画から自動抽出された指摘の場合、出典の ReviewRecording.id */
  sourceRecordingId?: string;
  /** 録画内の発言タイムスタンプ (秒) — UI から動画の該当箇所にジャンプする用 */
  sourceTimestampSec?: number;
  /** 抽出元の発言テキスト (Reviewer Agent が文字起こし → 抜粋) */
  sourceQuote?: string;
  /** 発言者の Member.userId */
  sourceSpeakerId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: AgentSource;
}

// === ReviewRecording (Sprint Review 録画 / 2026-05-04 追加) ===
/**
 * Sprint Review の録画動画。Reviewer Agent が Gemini Multimodal で動画を読み取り、
 * 発言から指摘を抽出 → Ticket 候補 (sourceRecordingId 紐付き) を生成する。
 */
export interface ReviewRecording {
  id: string;
  workspaceId: string;
  projectId?: string;
  sprintId: string;
  /** Cloud Storage URL (gs://belvedere-{env}-review-recordings/...) */
  videoUrl: string;
  /** 動画長 (秒) */
  durationSec?: number;
  uploadedAt: string;
  uploadedBy: string;
  /** この動画から Reviewer Agent が生成した Ticket ID 一覧 */
  extractedTicketIds?: string[];
  /** 抽出処理のステータス */
  extractionStatus?: 'pending' | 'running' | 'succeeded' | 'failed';
}

// === Ceremony ===
export interface AgendaItem {
  topic: string;
  source: 'agent' | 'human';
  ticketIds?: string[];
  durationMin?: number;
}

export interface Decision {
  text: string;
  decidedBy: string[];
  ticketsCreated?: string[];
}

export interface TryItem {
  text: string;
  ownerId?: string;
  carriedToTicketId?: string;
}

export interface Ceremony {
  id: string;
  workspaceId: string;
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

// === Epic / Story ===
export interface Epic {
  id: string;
  /** 所属 Workspace (IDOR fix 用、Phase 1-B / 2026-06-10 で必須化) */
  workspaceId: string;
  /** 所属 Project (省略時は Workspace のデフォルト Project) */
  projectId?: string;
  name: string;
  description?: string;
  ownerId?: string;
  /** スプリント横断で多数のStoryをまとめる単位 */
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  /** プロダクトゴールへの貢献度 (Epic レベルでも持てる) */
  valueImpact?: ValueImpact;
  /**
   * なぜこの Epic が必要か (戦略意図 / Why)。
   * 開発者がチケット画面から 1 クリックで辿れるべき情報。
   * 空のままだと配下のチケットが「何のために?」を見失う形骸化サイン。
   * Refinement Agent の第6観点「戦略整合性」がこれを使ってドリフトを検出する。
   */
  rationale?: string;
  /** 達成判定の数値指標 (例: "DoD 充足率 60→90%", "デモ環境セットアップ 3h→10min") */
  successMetric?: string;
  /** 上位戦略テーマ (任意、SAFe Strategic Theme に相当) */
  strategicTheme?: string;
  createdAt: string;
}

export interface UserStory {
  id: string;
  /** 所属 Workspace (IDOR fix 用、Phase 1-B / 2026-06-10 で必須化) */
  workspaceId: string;
  /** 所属 Project (省略時は Workspace のデフォルト Project) */
  projectId?: string;
  epicId: string;
  /** As a [role]」のロール名 */
  role: string;
  /** want 句 (実現したいこと) */
  want: string;
  /** so that 句 (理由・効果) */
  so: string;
  /** タイトルとして表示する短い名前 */
  title: string;
  /** 紐付くタスクID */
  taskIds: string[];
  /** プロダクトゴールへの貢献度 */
  valueImpact?: ValueImpact;
}

// === CeremonyHealthScore ===
export interface CeremonyHealthScore {
  id: string;
  workspaceId: string;
  sprintId: string;
  ritual: Ritual;
  score: number; // 0-100
  signals: {
    attendance: number;
    onTime: number;
    durationVariance: number;
    actionableOutputs: number;
    /** チケット品質 (DoD/SP/US紐付け) の充足率 */
    qualityRate: number;
  };
  computedAt: string;
}

// === AgentRun ===
export interface AgentStep {
  type: 'thought' | 'tool_call' | 'tool_result' | 'output';
  at: string;
  content: unknown;
  toolName?: string;
  durationMs?: number;
}

export interface AgentRun {
  id: string;
  workspaceId: string;
  agentName: AgentName;
  trigger: 'schedule' | 'event' | 'human';
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  inputContext: Record<string, unknown>;
  steps: AgentStep[];
  outputArtifacts?: {
    ticketIds?: string[];
    ceremonyId?: string;
    summary?: string;
  };
  llmUsage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  error?: { message: string; stack?: string };
}

// === Member ===
export interface Member {
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  role: 'owner' | 'sm' | 'po' | 'dev' | 'guest';
  slackUserId?: string;
  githubUsername?: string;
}
