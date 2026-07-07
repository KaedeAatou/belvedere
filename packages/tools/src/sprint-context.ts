import type { Sprint } from '@belvedere/shared';

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

  // velocity 記録のあるスプリント = 実績が確定したもの (undefined は進行中/未確定なので除外)。
  const withVelocity = sprints.filter((s) => s.velocity !== undefined);
  const avgVelocity =
    withVelocity.length > 0
      ? Math.round(withVelocity.reduce((n, s) => n + (s.velocity ?? 0), 0) / withVelocity.length)
      : null;

  const recentCompleted = withVelocity
    .slice()
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
