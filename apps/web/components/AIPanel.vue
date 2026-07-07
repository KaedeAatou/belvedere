<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';
import { buildChecks, screenIntro, type AICheckAction } from '~/composables/useChecks';

const props = defineProps<{
  screen: ScreenId;
  tickets: Ticket[];
  selectedTicketId?: string | null;
}>();
const emit = defineEmits<{ jump: [id: string]; navigate: [screen: ScreenId] }>();

const checks = computed(() => buildChecks(props.screen, props.tickets));
const intro = computed(() => screenIntro(props.screen));

// エージェントチャット (D-11)
const { messages, isSending, send } = useAgentChat();
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
        <span :class="['body', m.role === 'user' && 'user']">{{ m.text }}</span>
      </div>
    </template>

    <!-- 実行中スピナー -->
    <div v-if="isSending" class="ai-msg chat-msg">
      <span class="who">Belvedere</span>
      <span class="body sending">実行中…</span>
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
</style>
