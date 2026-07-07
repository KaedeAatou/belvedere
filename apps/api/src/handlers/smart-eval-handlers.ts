// Sprint Goal の SMART 評価ハンドラ (WC-14 / 旧 WC-2665bb65)。
//
// 背景: Planning 画面の SMART 行はハードコードの飾り (ok/weak 固定) で、活用方法が分からなかった。
// ユーザ選択「AI 実評価で動的化」に応え、active スプリントの Goal を LLM が SMART 5観点で
// 採点し、各観点の ok/weak + 弱い観点への改善提案を返す。
//
// 設計方針 (story-quality-handlers.ts と同型):
// - llm.generate() を tools 無しで 1 回呼ぶ。responseSchema.title='smart_eval' で Mock LLM の
//   専用分岐を発火 (detectRole は経由しない = 6 agent ルーティングに影響なし)。
// - 判定材料 (goal / plannedSP / velocity) は handler が active スプリントから確定し user message に埋める
//   (A=Attainable を SP vs velocity で判定できるように)。
// - gemini に差し替えても同じ契約 JSON を返すので frontend / handler は無改修。
//
// 契約 (frontend がミラー): { goal, criteria: [{letter,name,ok,note}] x5, summary? }

import type { LLMProvider, LLMRequest } from '@belvedere/llm';
import type { RepoContainer } from '@belvedere/repo';
import { modelForAgent, averageVelocity } from '@belvedere/shared';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

export type SmartLetter = 'S' | 'M' | 'A' | 'R' | 'T';

export interface SmartCriterion {
  letter: SmartLetter;
  name: string;
  ok: boolean;
  /** 弱い観点への改善提案 / 良い観点の根拠 (短文) */
  note: string;
}

export interface SmartVerdict {
  /** 判定に使った active スプリントの Goal (未設定なら空文字) */
  goal: string;
  criteria: SmartCriterion[];
  summary?: string;
}

const CRITERIA: { letter: SmartLetter; name: string }[] = [
  { letter: 'S', name: 'Specific' },
  { letter: 'M', name: 'Measurable' },
  { letter: 'A', name: 'Attainable' },
  { letter: 'R', name: 'Relevant' },
  { letter: 'T', name: 'Time-bound' },
];

const SMART_RESPONSE_SCHEMA: Record<string, unknown> = {
  title: 'smart_eval',
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          letter: { type: 'string', enum: ['S', 'M', 'A', 'R', 'T'] },
          name: { type: 'string' },
          ok: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['letter', 'name', 'ok', 'note'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['criteria'],
};

const SMART_SYSTEM_PROMPT = [
  'あなたはスクラムのスプリント計画を支援する Planner です。',
  '与えられた Sprint Goal を SMART の 5 観点 (S=Specific 具体的 / M=Measurable 測定可能 /',
  'A=Attainable velocity 内に収まる / R=Relevant Product Goal に整合 / T=Time-bound 期限明確) で採点してください。',
  '各観点について ok (真偽) と note (弱い場合は具体的な改善提案、良い場合は根拠を 1 文) を返します。',
  'A=Attainable は plannedSP と velocity を比較し、plannedSP > velocity なら過剰計画として ok=false にします。',
  'R=Relevant は Sprint Goal が productGoal (プロダクトゴール) に貢献するかで判定します。productGoal が',
  '未設定 (空) の場合は R を ok=false とし、note に「Product Goal 未設定 (Home で設定)」を書いてください。',
  'Goal が未設定 (空) の場合は S/M/R を ok=false とし、note に「ゴール未設定」を書いてください。',
  '出力は responseSchema (criteria 5 件 + summary) に厳密に従った JSON のみ。',
].join('\n');

/**
 * POST /api/planning/smart — active スプリントの Goal を SMART 5観点で評価する。
 * @param llm index.ts が保持する LLMProvider (createLLMProvider 由来)。
 */
export async function evaluateSprintSmart(
  repo: RepoContainer,
  llm: LLMProvider,
  ctx: HandlerContext,
): Promise<HandlerResult<SmartVerdict>> {
  const sprints = await repo.sprints.list({ workspaceId: ctx.workspaceId });
  const active = sprints.find((s) => s.status === 'active');
  const goal = active?.goal?.trim() ?? '';

  // R=Relevant 判定用に Workspace の Product Goal を取得 (WC-23)。
  const ws = await repo.workspaces.get(ctx.workspaceId);
  const productGoal = ws?.productGoal?.trim() ?? '';

  // A=Attainable の判定材料: 現スプリントの計画 SP と 過去 velocity 平均。
  // 分母は正準ヘルパ averageVelocity (画面 PLANNED/VELOCITY と同一定義 / F-30 根治)。
  const tickets = active ? await repo.tickets.list({ workspaceId: ctx.workspaceId, sprintId: active.id }) : [];
  const plannedSP = tickets.reduce((n, t) => n + (t.estimatePt ?? 0), 0);
  const avgVelocity = averageVelocity(sprints) ?? 0;

  const req: LLMRequest = {
    model: modelForAgent('planner'),
    messages: [
      { role: 'system', content: SMART_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          '以下の Sprint Goal を SMART 5観点で評価してください。',
          `goal: ${goal}`,
          `productGoal: ${productGoal}`,
          `plannedSP: ${plannedSP}`,
          `velocity: ${avgVelocity}`,
        ].join('\n'),
      },
    ],
    tools: [],
    responseSchema: SMART_RESPONSE_SCHEMA,
  };

  const res = await llm.generate(req);
  return { ok: true, status: 200, body: normalizeSmart(res.text, goal) };
}

/** LLM の生テキスト (JSON 想定) を契約形 (S/M/A/R/T の 5 件必ず揃う) に整形する。 */
function normalizeSmart(rawText: string, goal: string): SmartVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawCriteria = Array.isArray(obj.criteria) ? obj.criteria : [];
  const byLetter = new Map<SmartLetter, { ok: boolean; note: string }>();
  for (const it of rawCriteria) {
    const o = (it ?? {}) as Record<string, unknown>;
    const letter = o.letter as SmartLetter;
    if (!CRITERIA.some((c) => c.letter === letter)) continue;
    byLetter.set(letter, {
      ok: o.ok === true,
      note: typeof o.note === 'string' ? o.note : '',
    });
  }
  // 5 観点は必ず揃える (LLM が欠落させても契約を保証。欠落は ok=false / note 空)。
  const criteria: SmartCriterion[] = CRITERIA.map((c) => ({
    letter: c.letter,
    name: c.name,
    ok: byLetter.get(c.letter)?.ok ?? false,
    note: byLetter.get(c.letter)?.note ?? '',
  }));
  const verdict: SmartVerdict = { goal, criteria };
  if (typeof obj.summary === 'string' && obj.summary.length > 0) verdict.summary = obj.summary;
  return verdict;
}
