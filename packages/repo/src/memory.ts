// メモリ実装。seed をベースにプロセス内で完結。
// Firestore に置き換える時はインタフェースのまま実装差し替え。

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
  Ritual,
} from '@kazaguruma/shared';
import { seedTickets, seedSprints, seedMembers, seedEpics, seedProjects } from '@kazaguruma/seed';
import type {
  TicketRepository,
  SprintRepository,
  ProjectRepository,
  EpicRepository,
  UserStoryRepository,
  MemberRepository,
  CeremonyRepository,
  AgentRunRepository,
  CeremonyHealthRepository,
  TicketQuery,
  RepoContainer,
} from './types';

class MemTicketRepo implements TicketRepository {
  private store = new Map<string, Ticket>();
  constructor(seed: Ticket[]) {
    for (const t of seed) this.store.set(t.id, { ...t });
  }
  async list(q: TicketQuery = {}): Promise<Ticket[]> {
    let xs = [...this.store.values()];
    if (q.sprintId) xs = xs.filter((t) => t.sprintId === q.sprintId);
    if (q.status) xs = xs.filter((t) => t.status === q.status);
    if (q.assigneeId) xs = xs.filter((t) => t.assigneeId === q.assigneeId);
    if (q.ritual) xs = xs.filter((t) => t.ritual === q.ritual);
    return xs;
  }
  async get(id: string): Promise<Ticket | null> { return this.store.get(id) ?? null; }
  async upsert(t: Ticket): Promise<void> { this.store.set(t.id, { ...t }); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
}

class MemSprintRepo implements SprintRepository {
  private store = new Map<string, Sprint>();
  constructor(seed: Sprint[]) { for (const s of seed) this.store.set(s.id, { ...s }); }
  async list(): Promise<Sprint[]> { return [...this.store.values()]; }
  async get(id: string): Promise<Sprint | null> { return this.store.get(id) ?? null; }
  async upsert(s: Sprint): Promise<void> { this.store.set(s.id, { ...s }); }
}

class MemProjectRepo implements ProjectRepository {
  private store = new Map<string, Project>();
  constructor(seed: Project[]) { for (const p of seed) this.store.set(p.id, { ...p }); }
  async list(): Promise<Project[]> { return [...this.store.values()]; }
  async get(id: string): Promise<Project | null> { return this.store.get(id) ?? null; }
}

class MemEpicRepo implements EpicRepository {
  private store = new Map<string, Epic>();
  constructor(seed: Epic[]) { for (const e of seed) this.store.set(e.id, { ...e }); }
  async list(opts: { projectId?: string } = {}): Promise<Epic[]> {
    let xs = [...this.store.values()];
    if (opts.projectId) xs = xs.filter((e) => e.projectId === opts.projectId);
    return xs;
  }
  async get(id: string): Promise<Epic | null> { return this.store.get(id) ?? null; }
}

class MemUserStoryRepo implements UserStoryRepository {
  // UI側 (apps/web/lib/data.ts) で静的定義しているものを将来的にここに移管予定。
  // 現状は空実装でリポジトリ抽象だけ確保しておく。
  private store = new Map<string, UserStory>();
  async list(opts: { projectId?: string; epicId?: string } = {}): Promise<UserStory[]> {
    let xs = [...this.store.values()];
    if (opts.projectId) xs = xs.filter((s) => s.projectId === opts.projectId);
    if (opts.epicId) xs = xs.filter((s) => s.epicId === opts.epicId);
    return xs;
  }
  async get(id: string): Promise<UserStory | null> { return this.store.get(id) ?? null; }
}

class MemMemberRepo implements MemberRepository {
  private store = new Map<string, Member>();
  constructor(seed: Member[]) { for (const m of seed) this.store.set(m.userId, { ...m }); }
  async list(): Promise<Member[]> { return [...this.store.values()]; }
  async get(userId: string): Promise<Member | null> { return this.store.get(userId) ?? null; }
}

class MemCeremonyRepo implements CeremonyRepository {
  private store = new Map<string, Ceremony>();
  async list(sprintId: string): Promise<Ceremony[]> {
    return [...this.store.values()].filter((c) => c.sprintId === sprintId);
  }
  async get(id: string): Promise<Ceremony | null> { return this.store.get(id) ?? null; }
  async upsert(c: Ceremony): Promise<void> { this.store.set(c.id, { ...c }); }
}

class MemAgentRunRepo implements AgentRunRepository {
  private store = new Map<string, AgentRun>();
  async list(opts: { agentName?: string; status?: AgentRun['status']; limit?: number } = {}): Promise<AgentRun[]> {
    let xs = [...this.store.values()];
    if (opts.agentName) xs = xs.filter((r) => r.agentName === opts.agentName);
    if (opts.status) xs = xs.filter((r) => r.status === opts.status);
    xs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (opts.limit) xs = xs.slice(0, opts.limit);
    return xs;
  }
  async get(id: string): Promise<AgentRun | null> { return this.store.get(id) ?? null; }
  async add(r: AgentRun): Promise<void> { this.store.set(r.id, r); }
}

class MemCeremonyHealthRepo implements CeremonyHealthRepository {
  private store: CeremonyHealthScore[] = [];
  async list(opts: { sprintId?: string; ritual?: Ritual } = {}): Promise<CeremonyHealthScore[]> {
    let xs = [...this.store];
    if (opts.sprintId) xs = xs.filter((s) => s.sprintId === opts.sprintId);
    if (opts.ritual) xs = xs.filter((s) => s.ritual === opts.ritual);
    return xs;
  }
  async add(s: CeremonyHealthScore): Promise<void> { this.store.push(s); }
}

export function createMemoryRepoContainer(): RepoContainer {
  return {
    tickets: new MemTicketRepo(seedTickets),
    sprints: new MemSprintRepo(seedSprints),
    projects: new MemProjectRepo(seedProjects),
    epics: new MemEpicRepo(seedEpics),
    stories: new MemUserStoryRepo(),
    members: new MemMemberRepo(seedMembers),
    ceremonies: new MemCeremonyRepo(),
    agentRuns: new MemAgentRunRepo(),
    ceremonyHealth: new MemCeremonyHealthRepo(),
  };
}
