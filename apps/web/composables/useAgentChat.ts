// AI Panel チャット composable (D-11 / 2026-06-12)。
// POST /api/agents/:name に prompt を投げ、応答 (AgentRun.outputArtifacts.summary) を
// 会話履歴に追記する。画面切替時も会話を維持するため useState で共有する。

import type { ScreenId } from '~/composables/useUiMeta';
import type { Sprint } from '@belvedere/shared';

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
}

/** ScreenId → API agent name のマッピング。 */
const SCREEN_TO_AGENT: Record<ScreenId, string> = {
  backlog:    'refinement',   // Backlog / Refinement 両方とも Refinement Agent
  refinement: 'refinement',
  planning:   'planner',
  daily:      'daily',
  review:     'reviewer',
  retro:      'retrospective',
  events:     'daily',        // events ホームの概要は Daily Agent (スプリント状態) に寄せる (WC-cba82df1)
  'sprint-history': 'retrospective', // 完了スプリントの振り返り文脈 → Retrospective Agent
};

/**
 * ④ feature flag: AI パネルの送信先 agent を決める純粋関数 (Nuxt 非依存。直接 unit テストする)。
 * useOrchestratorWindow=true なら Orchestrator (単一窓口=協議統括) に集約、false なら画面に対応する儀式 agent。
 */
export function resolveAgentName(screen: ScreenId, useOrchestratorWindow: boolean): string {
  return useOrchestratorWindow ? 'orchestrator' : SCREEN_TO_AGENT[screen];
}

/**
 * WC-39/29: AI パネルへ渡す現在スプリント文脈を組む純粋関数 (Nuxt 非依存で直接テスト)。
 * ユーザーが sprintId を明示しなくても agent が active/next スプリント (velocity/ゴール含む) を
 * 把握できるようにする。該当スプリントが無ければ undefined (payload に載せない)。
 */
export function buildAgentContext(sprints: Sprint[]): string | undefined {
  const active = sprints.find((s) => s.status === 'active');
  const next = sprints.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
  // velocity 実績 = 完了スプリントの velocity 平均。画面 PLANNED/VELOCITY の分母 (avgVelocity) と一致させる。
  // active 自身の velocity は「進行中で未確定」なので、AI に渡すのは実績平均にする (画面と食い違わせない)。
  const completed = sprints.filter((s) => s.velocity !== undefined);
  const avgVelocity = completed.length > 0
    ? Math.round(completed.reduce((n, s) => n + (s.velocity ?? 0), 0) / completed.length)
    : null;
  if (!active && !next) return undefined; // スプリントが無ければ文脈を付けない (payload に載せない)。
  const lines: string[] = [];
  if (active) {
    const nm = active.name?.trim() || `Sprint ${active.number}`;
    lines.push(`現在のアクティブスプリント: id=${active.id} / 名前=${nm} / ゴール=${active.goal?.trim() || '(未設定)'}`);
  }
  lines.push(`velocity 実績 (直近完了スプリントの平均 = 画面 PLANNED/VELOCITY の分母) = ${avgVelocity ?? '(実績なし)'}`);
  if (next) {
    const nm = next.name?.trim() || `Sprint ${next.number}`;
    lines.push(`次の計画中スプリント: id=${next.id} / 名前=${nm}`);
  }
  return lines.length > 0 ? `[現在のスプリント状況]\n${lines.join('\n')}` : undefined;
}

export const useAgentChat = () => {
  const messages = useState<ChatMessage[]>('agent-chat-messages', () => []);
  const isSending = useState<boolean>('agent-chat-sending', () => false);
  const sendError = useState<string | null>('agent-chat-error', () => null);

  const api = useApiClient();
  const config = useRuntimeConfig();
  const { sprints } = useSprints();

  async function send(screen: ScreenId, prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || isSending.value) return;

    messages.value = [...messages.value, { role: 'user', text: trimmed }];
    isSending.value = true;
    sendError.value = null;

    // ④ feature flag (既定 OFF = 回帰ゼロ): ON で Orchestrator (単一窓口=協議統括) に集約、OFF で画面対応 agent。
    const agentName = resolveAgentName(screen, Boolean(config.public.useOrchestratorWindow));
    try {
      // WC-39/29: 現在のスプリント文脈を自動付与し、ユーザーが sprintId を書かなくても診断できるようにする。
      const context = buildAgentContext(sprints.value);
      // 会話継続: 直近の会話履歴 (今回追加した user を除く最新 8 件) を送り、AI が前の文脈を保持できるようにする。
      const history = messages.value
        .slice(0, -1)
        .slice(-8)
        .map((m) => ({ role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), content: m.text }));
      const run = await api.post<{
        status: string;
        outputArtifacts?: { summary?: string };
        steps?: Array<{ type: string; content: unknown }>;
        error?: { message: string };
      }>(`/api/agents/${agentName}`, {
        prompt: trimmed,
        ...(context && { context }),
        ...(history.length > 0 && { history }),
      });

      // summary が最優先。無ければ output 型 step の content を文字列化。
      let responseText = run.outputArtifacts?.summary ?? '';
      if (!responseText && run.steps) {
        const outputStep = run.steps.findLast?.((s) => s.type === 'output');
        if (outputStep) {
          responseText = typeof outputStep.content === 'string'
            ? outputStep.content
            : JSON.stringify(outputStep.content, null, 2);
        }
      }
      if (!responseText) {
        responseText = run.error?.message
          ? `エラー: ${run.error.message}`
          : `ステータス: ${run.status}`;
      }
      messages.value = [...messages.value, { role: 'agent', text: responseText }];
    } catch (e) {
      const errText = apiErrorMessage(e);
      sendError.value = errText;
      messages.value = [...messages.value, { role: 'agent', text: `エラー: ${errText}` }];
    } finally {
      isSending.value = false;
    }
  }

  function clear(): void {
    messages.value = [];
    sendError.value = null;
  }

  return { messages, isSending, sendError, send, clear };
};
