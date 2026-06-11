<script setup lang="ts">
import type { ScreenId } from '~/composables/useUiMeta';
import { SCREENS } from '~/composables/useUiMeta';

const props = defineProps<{
  screen: ScreenId;
  aiOpen: boolean;
  railTab: 'backlog' | 'events';
}>();
const emit = defineEmits<{
  'update:screen': [s: ScreenId];
  'update:aiOpen': [v: boolean];
  'update:railTab': [v: 'backlog' | 'events'];
}>();

const cur = computed(() => SCREENS.find((s) => s.id === props.screen));

function setScreen(s: ScreenId) { emit('update:screen', s); }
function setRailTab(t: 'backlog' | 'events') { emit('update:railTab', t); }
</script>

<template>
  <div :class="['app', !aiOpen && 'ai-collapsed']">
    <!-- ===== HEADER ===== -->
    <div class="shell-header">
      <div class="brand">
        <Icon name="brand" :size="22" />
        <div class="brand-name">Belvedere</div>
      </div>
      <div class="crumbs">
        <div class="seg-ctrl">
          <button :class="['seg-btn', railTab === 'backlog' && 'active']"
                  @click="() => { setRailTab('backlog'); setScreen('backlog'); }">Backlog</button>
          <button :class="['seg-btn', railTab === 'events' && 'active']"
                  @click="setRailTab('events')">Events</button>
        </div>
        <span class="sep">/</span>
        <span class="now">{{ cur?.label }}</span>
      </div>
      <div class="header-actions">
        <button class="h-btn"><Icon name="search" /> <span>Search</span> <span class="kbd">⌘K</span></button>
        <button class="h-btn icon"><Icon name="bell" /></button>
        <button class="h-btn" @click="emit('update:aiOpen', !aiOpen)">
          <Icon name="sparkle" /> <span>{{ aiOpen ? 'Hide AI' : 'Show AI' }}</span>
        </button>
        <UserMenu />
      </div>
    </div>

    <!-- ===== RAIL ===== -->
    <RailPanel :screen="screen" :rail-tab="railTab" @update:screen="setScreen" />

    <!-- ===== MAIN ===== -->
    <main class="shell-main">
      <slot />
    </main>

    <!-- ===== AI PANEL ===== -->
    <aside v-if="aiOpen" class="shell-ai">
      <slot name="ai" />
    </aside>
  </div>
</template>
