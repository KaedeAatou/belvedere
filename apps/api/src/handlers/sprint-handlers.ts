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

// ===== 常時稼働カデンス用ヘルパ (active 1 + planned 1 を常に保つ) =====
// スプリント期間の既定値 (2 週間)。seed と同じく 00:00:00〜23:59:59+09:00 (JST) に正規化する。
const SPRINT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** epoch ms を JST 日付に直し +09:00 表記の ISO にする (サーバ TZ 非依存に UTC コンポーネントで読む)。 */
function jstIso(instant: number, endOfDay: boolean): string {
  const d = new Date(instant + 9 * 60 * 60 * 1000);
  const ymd = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return endOfDay ? `${ymd}T23:59:59+09:00` : `${ymd}T00:00:00+09:00`;
}

/** 起点 instant から 2 週間レンジを作る。 */
function rangeFrom(startInstant: number): { startsAt: string; endsAt: string } {
  return { startsAt: jstIso(startInstant, false), endsAt: jstIso(startInstant + (SPRINT_DAYS - 1) * DAY_MS, true) };
}
/** 既存スプリントの endsAt の翌日から 2 週間レンジを作る (期間重複を避ける)。 */
function rangeAfter(prevEndsAt: string): { startsAt: string; endsAt: string } {
  return rangeFrom(Date.parse(prevEndsAt) + DAY_MS);
}

/**
 * ブートストラップ / 繰上げで生成するスプリント雛形。goal は空 (= 未設定、表示側で fallback)、
 * capacity は velocity 駆動方針で 0。number を id に混ぜて同一ミリ秒の generateId 衝突を避ける。
 */
function buildSprint(
  workspaceId: string,
  number: number,
  status: 'active' | 'planned',
  range: { startsAt: string; endsAt: string },
  name?: string,
): Sprint {
  return {
    id: generateId(`SPRINT-${number}`),
    workspaceId,
    number,
    ...(name !== undefined && name !== '' && { name }),
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    goal: '',
    capacity: 0,
    status,
  };
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

// 同一 workspace の並行 ensure を直列化する in-flight ロック (インメモリ単一プロセス前提)。
// get→set の間に await が無く同期的なので二重作成は起きない。Firestore 化時は runTransaction へ (TODO)。
const ensureLocks = new Map<string, Promise<void>>();

/**
 * 「常時稼働」不変条件を保証する: 当該 workspace に active 1 + planned 1 が無ければ補充する。
 * GET /api/sprints の前に lazy 呼び出しし、既存 ws の欠落 (deployed dev) も新規 ws も初回ロードで整える。
 * 二重作成は ensureLocks で防ぐ。completed/cancelled は触らない (履歴不変)。
 */
export async function ensureSprintCadence(repo: RepoContainer, workspaceId: string): Promise<void> {
  const inflight = ensureLocks.get(workspaceId);
  if (inflight) {
    await inflight;
    return;
  }
  const run = ensureSprintCadenceInner(repo, workspaceId).finally(() => ensureLocks.delete(workspaceId));
  ensureLocks.set(workspaceId, run);
  await run;
}

async function ensureSprintCadenceInner(repo: RepoContainer, workspaceId: string): Promise<void> {
  const all = await repo.sprints.list({ workspaceId });
  const hasActive = all.some((s) => s.status === 'active');
  const hasPlanned = all.some((s) => s.status === 'planned');
  if (hasActive && hasPlanned) return;

  let nextNumber = all.reduce((n, s) => Math.max(n, s.number), 0);
  // 期間の起点カーソル: 既存の最も遅い endsAt。無ければ今日。生成のたび前進させ重複を避ける。
  let cursorEnd = all.reduce<string | null>(
    (acc, s) => (acc && Date.parse(acc) >= Date.parse(s.endsAt) ? acc : s.endsAt),
    null,
  );
  const nextRange = (): { startsAt: string; endsAt: string } => {
    const range = cursorEnd ? rangeAfter(cursorEnd) : rangeFrom(Date.now());
    cursorEnd = range.endsAt;
    return range;
  };

  if (!hasActive) {
    nextNumber += 1;
    await repo.sprints.upsert(buildSprint(workspaceId, nextNumber, 'active', nextRange()));
  }
  if (!hasPlanned) {
    nextNumber += 1;
    await repo.sprints.upsert(buildSprint(workspaceId, nextNumber, 'planned', nextRange(), 'Next Sprint'));
  }
}
