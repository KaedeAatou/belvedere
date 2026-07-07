import type { AgentRun, AgentStep } from '@belvedere/shared';

// Firestore の 1 ドキュメント上限は 1MB。agent の tool 結果 (ticket 一覧等) は肥大しがちなので、
// 各 step の content を JSON 8KB で切り詰めてから保存する (会話タグとしての run 記録が目的で、
// step の完全な生データ保存は目的ではない)。
const MAX_STEP_CONTENT_BYTES = 8 * 1024;

function trimStep(step: AgentStep): AgentStep {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(step.content);
  } catch {
    return { ...step, content: { truncated: true, reason: 'unserializable' } };
  }
  // content=undefined (JSON.stringify が undefined を返す) や 8KB 以下はそのまま。
  if (serialized === undefined || serialized.length <= MAX_STEP_CONTENT_BYTES) return step;
  return { ...step, content: { truncated: true, preview: serialized.slice(0, MAX_STEP_CONTENT_BYTES) } };
}

/**
 * AgentRun を永続化用に整形する純粋関数。各 step の content を 8KB で切り詰め、
 * childRuns (Orchestrator 協議の子 run) も再帰的に整形する。
 * 元の run は変更しない (レスポンスにはフル content を返し、保存だけ切り詰める)。
 */
export function trimRunForPersist(run: AgentRun): AgentRun {
  return {
    ...run,
    steps: run.steps.map(trimStep),
    ...(run.childRuns && { childRuns: run.childRuns.map(trimRunForPersist) }),
  };
}
