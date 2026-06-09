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
} from '@belvedere/shared';
import { seedTickets, seedSprints, seedMembers, seedEpics, seedProjects } from '@belvedere/seed';
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

// Firestore backend (firestore.ts) は `ignoreUndefinedProperties: true` で write 時に
// undefined フィールドを silent drop する。memory backend が `{ ...t }` で undefined を
// 保持してしまうと、同じ Ticket を upsert → get したときに
//   - memory: 'sourceQuote' in ticket === true (undefined キーが残る)
//   - firestore: 'sourceQuote' in ticket === false (キーごと消える)
// となり、`'key' in obj` / Object.keys() / JSON.stringify の長さ等が backend で乖離する。
// shape を揃えるため memory 側でも write 時に undefined キーを除去する。
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

class MemTicketRepo implements TicketRepository {
  private store = new Map<string, Ticket>();
  constructor(seed: Ticket[]) {
    for (const t of seed) this.store.set(t.id, stripUndefined({ ...t }));
  }
  async list(q: TicketQuery): Promise<Ticket[]> {
    let xs = [...this.store.values()];
    // workspaceId は Phase 1-B IDOR fix で必須。firestore.ts (FsTicketRepo.list) と契約一致。
    xs = xs.filter((t) => t.workspaceId === q.workspaceId);
    if (q.projectId) xs = xs.filter((t) => t.projectId === q.projectId);
    if (q.sprintId) xs = xs.filter((t) => t.sprintId === q.sprintId);
    if (q.status) xs = xs.filter((t) => t.status === q.status);
    if (q.assigneeId) xs = xs.filter((t) => t.assigneeId === q.assigneeId);
    if (q.ritual) xs = xs.filter((t) => t.ritual === q.ritual);
    // storyId は Ticket.parentTicketId へマップ (User Story → 子 Task の親子関係)。
    if (q.storyId) xs = xs.filter((t) => t.parentTicketId === q.storyId);
    return xs;
  }
  async get(id: string): Promise<Ticket | null> { return this.store.get(id) ?? null; }
  async upsert(t: Ticket): Promise<void> { this.store.set(t.id, stripUndefined({ ...t })); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
}

class MemSprintRepo implements SprintRepository {
  private store = new Map<string, Sprint>();
  constructor(seed: Sprint[]) { for (const s of seed) this.store.set(s.id, stripUndefined({ ...s })); }
  async list(opts: { workspaceId: string }): Promise<Sprint[]> {
    return [...this.store.values()].filter((s) => s.workspaceId === opts.workspaceId);
  }
  async get(id: string): Promise<Sprint | null> { return this.store.get(id) ?? null; }
  async upsert(s: Sprint): Promise<void> { this.store.set(s.id, stripUndefined({ ...s })); }
}

class MemProjectRepo implements ProjectRepository {
  private store = new Map<string, Project>();
  constructor(seed: Project[]) { for (const p of seed) this.store.set(p.id, stripUndefined({ ...p })); }
  async list(opts: { workspaceId: string }): Promise<Project[]> {
    return [...this.store.values()].filter((p) => p.workspaceId === opts.workspaceId);
  }
  async get(id: string): Promise<Project | null> { return this.store.get(id) ?? null; }
}

class MemEpicRepo implements EpicRepository {
  private store = new Map<string, Epic>();
  constructor(seed: Epic[]) { for (const e of seed) this.store.set(e.id, stripUndefined({ ...e })); }
  async list(opts: { workspaceId: string; projectId?: string }): Promise<Epic[]> {
    let xs = [...this.store.values()].filter((e) => e.workspaceId === opts.workspaceId);
    if (opts.projectId) xs = xs.filter((e) => e.projectId === opts.projectId);
    return xs;
  }
  async get(id: string): Promise<Epic | null> { return this.store.get(id) ?? null; }
  async upsert(e: Epic): Promise<void> { this.store.set(e.id, stripUndefined({ ...e })); }
}

class MemUserStoryRepo implements UserStoryRepository {
  // UI側 (apps/web/composables/useDemoData.ts) で静的定義しているものを将来的にここに移管予定。
  // 現状は空実装でリポジトリ抽象だけ確保しておく。
  private store = new Map<string, UserStory>();
  async list(opts: { workspaceId: string; projectId?: string; epicId?: string }): Promise<UserStory[]> {
    let xs = [...this.store.values()].filter((s) => s.workspaceId === opts.workspaceId);
    if (opts.projectId) xs = xs.filter((s) => s.projectId === opts.projectId);
    if (opts.epicId) xs = xs.filter((s) => s.epicId === opts.epicId);
    return xs;
  }
  async get(id: string): Promise<UserStory | null> { return this.store.get(id) ?? null; }
}

class MemMemberRepo implements MemberRepository {
  private store = new Map<string, Member>();
  constructor(seed: Member[]) { for (const m of seed) this.store.set(m.userId, stripUndefined({ ...m })); }
  async list(opts: { workspaceId: string }): Promise<Member[]> {
    return [...this.store.values()].filter((m) => m.workspaceId === opts.workspaceId);
  }
  async get(userId: string): Promise<Member | null> { return this.store.get(userId) ?? null; }
  async listByUserId(userId: string): Promise<Member[]> {
    return [...this.store.values()].filter((m) => m.userId === userId);
  }
  async upsert(m: Member): Promise<void> { this.store.set(m.userId, stripUndefined({ ...m })); }
}

class MemCeremonyRepo implements CeremonyRepository {
  private store = new Map<string, Ceremony>();
  async list(opts: { workspaceId: string; sprintId: string }): Promise<Ceremony[]> {
    return [...this.store.values()].filter(
      (c) => c.workspaceId === opts.workspaceId && c.sprintId === opts.sprintId,
    );
  }
  async get(id: string): Promise<Ceremony | null> { return this.store.get(id) ?? null; }
  async upsert(c: Ceremony): Promise<void> { this.store.set(c.id, stripUndefined({ ...c })); }
}

class MemAgentRunRepo implements AgentRunRepository {
  private store = new Map<string, AgentRun>();
  async list(opts: { workspaceId: string; agentName?: string; status?: AgentRun['status']; limit?: number }): Promise<AgentRun[]> {
    let xs = [...this.store.values()].filter((r) => r.workspaceId === opts.workspaceId);
    if (opts.agentName) xs = xs.filter((r) => r.agentName === opts.agentName);
    if (opts.status) xs = xs.filter((r) => r.status === opts.status);
    // firestore.ts と契約一致: startedAt 欠落の不正データでも crash させない
    xs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    if (opts.limit) xs = xs.slice(0, opts.limit);
    return xs;
  }
  async get(id: string): Promise<AgentRun | null> { return this.store.get(id) ?? null; }
  async add(r: AgentRun): Promise<void> { this.store.set(r.id, stripUndefined({ ...r })); }
}

class MemCeremonyHealthRepo implements CeremonyHealthRepository {
  private store: CeremonyHealthScore[] = [];
  async list(opts: { workspaceId: string; sprintId?: string; ritual?: Ritual }): Promise<CeremonyHealthScore[]> {
    let xs = this.store.filter((s) => s.workspaceId === opts.workspaceId);
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
