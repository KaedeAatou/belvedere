// Belvedere — Runtime validation schemas (Phase 1-B / 2026-06-09)。
// Firestore は schema-less なので、read 時に不正データ (schema 進化 / 手動投入ミス /
// 旧 commit 残骸) が混入すると d.data() as Ticket のキャストでは検出できず、
// 呼び出し側で TypeError が出る。本ファイルは domain types に対応する zod schema を
// 提供し、firestore.ts の I/O 境界で safeParse + WARN+skip する基盤を作る。
//
// 設計方針:
// - 型の source of truth は依然 types.ts (TypeScript interface)。schemas.ts は
//   runtime validation 用にミラーする。
// - 各 schema の末尾で `_AssertX = TypeOf<typeof XSchema> extends X ...` の
//   compile-time check を行い、interface と zod schema の drift を typecheck で
//   検出する。drift したら typecheck が落ちるので必ず同期される。
// - exactOptionalPropertyTypes と zod の optional フィールドの扱いを揃えるため、
//   .optional() は undefined を許す形にする (Firestore は undefined キーを drop するので
//   実際の Firestore data にはキーが無いだけ → optional で吸収)。

import { z } from 'zod';
import type {
  Ticket,
  Sprint,
  Project,
  Epic,
  UserStory,
  Member,
  Ceremony,
  AgentRun,
  CeremonyHealthScore,
  EstimationSession,
} from './types';

// === enum: domain literal unions ===
export const StatusSchema = z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']);
export const PrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const ValueImpactSchema = z.enum(['low', 'medium', 'high']);
export const RitualSchema = z.enum(['planning', 'daily', 'refinement', 'review', 'retrospective']);
export const AgentNameSchema = z.enum([
  'orchestrator',
  'planner',
  'daily',
  'refinement',
  'reviewer',
  'retrospective',
]);
export const AgentSourceSchema = z.union([
  z.literal('human'),
  z.custom<`agent:${z.infer<typeof AgentNameSchema>}`>(
    (val) => typeof val === 'string' && val.startsWith('agent:'),
  ),
]);
export const TicketTypeSchema = z.enum(['story', 'task', 'spike', 'bug', 'incident']);

// === Ticket ===
export const TicketSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: StatusSchema,
  priority: PrioritySchema,
  valueImpact: ValueImpactSchema.optional(),
  ritual: RitualSchema.optional(),
  sprintId: z.string().optional(),
  assigneeId: z.string().optional(),
  estimatePt: z.number().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  parentTicketId: z.string().optional(),
  blockedBy: z.array(z.string()).optional(),
  type: TicketTypeSchema.optional(),
  epicId: z.string().optional(),
  relatedIncidentId: z.string().optional(),
  timeboxHours: z.number().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: AgentSourceSchema,
});

// === Sprint ===
export const SprintSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  number: z.number(),
  startsAt: z.string(),
  endsAt: z.string(),
  goal: z.string(),
  capacity: z.number(),
  velocity: z.number().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']),
});

// === Project ===
export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  idPrefix: z.string(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  createdAt: z.string(),
});

// === Epic ===
export const EpicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']),
  valueImpact: ValueImpactSchema.optional(),
  rationale: z.string().optional(),
  successMetric: z.string().optional(),
  strategicTheme: z.string().optional(),
  createdAt: z.string(),
});

// === UserStory ===
export const UserStorySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().optional(),
  epicId: z.string(),
  role: z.string(),
  want: z.string(),
  so: z.string(),
  title: z.string(),
  taskIds: z.array(z.string()),
  valueImpact: ValueImpactSchema.optional(),
});

// === Member ===
export const MemberSchema = z.object({
  userId: z.string(),
  workspaceId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: z.enum(['owner', 'sm', 'po', 'dev', 'guest']),
  slackUserId: z.string().optional(),
  githubUsername: z.string().optional(),
});

// === Ceremony ===
const AgendaItemSchema = z.object({
  topic: z.string(),
  source: z.enum(['agent', 'human']),
  ticketIds: z.array(z.string()).optional(),
  durationMin: z.number().optional(),
});

const DecisionSchema = z.object({
  text: z.string(),
  decidedBy: z.array(z.string()),
  ticketsCreated: z.array(z.string()).optional(),
});

const TryItemSchema = z.object({
  text: z.string(),
  ownerId: z.string().optional(),
  carriedToTicketId: z.string().optional(),
});

export const CeremonySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ritual: RitualSchema,
  sprintId: z.string(),
  scheduledAt: z.string(),
  completedAt: z.string().optional(),
  participants: z.array(z.string()),
  agendaItems: z.array(AgendaItemSchema),
  decisions: z.array(DecisionSchema),
  tries: z.array(TryItemSchema).optional(),
  rawTranscriptUrl: z.string().optional(),
  summary: z.string().optional(),
  agentRunIds: z.array(z.string()),
  healthScore: z.number().optional(),
});

// === AgentRun ===
const AgentStepSchema = z.object({
  type: z.enum(['thought', 'tool_call', 'tool_result', 'output']),
  at: z.string(),
  content: z.unknown(),
  toolName: z.string().optional(),
  durationMs: z.number().optional(),
});

export const AgentRunSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentName: AgentNameSchema,
  trigger: z.enum(['schedule', 'event', 'human']),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  inputContext: z.record(z.string(), z.unknown()),
  steps: z.array(AgentStepSchema),
  outputArtifacts: z
    .object({
      ticketIds: z.array(z.string()).optional(),
      ceremonyId: z.string().optional(),
      summary: z.string().optional(),
    })
    .optional(),
  llmUsage: z.object({
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  }),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

// === CeremonyHealthScore ===
export const CeremonyHealthScoreSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sprintId: z.string(),
  ritual: RitualSchema,
  score: z.number(),
  signals: z.object({
    attendance: z.number(),
    onTime: z.number(),
    durationVariance: z.number(),
    actionableOutputs: z.number(),
    qualityRate: z.number(),
  }),
  computedAt: z.string(),
});

// === EstimationSession (見積もりポーカー) ===
export const EstimationValueSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
  z.literal(13),
  z.literal('?'),
]);
export const EstimationVoteSchema = z.object({
  userId: z.string(),
  value: EstimationValueSchema,
  submittedAt: z.string(),
});
export const EstimationSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ticketId: z.string(),
  status: z.enum(['voting', 'revealed', 'adopted', 'discarded']),
  votes: z.array(EstimationVoteSchema),
  adoptedValue: z.number().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  revealedAt: z.string().optional(),
  adoptedAt: z.string().optional(),
});

// === Compile-time drift detection ===
// 各 schema の output と TypeScript interface が双方向に互換であることを compile 時に保証する。
// drift したら下の `_check_*` の代入で typecheck エラーが起き CI が落ちる。
// 補助型: `Equal<A, B>` で双方向の互換性を厳密に判定する。
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _check_Ticket: Equal<z.infer<typeof TicketSchema>, Ticket> = true;
const _check_Sprint: Equal<z.infer<typeof SprintSchema>, Sprint> = true;
const _check_Project: Equal<z.infer<typeof ProjectSchema>, Project> = true;
const _check_Epic: Equal<z.infer<typeof EpicSchema>, Epic> = true;
const _check_UserStory: Equal<z.infer<typeof UserStorySchema>, UserStory> = true;
const _check_Member: Equal<z.infer<typeof MemberSchema>, Member> = true;
const _check_Ceremony: Equal<z.infer<typeof CeremonySchema>, Ceremony> = true;
const _check_AgentRun: Equal<z.infer<typeof AgentRunSchema>, AgentRun> = true;
const _check_CeremonyHealth: Equal<z.infer<typeof CeremonyHealthScoreSchema>, CeremonyHealthScore> = true;
const _check_EstimationSession: Equal<z.infer<typeof EstimationSessionSchema>, EstimationSession> = true;

// 未使用変数の typecheck warning を抑止 (本来の使い道は compile-time の側面)
void _check_Ticket;
void _check_Sprint;
void _check_Project;
void _check_Epic;
void _check_UserStory;
void _check_Member;
void _check_Ceremony;
void _check_AgentRun;
void _check_CeremonyHealth;
void _check_EstimationSession;
