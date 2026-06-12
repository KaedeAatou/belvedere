// Repository インタフェース
// メモリ実装を最初に提供。後で Firestore 実装に差し替え可能。
//
// Phase 1-B (2026-06-10): IDOR fix のため、全 list メソッドは workspaceId を必須引数化。
// Firestore Security Rules はラストガードだが、API 層で自前 enforcement する設計
// (API caller → buildTools(repo, workspaceId) → tools → repo.*.list({ workspaceId, ... }))。

import type {
  Workspace,
  Ticket,
  Sprint,
  Member,
  Ceremony,
  AgentRun,
  CeremonyHealthScore,
  Epic,
  UserStory,
  Project,
  Status,
  Ritual,
  EstimationSession,
  RetroTry,
} from '@belvedere/shared';

export interface WorkspaceRepository {
  /**
   * 指定 id 群に該当する Workspace doc を返す。
   * 認証ミドルウェア / listMyWorkspaces が「user の所属 ws を members から横断検索 →
   * その workspaceId 群で Workspace doc を引く」流れで使う (workspaceId 縛りより前)。
   * doc が存在しない id (seed 由来で Workspace doc を持たない ws-belvedere 等) は
   * 結果に含まれない (呼び出し側でフォールバックする)。
   */
  listByIds(ids: string[]): Promise<Workspace[]>;
  get(id: string): Promise<Workspace | null>;
  upsert(w: Workspace): Promise<void>;
}

export interface TicketQuery {
  workspaceId: string;
  projectId?: string;
  sprintId?: string;
  status?: Status;
  assigneeId?: string;
  ritual?: Ritual;
  storyId?: string;
}

export interface TicketRepository {
  list(q: TicketQuery): Promise<Ticket[]>;
  get(id: string): Promise<Ticket | null>;
  upsert(t: Ticket): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SprintRepository {
  list(opts: { workspaceId: string }): Promise<Sprint[]>;
  get(id: string): Promise<Sprint | null>;
  upsert(s: Sprint): Promise<void>;
}

export interface ProjectRepository {
  list(opts: { workspaceId: string }): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
}

export interface EpicRepository {
  list(opts: { workspaceId: string; projectId?: string }): Promise<Epic[]>;
  get(id: string): Promise<Epic | null>;
  upsert(e: Epic): Promise<void>;
}

export interface UserStoryRepository {
  list(opts: { workspaceId: string; projectId?: string; epicId?: string }): Promise<UserStory[]>;
  get(id: string): Promise<UserStory | null>;
}

export interface MemberRepository {
  list(opts: { workspaceId: string }): Promise<Member[]>;
  /**
   * doc id は複合キー `${workspaceId}:${userId}` (1 user が複数 Workspace に所属可能)。
   * 単独 userId で引くと別 Workspace の所属を取り違える / 上書きするため、必ず
   * workspaceId をスコープに渡す。横断検索は listByUserId / listByEmail を使う。
   */
  get(workspaceId: string, userId: string): Promise<Member | null>;
  /**
   * 認証ミドルウェアが「この user は どの Workspace に所属しているか」を解決する用。
   * workspaceMiddleware の前段で呼ばれるため workspaceId 縛りが効かない (まだ workspace 未確定)。
   * doc id 非依存 (userId field の where クエリ) なので複合キー化の影響を受けない。
   * 個人情報は userId / email / workspaceId / role に限定すること (PII リーク防止)。
   */
  listByUserId(userId: string): Promise<Member[]>;
  /**
   * email で全 Workspace 横断検索する。招待 → 初回ログイン bind (Phase 1-E) で、
   * uid 未確定の招待センチネル (`invite:<workspaceId>:<email>`) を email で引くのに使う。
   * workspaceMiddleware の前段で呼ばれるため workspaceId 縛りが効かない。
   * doc id 非依存 (email field の where クエリ) なので複合キー化の影響を受けない。
   * 個人情報は userId / email / workspaceId / role に限定すること (PII リーク防止)。
   */
  listByEmail(email: string): Promise<Member[]>;
  /**
   * 招待 UI (Phase 1-E) / 初回 owner 自動登録 (Phase 1-B / 2026-06-10) で使う。
   * doc id = `${m.workspaceId}:${m.userId}` の複合キーなので、同じ user でも Workspace が
   * 違えば別 doc になる (= 複数 Workspace 所属が壊れない)。role 変更は同じ複合キーで再投入。
   */
  upsert(m: Member): Promise<void>;
  /**
   * 招待 (`invite:<email>` センチネル) の取消、および招待 → 実 uid bind 時の旧 doc 削除で使う。
   * 複合キー `${workspaceId}:${userId}` (センチネルなら userId = `invite:<workspaceId>:<email>`) で
   * 1 Workspace 分の doc だけを消す。
   */
  delete(workspaceId: string, userId: string): Promise<void>;
}

export interface CeremonyRepository {
  list(opts: { workspaceId: string; sprintId: string }): Promise<Ceremony[]>;
  get(id: string): Promise<Ceremony | null>;
  upsert(c: Ceremony): Promise<void>;
}

export interface AgentRunRepository {
  list(opts: { workspaceId: string; agentName?: string; status?: AgentRun['status']; limit?: number }): Promise<AgentRun[]>;
  get(id: string): Promise<AgentRun | null>;
  add(r: AgentRun): Promise<void>;
}

export interface CeremonyHealthRepository {
  list(opts: { workspaceId: string; sprintId?: string; ritual?: Ritual }): Promise<CeremonyHealthScore[]>;
  add(s: CeremonyHealthScore): Promise<void>;
}

export interface EstimationRepository {
  list(opts: { workspaceId: string; ticketId?: string; status?: EstimationSession['status'] }): Promise<EstimationSession[]>;
  get(id: string): Promise<EstimationSession | null>;
  upsert(s: EstimationSession): Promise<void>;
}

export interface RetroTryRepository {
  list(opts: { workspaceId: string }): Promise<RetroTry[]>;
  get(id: string): Promise<RetroTry | null>;
  upsert(t: RetroTry): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * 全リポジトリを束ねたコンテナ。
 * ServiceLocator的に使う — 実装差し替えポイント。
 */
export interface RepoContainer {
  workspaces: WorkspaceRepository;
  tickets: TicketRepository;
  sprints: SprintRepository;
  projects: ProjectRepository;
  epics: EpicRepository;
  stories: UserStoryRepository;
  members: MemberRepository;
  ceremonies: CeremonyRepository;
  agentRuns: AgentRunRepository;
  ceremonyHealth: CeremonyHealthRepository;
  estimations: EstimationRepository;
  retroTries: RetroTryRepository;
}
