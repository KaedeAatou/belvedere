// Agent へ渡す contextText の先頭ブロック (Product Goal → Sprint Goal) を合成する。
//
// 背景 (2026-07-10 実機検証): Workspace.productGoal は push (client context) でも pull (tool) でも
// agent に届いておらず、実 Gemini が「プロダクトゴールが不明なため判断できません」と回答した。
// ユーザーの根本思想 (TODO 消化ではなくビジネス直結を AI が判断する) を実体化するには、
// Product Goal → Sprint Goal → Story の連鎖の上位 2 段を経路 (web / MCP) に依らず必ず揃える必要がある。
//
// push は「毎回必ず要る小さな事実」だけに絞る (productGoal は最大 280 字 / workspace-handlers.ts の
// z.string().max(280) 制約と揃う)。Epic.rationale 等の大きい・条件付き情報は pull (tool) 側で扱う
// (token 予算 / パフォーマンス配慮)。

export interface ActiveSprintGoalInfo {
  number: number;
  goal: string;
  /** アクティブスプリントの計画 SP 合計 (Σ estimatePt)。Try 遵守判定等の決定論材料として push する */
  plannedSp: number;
  /** velocity 実績 (完了スプリント平均 / averageVelocity)。実績が無ければ null */
  velocity: number | null;
}

/**
 * agent へ渡す contextText を合成する純粋関数。productGoal / activeSprint が未設定でも
 * 「未設定」と明示することで、agent が「不明なので判断できない」ではなく
 * 「未設定なので設定を促す」と答えられるようにする (未設定の検出は決定論、その先の意味判断が AI の仕事)。
 */
export function composeServerContext(
  productGoal: string | null,
  activeSprint: ActiveSprintGoalInfo | null,
  clientContext: string | undefined,
): string {
  const goalLine =
    productGoal && productGoal.trim().length > 0
      ? productGoal.trim()
      : '(未設定。Home 画面で PO/admin が設定できます)';
  const lines = [`プロダクトゴール: ${goalLine}`];

  if (activeSprint) {
    const sprintGoalLine =
      activeSprint.goal.trim().length > 0 ? activeSprint.goal.trim() : '(未設定)';
    lines.push(`アクティブスプリント (Sprint ${activeSprint.number}) のゴール: ${sprintGoalLine}`);
    // 計画 SP 合計 / velocity 実績は決定論で取れる実数値なので push する。Try 遵守判定
    // (計画の詰め込みすぎ等) を LLM の多段 tool 呼び出しに依存させない (2026-07-10 実機:
    // flash が planner 委譲を実行せず「確認できない」で止まる)。
    const velocityLine =
      activeSprint.velocity !== null
        ? `velocity 実績 (完了スプリント平均): ${activeSprint.velocity} SP`
        : 'velocity 実績: なし (完了スプリントの実績が未登録)';
    lines.push(`計画 SP 合計: ${activeSprint.plannedSp} SP / ${velocityLine}`);
  } else {
    lines.push('アクティブスプリント: なし');
  }

  const header = `[プロダクトゴールとスプリントゴール]\n${lines.join('\n')}`;
  return clientContext ? `${header}\n\n${clientContext}` : header;
}
