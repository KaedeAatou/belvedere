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
  createdAt: string;
  updatedAt: string;
  createdBy: AgentSource;
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
  /** 所属 Project (省略時は Workspace のデフォルト Project) */
  projectId?: string;
  name: string;
  description?: string;
  ownerId?: string;
  /** スプリント横断で多数のStoryをまとめる単位 */
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  /** プロダクトゴールへの貢献度 (Epic レベルでも持てる) */
  valueImpact?: ValueImpact;
  createdAt: string;
}

export interface UserStory {
  id: string;
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
