// Sprint 編集 + 開始ハンドラ (Phase 1-C / 2026-06-11)。
//
// ゴールはスプリントプランニングのアウトプット (スクラムガイド: Sprint Goal is created
// during Sprint Planning)。リファインメントはバックログ整理であってゴール策定の場ではない。
// よって本ハンドラは Planning 画面から呼ばれ、次スプリント (planned) をゴール先行で計画し
// 「開始」で active 化する。
//
// 設計方針 (ticket-handlers と同じ):
// - 純粋関数 (repo / ctx / body → HandlerResult)。Hono 非依存で vitest 可能。
// - workspaceId は認証経由で確定したものを使う (body 経由の偽装を防ぐ)。
// - IDOR ガード: get → workspaceId 照合、別 workspace は 404 扱い。
// - 編集/開始は儀式ファシリテータ (owner/sm/po) のみ (estimation と同じ PRIVILEGED ゲート)。

import { z } from 'zod';
import type { Sprint } from '@belvedere/shared';
import { generateId } from '@belvedere/shared';
import type { RepoContainer } from '@belvedere/repo';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

const PRIVILEGED: ReadonlyArray<string> = ['owner', 'sm', 'po'];
const isPrivileged = (ctx: HandlerContext) => !!ctx.role && PRIVILEGED.includes(ctx.role);

// POST /api/sprints body — ゴール先行で planned スプリントを新規作成する。
// c社が 0 から計画を始めるための入口 (まだ active も planned も無い状態に対応)。
export const SprintCreateBodySchema = z.object({
  name: z.string().max(80).optional(),
  goal: z.string().min(1, 'goal must not be empty'),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

/**
 * POST /api/sprints — 新規 planned スプリントを作成する。
 * number は当該 ws の max+1 (無ければ 1)。owner/sm/po のみ。startsAt>endsAt は 400。
 * capacity は velocity 駆動プランニング方針では UI に出さないが、型必須なので 0 で初期化する
 * (.claude/rules/project.md: capacity フィールド自体は別文脈として保持可)。
 */
export async function createSprint(
  repo: RepoContainer,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<Sprint>> {
  if (!isPrivileged(ctx)) {
    return { ok: false, status: 403, body: { error: 'forbidden' } };
  }
  const parsed = SprintCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  if (Date.parse(parsed.data.startsAt) > Date.parse(parsed.data.endsAt)) {
    return { ok: false, status: 400, body: { error: 'starts_after_ends' } };
  }
  const all = await repo.sprints.list({ workspaceId: ctx.workspaceId });
  const maxNumber = all.reduce((n, s) => Math.max(n, s.number), 0);
  const sprint: Sprint = {
    id: generateId('SPRINT'),
    workspaceId: ctx.workspaceId,
    number: maxNumber + 1,
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    goal: parsed.data.goal,
    capacity: 0,
    status: 'planned',
  };
  await repo.sprints.upsert(sprint);
  return { ok: true, status: 201, body: sprint };
}

// goal / 期間の編集 (planned・active のみ)。空ゴールは許さない。
export const SprintPatchBodySchema = z
  .object({
    name: z.string().max(80).optional(),
    goal: z.string().min(1, 'goal must not be empty').optional(),
    startsAt: z.string().min(1).optional(),
    endsAt: z.string().min(1).optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.goal !== undefined || b.startsAt !== undefined || b.endsAt !== undefined,
    { message: 'at least one of name/goal/startsAt/endsAt is required' },
  );

// 開始時に最終ゴール/期間を同時確定できる (フロントは編集値を載せて「開始」1 クリックにする)。
export const SprintStartBodySchema = z.object({
  name: z.string().max(80).optional(),
  goal: z.string().min(1).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
});

/** 完了させるスプリントの velocity を done チケットの SP 合計で確定する。 */
async function computeVelocity(repo: RepoContainer, workspaceId: string, sprintId: string): Promise<number> {
  const done = await repo.tickets.list({ workspaceId, sprintId, status: 'done' });
  return done.reduce((n, t) => n + (t.estimatePt ?? 0), 0);
}

/** PATCH /api/sprints/:id — goal / 期間の編集 (status は変えない)。 */
export async function patchSprint(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<Sprint>> {
  const existing = await repo.sprints.get(id);
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  if (!isPrivileged(ctx)) {
    return { ok: false, status: 403, body: { error: 'forbidden' } };
  }
  // 完了/中止済スプリントは編集不可 (履歴の不変性を守る)。
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    return { ok: false, status: 409, body: { error: 'sprint_not_editable' } };
  }
  const parsed = SprintPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const next: Sprint = {
    ...existing,
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.goal !== undefined && { goal: parsed.data.goal }),
    ...(parsed.data.startsAt !== undefined && { startsAt: parsed.data.startsAt }),
    ...(parsed.data.endsAt !== undefined && { endsAt: parsed.data.endsAt }),
  };
  if (Date.parse(next.startsAt) > Date.parse(next.endsAt)) {
    return { ok: false, status: 400, body: { error: 'starts_after_ends' } };
  }
  await repo.sprints.upsert(next);
  return { ok: true, status: 200, body: next };
}

/**
 * POST /api/sprints/:id/start — planned スプリントを active 化する。
 * 同時に現 active があれば completed にし velocity を done SP で確定する (二重 active 防止)。
 * body にゴール/期間があれば開始と同時に確定する。
 */
export async function startSprint(
  repo: RepoContainer,
  ctx: HandlerContext,
  id: string,
  body: unknown,
): Promise<HandlerResult<{ started: Sprint; completed: Sprint | null }>> {
  const target = await repo.sprints.get(id);
  if (!target || target.workspaceId !== ctx.workspaceId) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  if (!isPrivileged(ctx)) {
    return { ok: false, status: 403, body: { error: 'forbidden' } };
  }
  if (target.status !== 'planned') {
    return { ok: false, status: 409, body: { error: 'sprint_not_planned' } };
  }
  const parsed = SprintStartBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }

  // 現 active を完了させ velocity を確定 (velocity 駆動プランニングの実績源になる)。
  const all = await repo.sprints.list({ workspaceId: ctx.workspaceId });
  const current = all.find((s) => s.status === 'active' && s.id !== target.id) ?? null;
  let completed: Sprint | null = null;
  if (current) {
    completed = {
      ...current,
      status: 'completed',
      velocity: await computeVelocity(repo, ctx.workspaceId, current.id),
    };
    await repo.sprints.upsert(completed);
  }

  const started: Sprint = {
    ...target,
    status: 'active',
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.goal !== undefined && { goal: parsed.data.goal }),
    ...(parsed.data.startsAt !== undefined && { startsAt: parsed.data.startsAt }),
    ...(parsed.data.endsAt !== undefined && { endsAt: parsed.data.endsAt }),
  };
  if (Date.parse(started.startsAt) > Date.parse(started.endsAt)) {
    return { ok: false, status: 400, body: { error: 'starts_after_ends' } };
  }
  await repo.sprints.upsert(started);
  return { ok: true, status: 200, body: { started, completed } };
}
