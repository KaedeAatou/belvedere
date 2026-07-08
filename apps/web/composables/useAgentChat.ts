// AI Panel チャット composable (D-11 / 2026-06-12)。
// POST /api/agents/:name に prompt を投げ、応答 (AgentRun.outputArtifacts.summary) を
// 会話履歴に追記する。画面切替時も会話を維持するため useState で共有する。

import type { ScreenId } from '~/composables/useUiMeta';
import type { Sprint, Ticket } from '@belvedere/shared';
import { averageVelocity } from '@belvedere/shared';

export interface ChatStep {
  toolName: string;
  ok: boolean;
  durationMs?: number;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  /** agent メッセージが実行したツールの要約 (チップ表示用)。 */
  steps?: ChatStep[];
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
 * runtimeConfig の flag 値 (boolean か、env 上書き由来の文字列) を厳密に boolean 化する。
 * env `NUXT_PUBLIC_USE_ORCHESTRATOR_WINDOW=false` は文字列 "false" で来ることがあり、
 * `Boolean("false")===true` で誤って有効化される事故を防ぐ (true / "true" のみ有効)。
 */
export function isFlagEnabled(v: unknown): boolean {
  return v === true || v === 'true';
}

/** ScreenId → 人間可読な画面名 (AI に「今どの儀式画面を見ているか」を伝える)。 */
const SCREEN_LABEL: Record<ScreenId, string> = {
  backlog: 'Backlog',
  refinement: 'Backlog Refinement',
  planning: 'Sprint Planning',
  daily: 'Daily Scrum',
  review: 'Sprint Review',
  retro: 'Retrospective',
  events: 'ホーム (Events)',
  'sprint-history': 'スプリント履歴',
};

export interface AgentContextInput {
  sprints: Sprint[];
  screen: ScreenId;
  /** その画面に表示中のチケット (一覧を context に載せる。上限 20 件)。 */
  tickets: Ticket[];
  /** 詳細を開いている (選択中の) チケット ID。無ければ null。 */
  selectedTicketId: string | null;
}

/**
 * WC-39/29 + P2: AI パネルへ渡す現在文脈を組む純粋関数 (Nuxt 非依存で直接テスト)。
 * 画面 / active・next スプリント (velocity/ゴール) / 選択中チケット / 表示中チケット一覧を渡し、
 * ユーザーが id を書かなくても agent が「今どこで何を見ているか」を把握できるようにする。
 * 画面名は常に付くので、スプリントが無くても文脈は空にならない。
 */
export function buildAgentContext(input: AgentContextInput): string {
  const { sprints, screen, tickets, selectedTicketId } = input;
  const lines: string[] = [`現在の画面: ${SCREEN_LABEL[screen]}`];

  const active = sprints.find((s) => s.status === 'active');
  const next = sprints.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
  // velocity 実績 = 完了スプリントの velocity 平均 (正準ヘルパ / 画面・SMART 評価と同一定義 / F-30 根治)。
  const avgVelocity = averageVelocity(sprints);
  if (active) {
    const nm = active.name?.trim() || `Sprint ${active.number}`;
    lines.push(`アクティブスプリント: id=${active.id} / 名前=${nm} / ゴール=${active.goal?.trim() || '(未設定)'}`);
  }
  lines.push(`velocity 実績 (直近完了スプリントの平均 = 画面 PLANNED/VELOCITY の分母) = ${avgVelocity ?? '(実績なし)'}`);
  if (next) {
    const nm = next.name?.trim() || `Sprint ${next.number}`;
    lines.push(`次の計画中スプリント: id=${next.id} / 名前=${nm}`);
  }

  const selected = selectedTicketId ? tickets.find((t) => t.id === selectedTicketId) : undefined;
  if (selected) {
    lines.push(
      `選択中チケット: ${selected.id} 「${selected.title}」 status=${selected.status} SP=${selected.estimatePt ?? '未'}`,
    );
  }
  if (tickets.length > 0) {
    const shown = tickets
      .slice(0, 20)
      .map((t) => `${t.id}: ${t.title} [${t.status}/SP=${t.estimatePt ?? '未'}]`);
    lines.push(`表示中のチケット (${shown.length}/${tickets.length} 件):\n${shown.join('\n')}`);
    // F-24/F-36 (2026-07-08): 上限で切られたチケットを AI が「存在しない」と断定していた。
    // 一覧が一部であることと、存在確認の正しい手段 (ticket.get) を明示する。
    if (tickets.length > 20) {
      lines.push(
        'この一覧は一部のみ (先頭 20 件)。ここに無いチケットも存在しうるので、「存在しない」と断定せず ticket.get / ticket.list で確認すること。',
      );
    }
  }

  return `[現在の画面とスプリント状況]\n${lines.join('\n')}`;
}

export const useAgentChat = () => {
  const messages = useState<ChatMessage[]>('agent-chat-messages', () => []);
  const isSending = useState<boolean>('agent-chat-sending', () => false);
  const sendError = useState<string | null>('agent-chat-error', () => null);
  // 直近の失敗した送信 (リトライ用)。成功で null に戻す。
  const lastAttempt = useState<{
    screen: ScreenId;
    prompt: string;
    opts: { tickets?: Ticket[]; selectedTicketId?: string | null };
  } | null>('agent-chat-last-attempt', () => null);
  // P6: ストリーミング中の下書き (delta で伸びる text + 実行済みツールチップ)。非 null = 生成中。
  const streamingDraft = useState<{ text: string; steps: ChatStep[] } | null>(
    'agent-chat-stream-draft',
    () => null,
  );

  const api = useApiClient();
  const config = useRuntimeConfig();
  const { sprints } = useSprints();

  // 会話 ID (P5 のサーバ保存で使う) と localStorage 永続 (リロードで会話を失わない)。
  const conversationId = useState<string>('agent-chat-conv-id', () => '');
  const hydrated = useState<boolean>('agent-chat-hydrated', () => false);
  const STORAGE_KEY = 'belv:ai-chat:v1';
  const MAX_PERSIST = 50;

  const newConversationId = (): string =>
    import.meta.client && typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `conv-${Date.now()}`;

  function persist(): void {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ conversationId: conversationId.value, messages: messages.value.slice(-MAX_PERSIST) }),
      );
    } catch {
      /* quota 超過等は無視 (会話を壊さない) */
    }
  }

  // クライアントで一度だけ localStorage から復元し、以降の messages 変更を保存する。
  function hydrate(): void {
    if (!import.meta.client || hydrated.value) return;
    hydrated.value = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { conversationId?: unknown; messages?: unknown };
        if (Array.isArray(parsed.messages)) messages.value = parsed.messages as ChatMessage[];
        if (typeof parsed.conversationId === 'string' && parsed.conversationId) {
          conversationId.value = parsed.conversationId;
        }
      }
    } catch {
      /* 壊れた JSON は無視 (握り潰して新規会話として続行) */
    }
    if (!conversationId.value) conversationId.value = newConversationId();
    watch(messages, persist, { deep: true });
  }

  if (import.meta.client) onMounted(hydrate);

  // user メッセージが既に messages に積まれている前提で agent へ問い合わせる中核。
  // send() は user メッセージを積んでから呼び、retry() は積まずに再実行する (user 重複追加なし)。
  async function runAgentRequest(
    screen: ScreenId,
    prompt: string,
    opts: { tickets?: Ticket[]; selectedTicketId?: string | null },
  ): Promise<void> {
    isSending.value = true;
    sendError.value = null;

    // ④ feature flag (既定 OFF = 回帰ゼロ): ON で Orchestrator (単一窓口=協議統括) に集約、OFF で画面対応 agent。
    const agentName = resolveAgentName(screen, isFlagEnabled(config.public.useOrchestratorWindow));
    try {
      // P2: 画面 + 現在スプリント + 選択中/表示中チケットを自動付与し、ユーザーが id を書かなくても診断できるようにする。
      const context = buildAgentContext({
        sprints: sprints.value,
        screen,
        tickets: opts.tickets ?? [],
        selectedTicketId: opts.selectedTicketId ?? null,
      });
      // 会話継続: 直近履歴 (末尾の user を除く最新 8 件)。retry 時も末尾は失敗した user なので同じ式で成立。
      const history = messages.value
        .slice(0, -1)
        .slice(-8)
        .map((m) => ({ role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), content: m.text }));
      const run = await api.post<{
        status: string;
        outputArtifacts?: { summary?: string };
        steps?: Array<{ type: string; content: unknown; toolName?: string; durationMs?: number }>;
        error?: { message: string };
      }>(`/api/agents/${agentName}`, {
        prompt,
        ...(context && { context }),
        ...(history.length > 0 && { history }),
        ...(conversationId.value && { conversationId: conversationId.value }),
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
        responseText = run.error?.message ? `エラー: ${run.error.message}` : `ステータス: ${run.status}`;
      }

      // ツール実行トレース (tool_result step) をチップ用に要約する。
      const steps = (run.steps ?? [])
        .filter((s) => s.type === 'tool_result' && s.toolName)
        .map((s) => ({
          toolName: s.toolName as string,
          ok: !(typeof s.content === 'object' && s.content !== null && 'error' in s.content),
          ...(s.durationMs !== undefined && { durationMs: s.durationMs }),
        }));

      messages.value = [
        ...messages.value,
        { role: 'agent', text: responseText, ...(steps.length > 0 && { steps }) },
      ];
      lastAttempt.value = null; // 成功 → リトライ不要
    } catch (e) {
      // エラーは会話に偽の agent メッセージとして混ぜず、バナー + リトライに委ねる (会話を汚さない)。
      sendError.value = apiErrorMessage(e);
      lastAttempt.value = { screen, prompt, opts };
    } finally {
      isSending.value = false;
    }
  }

  // P6: ストリーミング送信。delta で下書きを伸ばし step でチップを足し、run で確定して message に push。
  // 戻り値 = このリクエストを処理したか。false = 最初のイベント前に失敗 → 呼び手が非ストリームで再試行。
  async function runAgentStream(
    screen: ScreenId,
    prompt: string,
    opts: { tickets?: Ticket[]; selectedTicketId?: string | null },
  ): Promise<boolean> {
    isSending.value = true;
    sendError.value = null;
    streamingDraft.value = { text: '', steps: [] };

    const agentName = resolveAgentName(screen, isFlagEnabled(config.public.useOrchestratorWindow));
    const context = buildAgentContext({
      sprints: sprints.value,
      screen,
      tickets: opts.tickets ?? [],
      selectedTicketId: opts.selectedTicketId ?? null,
    });
    const history = messages.value
      .slice(0, -1)
      .slice(-8)
      .map((m) => ({ role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), content: m.text }));

    type StreamRun = { outputArtifacts?: { summary?: string }; status?: string; error?: { message?: string } };
    let sawEvent = false;
    let finalRun: StreamRun | null = null;
    let streamError: Error | null = null;
    try {
      await api.stream(
        `/api/agents/${agentName}/stream`,
        {
          prompt,
          ...(context && { context }),
          ...(history.length > 0 && { history }),
          ...(conversationId.value && { conversationId: conversationId.value }),
        },
        (ev) => {
          sawEvent = true;
          if (ev.event === 'delta') {
            try {
              const d = JSON.parse(ev.data) as { text?: string };
              if (d.text && streamingDraft.value) {
                streamingDraft.value = { ...streamingDraft.value, text: streamingDraft.value.text + d.text };
              }
            } catch {
              /* 壊れた delta は無視 */
            }
          } else if (ev.event === 'step') {
            try {
              const s = JSON.parse(ev.data) as { type?: string; toolName?: string; durationMs?: number; ok?: boolean };
              if (s.type === 'tool_result' && s.toolName && streamingDraft.value) {
                streamingDraft.value = {
                  ...streamingDraft.value,
                  steps: [
                    ...streamingDraft.value.steps,
                    {
                      toolName: s.toolName,
                      ok: s.ok !== false,
                      ...(s.durationMs !== undefined && { durationMs: s.durationMs }),
                    },
                  ],
                };
              }
            } catch {
              /* 壊れた step は無視 */
            }
          } else if (ev.event === 'run') {
            try {
              finalRun = JSON.parse(ev.data) as typeof finalRun;
            } catch {
              /* 無視 (下書き text で確定する) */
            }
          } else if (ev.event === 'error') {
            try {
              const e = JSON.parse(ev.data) as { message?: string };
              streamError = new Error(e.message ?? 'stream error');
            } catch {
              streamError = new Error('stream error');
            }
            throw streamError;
          }
        },
      );

      // 確定: run の summary を最優先、無ければ下書き text。
      // finalRun は callback 内代入なので TS flow narrowing を cast で解除する。
      const run = finalRun as StreamRun | null;
      const responseText =
        run?.outputArtifacts?.summary ||
        streamingDraft.value?.text ||
        (run?.error?.message ? `エラー: ${run.error.message}` : `ステータス: ${run?.status ?? 'unknown'}`);
      const steps = streamingDraft.value?.steps ?? [];
      messages.value = [
        ...messages.value,
        { role: 'agent', text: responseText, ...(steps.length > 0 && { steps }) },
      ];
      lastAttempt.value = null;
      return true;
    } catch (e) {
      if (!sawEvent) return false; // 最初のイベント前に失敗 → 呼び手が非ストリームで再試行 (fallback)
      sendError.value = apiErrorMessage(streamError ?? e);
      lastAttempt.value = { screen, prompt, opts };
      return true;
    } finally {
      streamingDraft.value = null;
      isSending.value = false;
    }
  }

  // 送信の入口: streaming flag ON かつ client なら stream、最初のイベント前に落ちたら非ストリームへ fallback。
  async function dispatch(
    screen: ScreenId,
    prompt: string,
    opts: { tickets?: Ticket[]; selectedTicketId?: string | null },
  ): Promise<void> {
    if (import.meta.client && isFlagEnabled(config.public.useStreamingChat)) {
      const handled = await runAgentStream(screen, prompt, opts);
      if (handled) return;
    }
    await runAgentRequest(screen, prompt, opts);
  }

  async function send(
    screen: ScreenId,
    prompt: string,
    opts: { tickets?: Ticket[]; selectedTicketId?: string | null } = {},
  ): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || isSending.value) return;
    messages.value = [...messages.value, { role: 'user', text: trimmed }];
    await dispatch(screen, trimmed, opts);
  }

  // 直近の失敗を、user メッセージを重複追加せずに再送する。
  async function retry(): Promise<void> {
    const a = lastAttempt.value;
    if (!a || isSending.value) return;
    await dispatch(a.screen, a.prompt, a.opts);
  }

  function clear(): void {
    messages.value = [];
    sendError.value = null;
    lastAttempt.value = null;
    conversationId.value = newConversationId(); // 新しい会話 = 新しい ID
    persist();
  }

  return { messages, isSending, sendError, streamingDraft, conversationId, send, retry, clear };
};
