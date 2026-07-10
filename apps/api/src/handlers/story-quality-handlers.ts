// Story Quality 補助ハンドラ (Backlog 起票時の品質チェック / 2026-06-13)。
//
// 設計方針 (ticket-handlers.ts と同じ純粋関数 + workspaceId スコープ):
// - body を zod 検証 (asA / iWant / soThat は string 必須・空文字可、title 任意)。
// - active スプリント (status==='active' かつ workspaceId 一致) のゴールを取得し判定に使う。
// - llm.generate() を tools 無し (tools:[]) で 1 回呼ぶ。responseSchema に story_quality 用
//   スキーマ (title='story_quality') を渡し、Mock LLM の専用分岐 (detectRole の前段) を発火させる。
//   gemini に差し替えても同じ責務 (構造化 JSON) を返すので handler は無改修。
// - 起票はブロックしない (これは判定結果を返すだけ)。HTTP は常に 200、入力不正のみ 400。
//
// 契約 (フロントが依存):
//   { ok, issues: [{ kind, severity, message }], suggestion?, sprintGoal? }

import { z } from 'zod';
import type { LLMProvider, LLMRequest } from '@belvedere/llm';
import { buildStoryQualityPrompt } from '@belvedere/agent';
import type { RepoContainer } from '@belvedere/repo';
import { modelForAgent } from '@belvedere/shared';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

// ------- 契約型 (TicketFinding の流儀: 生成元 package 近傍にローカル定義。frontend は同形をミラー) -------

export interface StoryQualityIssue {
  kind: 'boilerplate' | 'goal_fit';
  severity: 'warn' | 'info';
  message: string;
}

export interface StoryQualityVerdict {
  /** issues に severity:'warn' が 1 件も無ければ true */
  ok: boolean;
  issues: StoryQualityIssue[];
  /** 任意。改善提案文 */
  suggestion?: string;
  /** 判定に使った active スプリントのゴール (無ければ省略) */
  sprintGoal?: string;
}

// ------- リクエスト body schema -------
// asA / iWant / soThat は型必須・空文字可 (フォームを埋めただけの形骸化も判定対象なので空を弾かない)。
export const StoryQualityBodySchema = z.object({
  asA: z.string(),
  iWant: z.string(),
  soThat: z.string(),
  title: z.string().optional(),
});

const STORY_QUALITY_RESPONSE_SCHEMA: Record<string, unknown> = {
  title: 'story_quality',
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['boilerplate', 'goal_fit'] },
          severity: { type: 'string', enum: ['warn', 'info'] },
          message: { type: 'string' },
        },
        required: ['kind', 'severity', 'message'],
      },
    },
    suggestion: { type: 'string' },
    sprintGoal: { type: 'string' },
  },
  required: ['ok', 'issues'],
};

/**
 * POST /api/story-quality — User Story draft の品質 (boilerplate + goal_fit) を診断。
 * @param llm index.ts が保持する LLMProvider (createLLMProvider 由来)。runAgent と同じ流儀で渡す。
 */
export async function checkStoryQuality(
  repo: RepoContainer,
  llm: LLMProvider,
  ctx: HandlerContext,
  body: unknown,
): Promise<HandlerResult<StoryQualityVerdict>> {
  const parsed = StoryQualityBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: 'invalid_body', details: parsed.error.issues } };
  }
  const { asA, iWant, soThat } = parsed.data;
  // title は body として受けるが LLM には渡さない (F-13): 起票フォームに直接編集できる
  // 「タイトル欄」が無いのに LLM が「タイトルも入力すると…」と存在しない欄への助言を
  // 出していたため、診断入力から title を外す。診断は asA / iWant / soThat の 3 欄のみ。

  // active スプリントのゴールを取得 (status==='active' かつ workspace 一致)。
  const sprints = await repo.sprints.list({ workspaceId: ctx.workspaceId });
  const active = sprints.find((s) => s.status === 'active');
  const sprintGoal = active?.goal && active.goal.trim().length > 0 ? active.goal.trim() : null;

  // 2026-07-10: goal_fit を Sprint Goal だけでなく Product Goal との整合でも判定できるように
  // Workspace.productGoal を取得する (実機検証: 未供給だと agent が「不明」としか言えなかった)。
  const ws = await repo.workspaces.get(ctx.workspaceId);
  const productGoal = ws?.productGoal && ws.productGoal.trim().length > 0 ? ws.productGoal.trim() : null;

  const req: LLMRequest = {
    model: modelForAgent('refinement'),
    messages: [
      { role: 'system', content: buildStoryQualityPrompt(sprintGoal, productGoal) },
      {
        role: 'user',
        content: [
          '以下の User Story draft を診断してください。',
          `asA: ${asA}`,
          `iWant: ${iWant}`,
          `soThat: ${soThat}`,
          `sprintGoal: ${sprintGoal ?? ''}`,
          `productGoal: ${productGoal ?? ''}`,
        ].join('\n'),
      },
    ],
    tools: [],
    responseSchema: STORY_QUALITY_RESPONSE_SCHEMA,
  };

  const res = await llm.generate(req);
  const verdict = normalizeVerdict(res.text, sprintGoal, productGoal);
  return { ok: true, status: 200, body: verdict };
}

// LLM の生テキスト (JSON 文字列想定) を契約形に整形する。
// gemini が契約から逸脱した JSON を返しても落ちないよう防御的に正規化する。
function normalizeVerdict(
  rawText: string,
  sprintGoal: string | null,
  productGoal: string | null,
): StoryQualityVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: StoryQualityIssue[] = rawIssues
    .map((it): StoryQualityIssue | null => {
      const o = (it ?? {}) as Record<string, unknown>;
      const kind = o.kind === 'goal_fit' ? 'goal_fit' : o.kind === 'boilerplate' ? 'boilerplate' : null;
      const severity = o.severity === 'warn' ? 'warn' : o.severity === 'info' ? 'info' : null;
      const message = typeof o.message === 'string' ? o.message : null;
      if (!kind || !severity || !message) return null;
      return { kind, severity, message };
    })
    .filter((x): x is StoryQualityIssue => x !== null)
    // 判定材料 (Sprint Goal または Product Goal) が両方とも無いとき goal_fit は判定不能。
    // prompt でもスキップを指示しているが、将来の gemini が誤って goal_fit を返しても
    // server 側で確実に落とす (2026-07-10: productGoal フォールバックを許容するよう更新)。
    .filter((x) => sprintGoal !== null || productGoal !== null || x.kind !== 'goal_fit');

  // ok は契約定義 (warn が無ければ true) を server 側でも確定させる
  // (LLM 出力の ok を盲信せず issues から再計算し、契約不変条件を保証)。
  const ok = !issues.some((i) => i.severity === 'warn');

  const verdict: StoryQualityVerdict = { ok, issues };
  if (typeof obj.suggestion === 'string' && obj.suggestion.length > 0) {
    verdict.suggestion = obj.suggestion;
  }
  // 判定に使ったゴールは server が保持している値を正とする (省略可)。
  if (sprintGoal) {
    verdict.sprintGoal = sprintGoal;
  }
  return verdict;
}
