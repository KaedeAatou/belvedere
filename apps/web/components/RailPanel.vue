<script setup lang="ts">
import type { ScreenId } from '~/composables/useUiMeta';
import { CEREMONIES } from '~/composables/useUiMeta';

const props = defineProps<{
  screen: ScreenId;
  railTab: 'backlog' | 'events';
}>();
const emit = defineEmits<{ 'update:screen': [s: ScreenId] }>();

const showEvents = computed(() => props.railTab === 'events');
</script>

<template>
  <aside class="shell-rail">
    <!-- Events tab → 概要ホーム + ceremonies -->
    <div v-if="showEvents" class="rail-cer">
      <!-- 概要 (events ホーム / WC-cba82df1)。儀式の上にスプリント概要への入口を置く。 -->
      <div :class="['rail-cer-item', screen === 'events' && 'active']"
           data-testid="rail-events"
           @click="emit('update:screen', 'events')">
        <span class="num">◎</span>
        <span class="lbl">
          <span class="l1">概要</span>
          <span class="l2">Sprint overview</span>
        </span>
      </div>
      <div v-for="s in CEREMONIES" :key="s.id"
           :class="['rail-cer-item', screen === s.id && 'active']"
           :data-testid="`rail-${s.id}`"
           @click="emit('update:screen', s.id)">
        <span class="num">{{ s.floor }}</span>
        <span class="lbl">
          <span class="l1">{{ s.label }}</span>
          <span class="l2">{{ s.sub }}</span>
        </span>
      </div>
    </div>

    <!-- Backlog tab -->
    <div v-else class="rail-cer" style="padding-top: 8px">
      <div class="rail-cer-item active" style="cursor: default" data-testid="rail-backlog">
        <span class="num" style="font-size: 14px">BL</span>
        <span class="lbl">
          <span class="l1">Backlog</span>
          <span class="l2">Product backlog</span>
        </span>
      </div>
    </div>

  </aside>
</template>
