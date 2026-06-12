<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';
import { buildChecks, screenIntro } from '~/composables/useChecks';

const props = defineProps<{
  screen: ScreenId;
  tickets: Ticket[];
}>();
const emit = defineEmits<{ jump: [id: string] }>();

const checks = computed(() => buildChecks(props.screen, props.tickets));
const intro = computed(() => screenIntro(props.screen));
</script>

<template>
  <div class="ai-head">
    <span class="ai-dot" />
    <span class="ai-title">Integrity AI</span>
    <span class="ai-sub">{{ checks.length }} signals</span>
  </div>

  <div class="ai-body">
    <div class="ai-msg">
      <span class="who">Belvedere</span>
      <span class="body">{{ intro }}</span>
    </div>

    <div v-for="(c, i) in checks" :key="i" class="ai-card">
      <div class="tag">{{ c.tag }}</div>
      <div v-if="c.ref" class="ref">{{ c.ref }}</div>
      <div class="msg">{{ c.msg }}</div>
      <div v-if="c.actions" class="actions">
        <button v-for="(a, j) in c.actions" :key="j" :class="a.primary && 'primary'">
          {{ a.label }}
        </button>
        <button v-if="c.ref && c.ticketId" @click="emit('jump', c.ticketId)">Open</button>
      </div>
    </div>

    <div v-if="checks.length === 0" class="ai-msg">
      <span class="who">Belvedere</span>
      <span class="body">この画面で検出された指摘はありません。</span>
    </div>
  </div>

  <div class="ai-foot">
    <div class="ai-input">
      <textarea placeholder="Ask integrity AI…  例: スプリントゴールを SMART で評価して" />
      <div class="row">
        <span class="spacer" />
        <span class="kbd-key">⌘ ↵</span>
        <button class="send">Send</button>
      </div>
    </div>
  </div>
</template>
