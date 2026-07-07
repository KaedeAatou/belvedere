import type { Sprint } from '@belvedere/shared';
import { averageVelocity } from '@belvedere/shared';

// AI パネル向けの「現在スプリント文脈」を組む純粋関数 (sprint.current tool の本体 / 直接 unit テスト対象)。
// ユーザーが sprintId を書かなくても Agent が active/next スプリントと velocity 実績を掴めるようにする。
// web 側 buildAgentContext (apps/web/composables/useAgentChat.ts) と同じ規約:
//  - active = status==='active' の先頭
//  - next   = status==='planned' を number 昇順で並べた先頭
//  - velocity 実績 = velocity 記録のある (=完了した) スプリントの平均 (画面 PLANNED/VELOCITY の分母と一致)

export interface SprintSummary {
  id: string;
  number: number;
  name: string;
  goal: string | null;
  status: Sprint['status'];
}

export interface SprintContext {
  active: SprintSummary | null;
  next: SprintSummary | null;
  /** velocity 実績 = velocity 記録のあるスプリントの平均 (四捨五入)。1 件も無ければ null。 */
  avgVelocity: number | null;
  /** 直近完了スプリント (number 降順で最大 3 件)。 */
  recentCompleted: Array<{ id: string; number: number; velocity: number }>;
}

function summarizeSprint(s: Sprint): SprintSummary {
  return {
    id: s.id,
    number: s.number,
    name: s.name?.trim() || `Sprint ${s.number}`,
    goal: s.goal?.trim() || null,
    status: s.status,
  };
}

/**
 * スプリント一覧から現在の文脈を要約する。退化入力 (空配列 / active なし / planned なし /
 * velocity 実績なし) でも例外を投げず、欠けているものは null / 空配列で返す。
 */
export function summarizeSprintContext(sprints: Sprint[]): SprintContext {
  const active = sprints.find((s) => s.status === 'active') ?? null;
  const next =
    sprints
      .filter((s) => s.status === 'planned')
      .sort((a, b) => a.number - b.number)[0] ?? null;

  // velocity 実績の分母は正準ヘルパ averageVelocity に統一 (completed + velocity 数値 / F-30 根治)。
  const avgVelocity = averageVelocity(sprints);

  const recentCompleted = sprints
    .filter((s) => s.status === 'completed' && typeof s.velocity === 'number')
    .sort((a, b) => b.number - a.number)
    .slice(0, 3)
    .map((s) => ({ id: s.id, number: s.number, velocity: s.velocity as number }));

  return {
    active: active ? summarizeSprint(active) : null,
    next: next ? summarizeSprint(next) : null,
    avgVelocity,
    recentCompleted,
  };
}
