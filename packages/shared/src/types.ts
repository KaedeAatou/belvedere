// Belvedere — 共通型定義
// DATA_MODEL.md と同期

export type Status = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
/** プロダクトゴール (Workspace.productGoal) への貢献度。priority (緊急度寄り) と独立した軸 */
export type ValueImpact = 'low' | 'medium' | 'high';
export type Ritual = 'planning' | 'daily' | 'refinement' | 'review' | 'retrospective';
/**
 * チケット種別 (2026-06-10 導入)。PBI (story/spike/bug) と How (task) と 計画外 (incident) を区別。
 * 詳細: references/agile-knowledge-base/ticket-types.md / docs/design-ticket-types.md
 */
export type TicketType = 'story' | 'task' | 'spike' | 'bug' | 'incident';

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
  /** 表示名 (任意)。未設定時は番号のみ表示 (「Sprint 13」)、設定時は「Sprint 13 · 決済MVP」。 */
  name?: string;
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
  /** チケット種別 (2026-06-10)。未設定は TYPE_MISSING ルールが検出する */
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
  /** Review 儀式でステークホルダーがこの完成 increment (チケット) に残した指摘。Review は完成チケットをデモして関係者が指摘する場なので、新規起票せず対象チケット自体に蓄積する。seed (immutable) は持たないため optional */
  reviewNotes?: string[];
  /**
   * バックログ上の手動並び順 (Linear/Jira 型 d&d)。fractional indexing —
   * 隣接 2 件の中間値を採番し、リバランス頻度を抑える。seed (immutable) は値を持たないため optional。
   * 未設定チケットは repo 層のフォールバック順 (priority 降順 → createdAt 昇順) で並ぶ。
   */
  orderIndex?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: AgentSource;
}

// === EstimationSession (見積もりポーカー / 2026-06-10) ===
export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;
/** 投票値。'?' = 情報不足で見積もれない */
export type EstimationValue = (typeof FIBONACCI_POINTS)[number] | '?';

export interface EstimationVote {
  userId: string;
  value: EstimationValue;
  submittedAt: string;
}

/**
 * 見積もりポーカーのセッション。Story の estimatePt を Workspace メンバの
 * 隠蔽投票 → 一斉開示 → 採用 で決める。開示前はサーバが他人の vote を返さない (隠蔽強制)。
 */
export interface EstimationSession {
  id: string;
  workspaceId: string;
  ticketId: string;
  status: 'voting' | 'revealed' | 'adopted' | 'discarded';
  votes: EstimationVote[];
  adoptedValue?: number;
  createdAt: string;
  createdBy: string;
  revealedAt?: string;
  adoptedAt?: string;
}

// === RetroTry (carry-forward 積み上げ / 2026-06-11) ===
/**
 * Retrospective で「次に試すこと (Try)」を d&d で積み上げると生成される、
 * スプリントを跨いで蓄積される改善アクション。
 * この積み上げ (carry-forward stack) は各儀式 Agent がコンテキストとして参照する。
 */
export interface RetroTry {
  id: string;
  workspaceId: string;
  /** Try の本文 */
  text: string;
  /** 由来スプリントの番号 (表示用バッジ、例: 13) */
  sprintNumber: number;
  /** 由来スプリントの id。seed 由来等で不明なら省略 */
  sprintId?: string;
  /** 完了チェック (積み上げ上で「片付いた」とマークしたか) */
  done: boolean;
  createdAt: string; // ISO8601
  /** 積み上げに追加した人 (ctx.user.userId) */
  createdBy: string;
}

// === RetroNote (KPT ボードのノート / 2026-06-13) ===
/**
 * Retrospective の KPT ボード (Keep / Problem / Try) に貼る 1 枚のノート。
 * レトロを実際に開催するための実データ — メンバーが各列にノートを追加し、投票で
 * 関心の高さを可視化する。Try 列のノートは d&d で RetroTry (carry-forward 積み上げ)
 * へ昇格でき、そこからスプリント横断の継続改善アクションになる。
 */
export interface RetroNote {
  id: string;
  workspaceId: string;
  /** 由来スプリントの番号 (どのレトロで出たノートか。表示・スコープ用) */
  sprintNumber: number;
  /** KPT のどの列か */
  column: 'keep' | 'problem' | 'try';
  /** ノート本文 */
  text: string;
  /** ノートを書いた人 (Avatar / displayName 表示用) */
  authorId: string;
  /** 投票した userId 配列 (toggle 式)。関心の高さを votes.length で表す */
  votes: string[];
  createdAt: string; // ISO8601
  /** ノートを作成した人 (ctx.user.userId)。authorId と同一だが audit のため別フィールド */
  createdBy: string;
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
  /**
   * agent.invoke (Orchestrator 協議) で起動した子 run。深さ 1 固定 (子は agent.invoke を
   * 持たないため孫 run は生まれない)。協議していない通常 run では省略される (後方互換 optional)。
   */
  childRuns?: AgentRun[];
}

// === Member ===
/**
 * workspace 内の権限ロール (normalize 後の正準値 / 2026-06-23 再設計)。
 * - admin: その workspace の全権者 (作成者 = なんでもできる / 全 action を bypass)
 * - po/sm/dev: スクラム役割。権限はマトリクスで分担 (apps/api/src/permissions.ts)
 *
 * 旧 'owner'/'guest' は廃止。本番 Firestore は migrate-roles.ts で owner→admin / guest→dev に
 * 移行済 (2026-06-23) のため、型・schema とも正準 4 値に締めた。プラットフォーム全体の
 * 「招待だけする owner」は member role ではない (config/email-allowlist.ts の login-only)。
 */
export type WorkspaceRole = 'admin' | 'po' | 'sm' | 'dev';

export interface Member {
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  /** 正準 4 値。旧 'owner'/'guest' は migration 済で廃止 (middleware の normalizeRole は防御として残置)。 */
  role: WorkspaceRole;
  githubUsername?: string;
}

// === ApiKey ===
// per-user API キー (programmatic アクセス用トークン)。Firebase ID token / MCP サービストークンに
// 次ぐ第3の認証経路。発行ユーザー本人として振る舞い (userId/email を解決)、workspace は
// 既存どおり X-Workspace-Id で選択する。平文トークンは保存せず sha256 ハッシュだけ持つ
// (発行時 1 回だけ平文を返す)。
export interface ApiKey {
  id: string;          // 'apikey-xxxxxxxx' (generateId('apikey'))
  workspaceId: string; // 発行時の workspace (管理一覧のスコープ)
  userId: string;      // 所有者 = 発行ユーザー
  ownerEmail: string;  // AuthenticatedUser.email 復元用 (lowercase)
  name: string;        // ラベル
  tokenHash: string;   // sha256(token) hex。平文は保存しない
  tokenPrefix: string; // 表示用先頭 (例 'blv_a1b2c3')
  createdAt: string;   // ISO8601
  createdBy: string;   // userId (audit)
  lastUsedAt?: string; // 認証成功時に best-effort 更新
}

/** list/get で返す安全ビュー (tokenHash を絶対に外へ出さない)。 */
export type ApiKeyView = Omit<ApiKey, 'tokenHash'>;
