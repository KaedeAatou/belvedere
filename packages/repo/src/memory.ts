// メモリ実装。seed をベースにプロセス内で完結。
// Firestore に置き換える時はインタフェースのまま実装差し替え。

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
  Ritual,
  EstimationSession,
  RetroTry,
} from '@belvedere/shared';
import { stripUndefined, compareTicketOrder } from '@belvedere/shared';
import { seedTickets, seedSprints, seedMembers, seedEpics, seedProjects } from '@belvedere/seed';
import type {
  WorkspaceRepository,
  TicketRepository,
  SprintRepository,
  ProjectRepository,
  EpicRepository,
  UserStoryRepository,
  MemberRepository,
  CeremonyRepository,
  AgentRunRepository,
  CeremonyHealthRepository,
  EstimationRepository,
  RetroTryRepository,
  TicketQuery,
  RepoContainer,
} from './types';

// stripUndefined は @belvedere/shared に集約 (R2 / 2026-06-10)。
// Firestore backend (firestore.ts) は `ignoreUndefinedProperties: true` で write 時に
// undefined フィールドを silent drop するため、memory backend も write 時に undefined キーを
// 除去して shape を揃える (そうしないと 'key' in obj / Object.keys / JSON 長が backend で乖離)。

class MemWorkspaceRepo implements WorkspaceRepository {
  private store = new Map<string, Workspace>();
  async listByIds(ids: string[]): Promise<Workspace[]> {
    const want = new Set(ids);
    return [...this.store.values()].filter((w) => want.has(w.id));
  }
  async get(id: string): Promise<Workspace | null> { return this.store.get(id) ?? null; }
  async upsert(w: Workspace): Promise<void> { this.store.set(w.id, stripUndefined({ ...w })); }
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
    // 表示順を repo 層で確定する (orderIndex → フォールバック priority/createdAt)。
    // firestore.ts (FsTicketRepo.list) と同一比較関数を共有し全 consumer が同じ並びを得る。
    xs.sort(compareTicketOrder);
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
  // Map のキーは複合キー `${workspaceId}:${userId}` (firestore.ts memberDocId と完全一致)。
  // userId 単独キーだと、別 Workspace の同 user を upsert した時に前の所属を上書きしてしまい
  // 1 user が複数 Workspace に所属できなくなる (マルチテナント破壊)。
  private store = new Map<string, Member>();
  private keyOf(workspaceId: string, userId: string): string { return `${workspaceId}:${userId}`; }
  constructor(seed: Member[]) {
    for (const m of seed) this.store.set(this.keyOf(m.workspaceId, m.userId), stripUndefined({ ...m }));
  }
  async list(opts: { workspaceId: string }): Promise<Member[]> {
    return [...this.store.values()].filter((m) => m.workspaceId === opts.workspaceId);
  }
  async get(workspaceId: string, userId: string): Promise<Member | null> {
    return this.store.get(this.keyOf(workspaceId, userId)) ?? null;
  }
  async listByUserId(userId: string): Promise<Member[]> {
    return [...this.store.values()].filter((m) => m.userId === userId);
  }
  async listByEmail(email: string): Promise<Member[]> {
    const e = email.toLowerCase();
    return [...this.store.values()].filter((m) => m.email.toLowerCase() === e);
  }
  async upsert(m: Member): Promise<void> {
    this.store.set(this.keyOf(m.workspaceId, m.userId), stripUndefined({ ...m }));
  }
  async delete(workspaceId: string, userId: string): Promise<void> {
    this.store.delete(this.keyOf(workspaceId, userId));
  }
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

class MemEstimationRepo implements EstimationRepository {
  private store = new Map<string, EstimationSession>();
  async list(opts: { workspaceId: string; ticketId?: string; status?: EstimationSession['status'] }): Promise<EstimationSession[]> {
    let xs = [...this.store.values()].filter((s) => s.workspaceId === opts.workspaceId);
    if (opts.ticketId) xs = xs.filter((s) => s.ticketId === opts.ticketId);
    if (opts.status) xs = xs.filter((s) => s.status === opts.status);
    return xs;
  }
  async get(id: string): Promise<EstimationSession | null> { return this.store.get(id) ?? null; }
  async upsert(s: EstimationSession): Promise<void> { this.store.set(s.id, stripUndefined({ ...s })); }
}

class MemRetroTryRepo implements RetroTryRepository {
  private store = new Map<string, RetroTry>();
  async list(opts: { workspaceId: string }): Promise<RetroTry[]> {
    // createdAt 昇順 (firestore.ts と契約一致: 古い積み上げから順に並ぶ)
    return [...this.store.values()]
      .filter((t) => t.workspaceId === opts.workspaceId)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }
  async get(id: string): Promise<RetroTry | null> { return this.store.get(id) ?? null; }
  async upsert(t: RetroTry): Promise<void> { this.store.set(t.id, stripUndefined({ ...t })); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
}

export function createMemoryRepoContainer(): RepoContainer {
  return {
    workspaces: new MemWorkspaceRepo(),
    tickets: new MemTicketRepo(seedTickets),
    sprints: new MemSprintRepo(seedSprints),
    projects: new MemProjectRepo(seedProjects),
    epics: new MemEpicRepo(seedEpics),
    stories: new MemUserStoryRepo(),
    members: new MemMemberRepo(seedMembers),
    ceremonies: new MemCeremonyRepo(),
    agentRuns: new MemAgentRunRepo(),
    ceremonyHealth: new MemCeremonyHealthRepo(),
    estimations: new MemEstimationRepo(),
    retroTries: new MemRetroTryRepo(),
  };
}
