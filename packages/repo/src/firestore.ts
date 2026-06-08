// Firestore 実装 (Phase 1-B / 2026-06-09)。
// memory.ts と同一インタフェースで、トップレベルのフラットコレクションに写す。
// データ階層 (Workspace > Project > Epic > Story > Task) はサブコレクションにせず、
// 各ドキュメントが workspaceId / projectId フィールドを持つ形で表現する (将来 where で分離)。
// 採用理由は DATA_MODEL.md §2 の注記参照。
//
// 設計方針:
// - where は equality のみ Firestore に投げる (equality-only の AND は composite index 不要)。
//   ソート / limit はクライアント側 (.sort / .slice) で行い、初回 index 設定を不要にする。
// - ignoreUndefinedProperties: true で optional フィールドの undefined を吸収 (conditional spread 不要)。
// - 認証は ADC (ローカルは `gcloud auth application-default login`、Cloud Run は runtime SA)。

import { Firestore, type Query } from '@google-cloud/firestore';
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

let _db: Firestore | null = null;

/** lazy singleton。GCP_PROJECT 未指定時は ADC から自動検出。 */
function db(): Firestore {
  if (!_db) {
    _db = new Firestore({
      ...(process.env.GCP_PROJECT ? { projectId: process.env.GCP_PROJECT } : {}),
      ignoreUndefinedProperties: true,
    });
  }
  return _db;
}

/** コレクション名定数 (フラット構造)。 */
const COL = {
  tickets: 'tickets',
  sprints: 'sprints',
  projects: 'projects',
  epics: 'epics',
  stories: 'stories',
  members: 'members',
  ceremonies: 'ceremonies',
  agentRuns: 'agentRuns',
  ceremonyHealth: 'ceremonyHealth',
} as const;

class FsTicketRepo implements TicketRepository {
  async list(q: TicketQuery = {}): Promise<Ticket[]> {
    let query: Query = db().collection(COL.tickets);
    if (q.projectId) query = query.where('projectId', '==', q.projectId);
    if (q.sprintId) query = query.where('sprintId', '==', q.sprintId);
    if (q.status) query = query.where('status', '==', q.status);
    if (q.assigneeId) query = query.where('assigneeId', '==', q.assigneeId);
    if (q.ritual) query = query.where('ritual', '==', q.ritual);
    if (q.storyId) query = query.where('parentTicketId', '==', q.storyId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as Ticket);
  }
  async get(id: string): Promise<Ticket | null> {
    const doc = await db().collection(COL.tickets).doc(id).get();
    return doc.exists ? (doc.data() as Ticket) : null;
  }
  async upsert(t: Ticket): Promise<void> {
    await db().collection(COL.tickets).doc(t.id).set(t);
  }
  async delete(id: string): Promise<void> {
    await db().collection(COL.tickets).doc(id).delete();
  }
}

class FsSprintRepo implements SprintRepository {
  async list(): Promise<Sprint[]> {
    const snap = await db().collection(COL.sprints).get();
    return snap.docs.map((d) => d.data() as Sprint);
  }
  async get(id: string): Promise<Sprint | null> {
    const doc = await db().collection(COL.sprints).doc(id).get();
    return doc.exists ? (doc.data() as Sprint) : null;
  }
  async upsert(s: Sprint): Promise<void> {
    await db().collection(COL.sprints).doc(s.id).set(s);
  }
}

class FsProjectRepo implements ProjectRepository {
  async list(): Promise<Project[]> {
    const snap = await db().collection(COL.projects).get();
    return snap.docs.map((d) => d.data() as Project);
  }
  async get(id: string): Promise<Project | null> {
    const doc = await db().collection(COL.projects).doc(id).get();
    return doc.exists ? (doc.data() as Project) : null;
  }
}

class FsEpicRepo implements EpicRepository {
  async list(opts: { projectId?: string } = {}): Promise<Epic[]> {
    let query: Query = db().collection(COL.epics);
    if (opts.projectId) query = query.where('projectId', '==', opts.projectId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as Epic);
  }
  async get(id: string): Promise<Epic | null> {
    const doc = await db().collection(COL.epics).doc(id).get();
    return doc.exists ? (doc.data() as Epic) : null;
  }
  async upsert(e: Epic): Promise<void> {
    await db().collection(COL.epics).doc(e.id).set(e);
  }
}

class FsUserStoryRepo implements UserStoryRepository {
  async list(opts: { projectId?: string; epicId?: string } = {}): Promise<UserStory[]> {
    let query: Query = db().collection(COL.stories);
    if (opts.projectId) query = query.where('projectId', '==', opts.projectId);
    if (opts.epicId) query = query.where('epicId', '==', opts.epicId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as UserStory);
  }
  async get(id: string): Promise<UserStory | null> {
    const doc = await db().collection(COL.stories).doc(id).get();
    return doc.exists ? (doc.data() as UserStory) : null;
  }
}

class FsMemberRepo implements MemberRepository {
  // doc id は userId (memory.ts と揃える)
  async list(): Promise<Member[]> {
    const snap = await db().collection(COL.members).get();
    return snap.docs.map((d) => d.data() as Member);
  }
  async get(userId: string): Promise<Member | null> {
    const doc = await db().collection(COL.members).doc(userId).get();
    return doc.exists ? (doc.data() as Member) : null;
  }
}

class FsCeremonyRepo implements CeremonyRepository {
  async list(sprintId: string): Promise<Ceremony[]> {
    const snap = await db().collection(COL.ceremonies).where('sprintId', '==', sprintId).get();
    return snap.docs.map((d) => d.data() as Ceremony);
  }
  async get(id: string): Promise<Ceremony | null> {
    const doc = await db().collection(COL.ceremonies).doc(id).get();
    return doc.exists ? (doc.data() as Ceremony) : null;
  }
  async upsert(c: Ceremony): Promise<void> {
    await db().collection(COL.ceremonies).doc(c.id).set(c);
  }
}

class FsAgentRunRepo implements AgentRunRepository {
  async list(opts: { agentName?: string; status?: AgentRun['status']; limit?: number } = {}): Promise<AgentRun[]> {
    let query: Query = db().collection(COL.agentRuns);
    if (opts.agentName) query = query.where('agentName', '==', opts.agentName);
    if (opts.status) query = query.where('status', '==', opts.status);
    const snap = await query.get();
    // ソート / limit はクライアント側 (composite index 回避)
    let xs = snap.docs.map((d) => d.data() as AgentRun);
    xs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (opts.limit) xs = xs.slice(0, opts.limit);
    return xs;
  }
  async get(id: string): Promise<AgentRun | null> {
    const doc = await db().collection(COL.agentRuns).doc(id).get();
    return doc.exists ? (doc.data() as AgentRun) : null;
  }
  async add(r: AgentRun): Promise<void> {
    await db().collection(COL.agentRuns).doc(r.id).set(r);
  }
}

class FsCeremonyHealthRepo implements CeremonyHealthRepository {
  async list(opts: { sprintId?: string; ritual?: Ritual } = {}): Promise<CeremonyHealthScore[]> {
    let query: Query = db().collection(COL.ceremonyHealth);
    if (opts.sprintId) query = query.where('sprintId', '==', opts.sprintId);
    if (opts.ritual) query = query.where('ritual', '==', opts.ritual);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as CeremonyHealthScore);
  }
  async add(s: CeremonyHealthScore): Promise<void> {
    await db().collection(COL.ceremonyHealth).doc(s.id).set(s);
  }
}

export function createFirestoreRepoContainer(): RepoContainer {
  return {
    tickets: new FsTicketRepo(),
    sprints: new FsSprintRepo(),
    projects: new FsProjectRepo(),
    epics: new FsEpicRepo(),
    stories: new FsUserStoryRepo(),
    members: new FsMemberRepo(),
    ceremonies: new FsCeremonyRepo(),
    agentRuns: new FsAgentRunRepo(),
    ceremonyHealth: new FsCeremonyHealthRepo(),
  };
}
