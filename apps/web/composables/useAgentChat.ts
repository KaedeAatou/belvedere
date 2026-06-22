// AI Panel チャット composable (D-11 / 2026-06-12)。
// POST /api/agents/:name に prompt を投げ、応答 (AgentRun.outputArtifacts.summary) を
// 会話履歴に追記する。画面切替時も会話を維持するため useState で共有する。

import type { ScreenId } from '~/composables/useUiMeta';

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
};

/**
 * ④ feature flag: AI パネルの送信先 agent を決める純粋関数 (Nuxt 非依存。直接 unit テストする)。
 * useOrchestratorWindow=true なら Orchestrator (単一窓口=協議統括) に集約、false なら画面に対応する儀式 agent。
 */
export function resolveAgentName(screen: ScreenId, useOrchestratorWindow: boolean): string {
  return useOrchestratorWindow ? 'orchestrator' : SCREEN_TO_AGENT[screen];
}

export const useAgentChat = () => {
  const messages = useState<ChatMessage[]>('agent-chat-messages', () => []);
  const isSending = useState<boolean>('agent-chat-sending', () => false);
  const sendError = useState<string | null>('agent-chat-error', () => null);

  const api = useApiClient();
  const config = useRuntimeConfig();

  async function send(screen: ScreenId, prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || isSending.value) return;

    messages.value = [...messages.value, { role: 'user', text: trimmed }];
    isSending.value = true;
    sendError.value = null;

    // ④ feature flag (既定 OFF = 回帰ゼロ): ON で Orchestrator (単一窓口=協議統括) に集約、OFF で画面対応 agent。
    const agentName = resolveAgentName(screen, Boolean(config.public.useOrchestratorWindow));
    try {
      const run = await api.post<{
        status: string;
        outputArtifacts?: { summary?: string };
        steps?: Array<{ type: string; content: unknown }>;
        error?: { message: string };
      }>(`/api/agents/${agentName}`, { prompt: trimmed });

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
