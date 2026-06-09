// Repository インタフェース
// メモリ実装を最初に提供。後で Firestore 実装に差し替え可能。
//
// Phase 1-B (2026-06-10): IDOR fix のため、全 list メソッドは workspaceId を必須引数化。
// Firestore Security Rules はラストガードだが、API 層で自前 enforcement する設計
// (API caller → buildTools(repo, workspaceId) → tools → repo.*.list({ workspaceId, ... }))。

import type {
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
} from '@belvedere/shared';

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
  get(userId: string): Promise<Member | null>;
  /**
   * 認証ミドルウェアが「この user は どの Workspace に所属しているか」を解決する用。
   * workspaceMiddleware の前段で呼ばれるため workspaceId 縛りが効かない (まだ workspace 未確定)。
   * 個人情報は userId / email / workspaceId / role に限定すること (PII リーク防止)。
   */
  listByUserId(userId: string): Promise<Member[]>;
  /**
   * 招待 UI (Phase 1-E) / 初回 owner 自動登録 (Phase 1-B / 2026-06-10) で使う。
   * doc id = userId なので、既存ユーザの role 変更は同じ userId で再投入する形になる。
   */
  upsert(m: Member): Promise<void>;
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

/**
 * 全リポジトリを束ねたコンテナ。
 * ServiceLocator的に使う — 実装差し替えポイント。
 */
export interface RepoContainer {
  tickets: TicketRepository;
  sprints: SprintRepository;
  projects: ProjectRepository;
  epics: EpicRepository;
  stories: UserStoryRepository;
  members: MemberRepository;
  ceremonies: CeremonyRepository;
  agentRuns: AgentRunRepository;
  ceremonyHealth: CeremonyHealthRepository;
}
