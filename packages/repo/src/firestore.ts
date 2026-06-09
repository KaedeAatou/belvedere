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
// - Phase 1-B (2026-06-10): 全 list は workspaceId where を必須に。memory.ts と契約一致。

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
import {
  TicketSchema,
  SprintSchema,
  ProjectSchema,
  EpicSchema,
  UserStorySchema,
  MemberSchema,
  CeremonySchema,
  AgentRunSchema,
  CeremonyHealthScoreSchema,
} from '@belvedere/shared';
import { z } from 'zod';
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

/**
 * Firestore は schema-less なので、d.data() を `as T` でキャストすると schema 進化や
 * 手動投入ミスでフィールドが欠けた不正データが silent に呼び出し側に流れ、
 * 例えば `ticket.status.toUpperCase()` で TypeError を起こす。本ヘルパは zod schema で
 * safeParse し、不正データは console.warn 出力 + skip して安全側に倒す。
 *
 * 注: zod 4 の `.optional()` は `T | undefined` を返すが、shared/types.ts の interface は
 * `key?: T` (exactOptionalPropertyTypes 前提)。drift check (schemas.ts の _check_*) で
 * 型整合性は compile-time に担保されているため、戻り値は呼出側の domain T で型付けする。
 * schema と T の対応 (TicketSchema ↔ Ticket 等) は callsite で1対1に書く運用ルール。
 */
function parseList<T>(
  collection: string,
  docs: Array<{ id: string; data: () => unknown }>,
  schema: z.ZodType<unknown>,
): T[] {
  const valid: T[] = [];
  for (const d of docs) {
    const parsed = schema.safeParse(d.data());
    if (parsed.success) {
      valid.push(parsed.data as T);
    } else {
      console.warn(
        `[firestore] invalid document at ${collection}/${d.id} — skipped. ` +
          `Reason: ${parsed.error.issues.map((i) => `${i.path.join('.')}=${i.message}`).join(' / ')}`,
      );
    }
  }
  return valid;
}

/**
 * 単一 doc 用。get で見つかったが schema が一致しない場合は null を返し、
 * 同時に WARN を出す。「存在しない」と「不正データ」を呼び出し側で区別したい場合は
 * 戻り値からは判別不能 (両方 null) なので、必要なら呼び出し側で schema parse する。
 */
function parseOne<T>(
  collection: string,
  id: string,
  data: unknown,
  schema: z.ZodType<unknown>,
): T | null {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data as T;
  console.warn(
    `[firestore] invalid document at ${collection}/${id} — returned null. ` +
      `Reason: ${parsed.error.issues.map((i) => `${i.path.join('.')}=${i.message}`).join(' / ')}`,
  );
  return null;
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
  async list(q: TicketQuery): Promise<Ticket[]> {
    let query: Query = db().collection(COL.tickets).where('workspaceId', '==', q.workspaceId);
    if (q.projectId) query = query.where('projectId', '==', q.projectId);
    if (q.sprintId) query = query.where('sprintId', '==', q.sprintId);
    if (q.status) query = query.where('status', '==', q.status);
    if (q.assigneeId) query = query.where('assigneeId', '==', q.assigneeId);
    if (q.ritual) query = query.where('ritual', '==', q.ritual);
    if (q.storyId) query = query.where('parentTicketId', '==', q.storyId);
    const snap = await query.get();
    return parseList<Ticket>(COL.tickets, snap.docs, TicketSchema);
  }
  async get(id: string): Promise<Ticket | null> {
    const doc = await db().collection(COL.tickets).doc(id).get();
    return doc.exists ? parseOne<Ticket>(COL.tickets, id, doc.data(), TicketSchema) : null;
  }
  async upsert(t: Ticket): Promise<void> {
    await db().collection(COL.tickets).doc(t.id).set(t);
  }
  async delete(id: string): Promise<void> {
    await db().collection(COL.tickets).doc(id).delete();
  }
}

class FsSprintRepo implements SprintRepository {
  async list(opts: { workspaceId: string }): Promise<Sprint[]> {
    const snap = await db().collection(COL.sprints).where('workspaceId', '==', opts.workspaceId).get();
    return parseList<Sprint>(COL.sprints, snap.docs, SprintSchema);
  }
  async get(id: string): Promise<Sprint | null> {
    const doc = await db().collection(COL.sprints).doc(id).get();
    return doc.exists ? parseOne<Sprint>(COL.sprints, id, doc.data(), SprintSchema) : null;
  }
  async upsert(s: Sprint): Promise<void> {
    await db().collection(COL.sprints).doc(s.id).set(s);
  }
}

class FsProjectRepo implements ProjectRepository {
  async list(opts: { workspaceId: string }): Promise<Project[]> {
    const snap = await db().collection(COL.projects).where('workspaceId', '==', opts.workspaceId).get();
    return parseList<Project>(COL.projects, snap.docs, ProjectSchema);
  }
  async get(id: string): Promise<Project | null> {
    const doc = await db().collection(COL.projects).doc(id).get();
    return doc.exists ? parseOne<Project>(COL.projects, id, doc.data(), ProjectSchema) : null;
  }
}

class FsEpicRepo implements EpicRepository {
  async list(opts: { workspaceId: string; projectId?: string }): Promise<Epic[]> {
    let query: Query = db().collection(COL.epics).where('workspaceId', '==', opts.workspaceId);
    if (opts.projectId) query = query.where('projectId', '==', opts.projectId);
    const snap = await query.get();
    return parseList<Epic>(COL.epics, snap.docs, EpicSchema);
  }
  async get(id: string): Promise<Epic | null> {
    const doc = await db().collection(COL.epics).doc(id).get();
    return doc.exists ? parseOne<Epic>(COL.epics, id, doc.data(), EpicSchema) : null;
  }
  async upsert(e: Epic): Promise<void> {
    await db().collection(COL.epics).doc(e.id).set(e);
  }
}

class FsUserStoryRepo implements UserStoryRepository {
  async list(opts: { workspaceId: string; projectId?: string; epicId?: string }): Promise<UserStory[]> {
    let query: Query = db().collection(COL.stories).where('workspaceId', '==', opts.workspaceId);
    if (opts.projectId) query = query.where('projectId', '==', opts.projectId);
    if (opts.epicId) query = query.where('epicId', '==', opts.epicId);
    const snap = await query.get();
    return parseList<UserStory>(COL.stories, snap.docs, UserStorySchema);
  }
  async get(id: string): Promise<UserStory | null> {
    const doc = await db().collection(COL.stories).doc(id).get();
    return doc.exists ? parseOne<UserStory>(COL.stories, id, doc.data(), UserStorySchema) : null;
  }
}

class FsMemberRepo implements MemberRepository {
  // doc id は userId (memory.ts と揃える)
  async list(opts: { workspaceId: string }): Promise<Member[]> {
    const snap = await db().collection(COL.members).where('workspaceId', '==', opts.workspaceId).get();
    return parseList<Member>(COL.members, snap.docs, MemberSchema);
  }
  async get(userId: string): Promise<Member | null> {
    const doc = await db().collection(COL.members).doc(userId).get();
    return doc.exists ? parseOne<Member>(COL.members, userId, doc.data(), MemberSchema) : null;
  }
  /**
   * userId で全 Workspace 横断検索 (workspace 解決ミドルウェア用)。
   * 個人ユーザーが複数 Workspace 所属しているケースで使う。
   */
  async listByUserId(userId: string): Promise<Member[]> {
    const snap = await db().collection(COL.members).where('userId', '==', userId).get();
    return parseList<Member>(COL.members, snap.docs, MemberSchema);
  }
  async upsert(m: Member): Promise<void> {
    await db().collection(COL.members).doc(m.userId).set(m);
  }
}

class FsCeremonyRepo implements CeremonyRepository {
  async list(opts: { workspaceId: string; sprintId: string }): Promise<Ceremony[]> {
    const snap = await db()
      .collection(COL.ceremonies)
      .where('workspaceId', '==', opts.workspaceId)
      .where('sprintId', '==', opts.sprintId)
      .get();
    return parseList<Ceremony>(COL.ceremonies, snap.docs, CeremonySchema);
  }
  async get(id: string): Promise<Ceremony | null> {
    const doc = await db().collection(COL.ceremonies).doc(id).get();
    return doc.exists ? parseOne<Ceremony>(COL.ceremonies, id, doc.data(), CeremonySchema) : null;
  }
  async upsert(c: Ceremony): Promise<void> {
    await db().collection(COL.ceremonies).doc(c.id).set(c);
  }
}

class FsAgentRunRepo implements AgentRunRepository {
  async list(opts: { workspaceId: string; agentName?: string; status?: AgentRun['status']; limit?: number }): Promise<AgentRun[]> {
    let query: Query = db().collection(COL.agentRuns).where('workspaceId', '==', opts.workspaceId);
    // 注意: 2 つ以上の equality where を Firestore に投げると composite index が必要。
    // agentRuns で workspaceId + agentName + status を同時に渡すと FAILED_PRECONDITION (index 不足) になりうる。
    // 必要な index は infra/firestore.indexes.json に宣言してあるので、prod では
    //   firebase deploy --only firestore:indexes
    // で展開する。ソート / limit はクライアント側で行い orderBy 由来の index 要求を回避。
    if (opts.agentName) query = query.where('agentName', '==', opts.agentName);
    if (opts.status) query = query.where('status', '==', opts.status);
    const snap = await query.get();
    let xs: AgentRun[] = parseList<AgentRun>(COL.agentRuns, snap.docs, AgentRunSchema);
    // startedAt 欠落の不正ドキュメント混入時もクラッシュさせない (schema レベルでも startedAt は
    // 必須なので parseList が落とすが、保険として null-safe sort も残す)。
    xs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    if (opts.limit) xs = xs.slice(0, opts.limit);
    return xs;
  }
  async get(id: string): Promise<AgentRun | null> {
    const doc = await db().collection(COL.agentRuns).doc(id).get();
    return doc.exists ? parseOne<AgentRun>(COL.agentRuns, id, doc.data(), AgentRunSchema) : null;
  }
  async add(r: AgentRun): Promise<void> {
    await db().collection(COL.agentRuns).doc(r.id).set(r);
  }
}

class FsCeremonyHealthRepo implements CeremonyHealthRepository {
  async list(opts: { workspaceId: string; sprintId?: string; ritual?: Ritual }): Promise<CeremonyHealthScore[]> {
    let query: Query = db().collection(COL.ceremonyHealth).where('workspaceId', '==', opts.workspaceId);
    if (opts.sprintId) query = query.where('sprintId', '==', opts.sprintId);
    if (opts.ritual) query = query.where('ritual', '==', opts.ritual);
    const snap = await query.get();
    return parseList<CeremonyHealthScore>(COL.ceremonyHealth, snap.docs, CeremonyHealthScoreSchema);
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
