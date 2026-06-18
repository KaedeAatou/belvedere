// Belvedere — 共通定数

import type { AgentName } from './types';

export const RITUAL_LABELS = {
  planning: 'プランニング',
  daily: 'デイリースクラム',
  refinement: 'バックログリファインメント',
  review: 'スプリントレビュー',
  retrospective: 'ふりかえり',
} as const;

export const STATUS_LABELS = {
  backlog: 'バックログ',
  todo: '未着手',
  'in-progress': '進行中',
  review: 'レビュー',
  done: '完了',
} as const;

export const PRIORITY_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
} as const;

/**
 * Agent ごとに使う Gemini model (AGENT_DESIGN.md §2.6 / 論点 D)。
 * Orchestrator / Daily は判定・短い要約で軽量 flash、Planner / Refinement /
 * Reviewer / Retrospective は分割・診断・生成で推論が重い pro。
 * app.ts / story-quality-handlers などのハードコードを廃し、ここを単一の正とする。
 */
export const AGENT_MODEL: Record<AgentName, string> = {
  orchestrator: 'gemini-2.5-flash',
  daily: 'gemini-2.5-flash',
  planner: 'gemini-2.5-pro',
  refinement: 'gemini-2.5-pro',
  reviewer: 'gemini-2.5-pro',
  retrospective: 'gemini-2.5-pro',
};

/** AGENT_MODEL の lookup。未マップ名はデフォルトに落とさず throw して signpost する。 */
export function modelForAgent(name: AgentName): string {
  const model = AGENT_MODEL[name];
  if (!model) throw new Error(`[shared] no Gemini model mapped for agent "${name}"`);
  return model;
}
