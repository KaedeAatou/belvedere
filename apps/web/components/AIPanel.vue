<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';
import { buildChecks, screenIntro, type AICheckAction } from '~/composables/useChecks';
import { renderMarkdownSafe } from '~/utils/markdown';

const props = defineProps<{
  screen: ScreenId;
  tickets: Ticket[];
  selectedTicketId?: string | null;
}>();
const emit = defineEmits<{ jump: [id: string]; navigate: [screen: ScreenId] }>();

const checks = computed(() => buildChecks(props.screen, props.tickets));
const intro = computed(() => screenIntro(props.screen));

// エージェントチャット (D-11)
const { messages, isSending, sendError, streamingDraft, send, retry, clear } = useAgentChat();
const inputText = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);

async function handleSend(): Promise<void> {
  const prompt = inputText.value.trim();
  if (!prompt || isSending.value) return;
  inputText.value = '';
  await send(props.screen, prompt, { tickets: props.tickets, selectedTicketId: props.selectedTicketId ?? null });
}

function onTextareaKeydown(e: KeyboardEvent): void {
  // ⌘Enter / Ctrl+Enter で送信
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    void handleSend();
  }
}

// アクションボタン (WC-f17989df): navigate は画面遷移、prompt は AI チャットに定型文を投入して実行。
async function onAction(a: AICheckAction): Promise<void> {
  if (a.kind === 'navigate' && a.target) {
    emit('navigate', a.target);
    return;
  }
  if (a.kind === 'prompt' && a.prompt && !isSending.value) {
    await send(props.screen, a.prompt, { tickets: props.tickets, selectedTicketId: props.selectedTicketId ?? null });
  }
}
</script>

<template>
  <div class="ai-head">
    <span class="ai-dot" />
    <span class="ai-title">Integrity AI</span>
    <span class="ai-sub">{{ checks.length }} signals</span>
    <button
      v-if="messages.length > 0"
      class="ai-clear"
      data-testid="ai-clear"
      title="会話をクリアして新しい会話を始める"
      @click="clear"
    >
      新しい会話
    </button>
  </div>

  <div class="ai-body">
    <!-- 静的 checks 表示 (buildChecks — 既存。壊さない) -->
    <div class="ai-msg">
      <span class="who">Belvedere</span>
      <span class="body">{{ intro }}</span>
    </div>

    <div v-for="(c, i) in checks" :key="i" class="ai-card">
      <div class="tag">{{ c.tag }}</div>
      <div v-if="c.ref" class="ref">{{ c.ref }}</div>
      <div class="msg">{{ c.msg }}</div>
      <div v-if="c.actions" class="actions">
        <button
          v-for="(a, j) in c.actions"
          :key="j"
          :class="a.primary && 'primary'"
          :data-testid="`ai-action-${a.kind}`"
          :disabled="a.kind === 'prompt' && isSending"
          @click="onAction(a)"
        >
          {{ a.label }}
        </button>
        <button v-if="c.ref && c.ticketId" @click="emit('jump', c.ticketId)">Open</button>
      </div>
    </div>

    <div v-if="checks.length === 0" class="ai-msg">
      <span class="who">Belvedere</span>
      <span class="body">この画面で検出された指摘はありません。</span>
    </div>

    <!-- 会話履歴 (D-11) -->
    <template v-if="messages.length > 0">
      <div class="chat-divider" />
      <div
        v-for="(m, i) in messages"
        :key="i"
        :class="['ai-msg', 'chat-msg']"
        :data-testid="`ai-message`"
      >
        <span class="who">{{ m.role === 'user' ? 'You' : 'Belvedere' }}</span>
        <span v-if="m.role === 'user'" class="body user">{{ m.text }}</span>
        <!-- agent メッセージは markdown 描画 (renderMarkdownSafe が生 HTML をエスケープ済み) -->
        <span v-else class="body md" v-html="renderMarkdownSafe(m.text)" />
        <!-- ツール実行トレースをチップ表示 (何を根拠に答えたかの可視化) -->
        <div v-if="m.role === 'agent' && m.steps?.length" class="ai-steps">
          <span
            v-for="(st, k) in m.steps"
            :key="k"
            class="ai-step"
            :class="{ 'step-fail': !st.ok }"
            data-testid="ai-step"
          >{{ st.toolName }}<template v-if="st.durationMs != null"> · {{ st.durationMs }}ms</template></span>
        </div>
      </div>
    </template>

    <!-- ストリーミング中の下書き (P6): delta で伸びる text + 実行済みツールチップ -->
    <div v-if="streamingDraft" class="ai-msg chat-msg" data-testid="ai-streaming">
      <span class="who">Belvedere</span>
      <span class="body md streaming" v-html="renderMarkdownSafe(streamingDraft.text || '…')" />
      <div v-if="streamingDraft.steps.length" class="ai-steps">
        <span
          v-for="(st, k) in streamingDraft.steps"
          :key="k"
          class="ai-step"
          :class="{ 'step-fail': !st.ok }"
          data-testid="ai-step"
        >{{ st.toolName }}<template v-if="st.durationMs != null"> · {{ st.durationMs }}ms</template></span>
      </div>
    </div>
    <!-- 実行中スピナー (非ストリーム時のみ) -->
    <div v-else-if="isSending" class="ai-msg chat-msg">
      <span class="who">Belvedere</span>
      <span class="body sending">実行中…</span>
    </div>

    <!-- エラーバナー + リトライ (会話に偽メッセージを混ぜず、ここで扱う) -->
    <div v-if="sendError && !isSending" class="ai-error" data-testid="ai-error">
      <span class="err-body">送信に失敗しました: {{ sendError }}</span>
      <button data-testid="ai-retry" @click="retry">再試行</button>
    </div>
  </div>

  <div class="ai-foot">
    <div class="ai-input">
      <textarea
        ref="textareaEl"
        v-model="inputText"
        data-testid="ai-input"
        placeholder="Ask integrity AI…  例: スプリントゴールを SMART で評価して"
        :disabled="isSending"
        @keydown="onTextareaKeydown"
      />
      <div class="row">
        <span class="spacer" />
        <span class="kbd-key">⌘ ↵</span>
        <button
          class="send"
          data-testid="ai-send"
          :disabled="isSending || !inputText.trim()"
          @click="handleSend"
        >
          {{ isSending ? '実行中…' : 'Send' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-divider {
  border-top: var(--hairline) solid var(--line-1);
  margin: 4px 0;
}
.chat-msg {
  background: transparent;
}
.body.user {
  color: var(--ink-0);
  font-weight: 500;
}
.body.sending {
  color: var(--ink-3);
  font-style: italic;
}
.send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* agent メッセージの markdown 描画 (renderMarkdownSafe 出力) */
.body.md {
  display: block;
}
.body.md :first-child {
  margin-top: 0;
}
.body.md :last-child {
  margin-bottom: 0;
}
.body.md h1,
.body.md h2,
.body.md h3 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 8px 0 4px;
  color: var(--ink-0);
}
.body.md p {
  margin: 4px 0;
}
.body.md ul,
.body.md ol {
  margin: 4px 0;
  padding-left: 1.2em;
}
.body.md li {
  margin: 2px 0;
}
.body.md code {
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  background: var(--line-1);
  padding: 0 4px;
  border-radius: 4px;
}
.body.md pre {
  background: var(--line-1);
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 6px 0;
}
.body.md pre code {
  background: none;
  padding: 0;
}
.body.md a {
  color: var(--accent);
  text-decoration: underline;
}
.body.md strong {
  font-weight: 600;
  color: var(--ink-0);
}
/* ストリーミング中の点滅カーソル (P6) */
.body.md.streaming::after {
  content: '▋';
  margin-left: 1px;
  color: var(--accent);
  animation: ai-blink 1s step-start infinite;
}
@keyframes ai-blink {
  50% {
    opacity: 0;
  }
}
/* ツール実行トレースのチップ */
.ai-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.ai-step {
  font-size: 0.7rem;
  font-family: ui-monospace, monospace;
  color: var(--ink-3);
  background: var(--line-1);
  padding: 1px 6px;
  border-radius: 999px;
  white-space: nowrap;
}
.ai-step.step-fail {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
/* エラーバナー + リトライ */
.ai-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-top: 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.ai-error .err-body {
  flex: 1;
  font-size: 0.8rem;
  color: var(--ink-0);
}
.ai-error button {
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
/* 新しい会話 (クリア) ボタン */
.ai-clear {
  margin-left: auto;
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  border: var(--hairline) solid var(--line-1);
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
}
.ai-clear:hover {
  color: var(--ink-0);
  border-color: var(--ink-3);
}
</style>
