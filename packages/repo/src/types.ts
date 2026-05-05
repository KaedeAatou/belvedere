// Repository インタフェース
// メモリ実装を最初に提供。後で Firestore 実装に差し替え可能。

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
  projectId?: string;
  sprintId?: string;
  status?: Status;
  assigneeId?: string;
  ritual?: Ritual;
  storyId?: string;
}

export interface TicketRepository {
  list(q?: TicketQuery): Promise<Ticket[]>;
  get(id: string): Promise<Ticket | null>;
  upsert(t: Ticket): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SprintRepository {
  list(): Promise<Sprint[]>;
  get(id: string): Promise<Sprint | null>;
  upsert(s: Sprint): Promise<void>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
}

export interface EpicRepository {
  list(opts?: { projectId?: string }): Promise<Epic[]>;
  get(id: string): Promise<Epic | null>;
  upsert(e: Epic): Promise<void>;
}

export interface UserStoryRepository {
  list(opts?: { projectId?: string; epicId?: string }): Promise<UserStory[]>;
  get(id: string): Promise<UserStory | null>;
}

export interface MemberRepository {
  list(): Promise<Member[]>;
  get(userId: string): Promise<Member | null>;
}

export interface CeremonyRepository {
  list(sprintId: string): Promise<Ceremony[]>;
  get(id: string): Promise<Ceremony | null>;
  upsert(c: Ceremony): Promise<void>;
}

export interface AgentRunRepository {
  list(opts?: { agentName?: string; status?: AgentRun['status']; limit?: number }): Promise<AgentRun[]>;
  get(id: string): Promise<AgentRun | null>;
  add(r: AgentRun): Promise<void>;
}

export interface CeremonyHealthRepository {
  list(opts?: { sprintId?: string; ritual?: Ritual }): Promise<CeremonyHealthScore[]>;
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
