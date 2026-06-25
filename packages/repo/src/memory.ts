// メモリ実装。seed をベースにプロセス内で完結。
// Firestore に置き換える時はインタフェースのまま実装差し替え。

import type {
  Workspace,
  Ticket,
  Sprint,
  Member,
  ApiKey,
  Ceremony,
  AgentRun,
  CeremonyHealthScore,
  Epic,
  UserStory,
  Project,
  Ritual,
  EstimationSession,
  RetroTry,
  RetroNote,
} from '@belvedere/shared';
import { stripUndefined, compareTicketOrder } from '@belvedere/shared';
import { seedTickets, seedSprints, seedMembers, seedEpics, seedProjects, seedRetroTries } from '@belvedere/seed';
import { applyEquFilters } from './query';
import type {
  WorkspaceRepository,
  TicketRepository,
  SprintRepository,
  ProjectRepository,
  EpicRepository,
  UserStoryRepository,
  MemberRepository,
  ApiKeyRepository,
  CeremonyRepository,
  AgentRunRepository,
  CeremonyHealthRepository,
  EstimationRepository,
  RetroTryRepository,
  RetroNoteRepository,
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
    // workspaceId は Phase 1-B IDOR fix で必須。firestore.ts (FsTicketRepo.list) と契約一致。
    // storyId は Ticket.parentTicketId へマップ (User Story → 子 Task の親子関係) して spec に渡す。
    const xs = applyEquFilters([...this.store.values()], [
      ['workspaceId', q.workspaceId],
      ['projectId', q.projectId],
      ['sprintId', q.sprintId],
      ['status', q.status],
      ['assigneeId', q.assigneeId],
      ['ritual', q.ritual],
      ['type', q.type],
      ['parentTicketId', q.storyId],
    ]);
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
    return applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['projectId', opts.projectId],
    ]);
  }
  async get(id: string): Promise<Epic | null> { return this.store.get(id) ?? null; }
  async upsert(e: Epic): Promise<void> { this.store.set(e.id, stripUndefined({ ...e })); }
}

class MemUserStoryRepo implements UserStoryRepository {
  // UI側 (apps/web/composables/useDemoData.ts) で静的定義しているものを将来的にここに移管予定。
  // 現状は空実装でリポジトリ抽象だけ確保しておく。
  private store = new Map<string, UserStory>();
  async list(opts: { workspaceId: string; projectId?: string; epicId?: string }): Promise<UserStory[]> {
    return applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['projectId', opts.projectId],
      ['epicId', opts.epicId],
    ]);
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

class MemApiKeyRepo implements ApiKeyRepository {
  // キーは id (= apikey-xxxx)。getByHash は tokenHash の線形走査 (firestore は where equality)。
  private store = new Map<string, ApiKey>();
  async list(opts: { workspaceId: string; userId?: string }): Promise<ApiKey[]> {
    return applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['userId', opts.userId],
    ]);
  }
  async get(id: string): Promise<ApiKey | null> { return this.store.get(id) ?? null; }
  async getByHash(tokenHash: string): Promise<ApiKey | null> {
    return [...this.store.values()].find((k) => k.tokenHash === tokenHash) ?? null;
  }
  async upsert(k: ApiKey): Promise<void> { this.store.set(k.id, stripUndefined({ ...k })); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
}

class MemCeremonyRepo implements CeremonyRepository {
  private store = new Map<string, Ceremony>();
  async list(opts: { workspaceId: string; sprintId: string }): Promise<Ceremony[]> {
    // sprintId は必須 (型上 string) なので常に等値で絞る。
    return applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['sprintId', opts.sprintId],
    ]);
  }
  async get(id: string): Promise<Ceremony | null> { return this.store.get(id) ?? null; }
  async upsert(c: Ceremony): Promise<void> { this.store.set(c.id, stripUndefined({ ...c })); }
}

class MemAgentRunRepo implements AgentRunRepository {
  private store = new Map<string, AgentRun>();
  async list(opts: { workspaceId: string; agentName?: string; status?: AgentRun['status']; limit?: number }): Promise<AgentRun[]> {
    const xs = applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['agentName', opts.agentName],
      ['status', opts.status],
    ]);
    // sort / limit は agentRun 固有なので applyEquFilters の外で掛ける。
    // firestore.ts と契約一致: startedAt 欠落の不正データでも crash させない。
    xs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    return opts.limit ? xs.slice(0, opts.limit) : xs;
  }
  async get(id: string): Promise<AgentRun | null> { return this.store.get(id) ?? null; }
  async add(r: AgentRun): Promise<void> { this.store.set(r.id, stripUndefined({ ...r })); }
}

class MemCeremonyHealthRepo implements CeremonyHealthRepository {
  private store: CeremonyHealthScore[] = [];
  async list(opts: { workspaceId: string; sprintId?: string; ritual?: Ritual }): Promise<CeremonyHealthScore[]> {
    // store は配列だが applyEquFilters が [...rows] でコピーするため破壊しない。
    return applyEquFilters(this.store, [
      ['workspaceId', opts.workspaceId],
      ['sprintId', opts.sprintId],
      ['ritual', opts.ritual],
    ]);
  }
  async add(s: CeremonyHealthScore): Promise<void> { this.store.push(s); }
}

class MemEstimationRepo implements EstimationRepository {
  private store = new Map<string, EstimationSession>();
  async list(opts: { workspaceId: string; ticketId?: string; status?: EstimationSession['status'] }): Promise<EstimationSession[]> {
    return applyEquFilters([...this.store.values()], [
      ['workspaceId', opts.workspaceId],
      ['ticketId', opts.ticketId],
      ['status', opts.status],
    ]);
  }
  async get(id: string): Promise<EstimationSession | null> { return this.store.get(id) ?? null; }
  async upsert(s: EstimationSession): Promise<void> { this.store.set(s.id, stripUndefined({ ...s })); }
}

class MemRetroTryRepo implements RetroTryRepository {
  private store = new Map<string, RetroTry>();
  constructor(seed: RetroTry[] = []) {
    for (const t of seed) this.store.set(t.id, stripUndefined({ ...t }));
  }
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

class MemRetroNoteRepo implements RetroNoteRepository {
  private store = new Map<string, RetroNote>();
  async list(opts: { workspaceId: string }): Promise<RetroNote[]> {
    // createdAt 昇順 (firestore.ts と契約一致: 古いノートから順に並ぶ)
    return [...this.store.values()]
      .filter((n) => n.workspaceId === opts.workspaceId)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }
  async get(id: string): Promise<RetroNote | null> { return this.store.get(id) ?? null; }
  async upsert(n: RetroNote): Promise<void> { this.store.set(n.id, stripUndefined({ ...n })); }
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
    apiKeys: new MemApiKeyRepo(),
    ceremonies: new MemCeremonyRepo(),
    agentRuns: new MemAgentRunRepo(),
    ceremonyHealth: new MemCeremonyHealthRepo(),
    estimations: new MemEstimationRepo(),
    retroTries: new MemRetroTryRepo(seedRetroTries),
    retroNotes: new MemRetroNoteRepo(),
  };
}
