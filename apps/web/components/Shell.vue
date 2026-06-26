<script setup lang="ts">
import type { ScreenId } from '~/composables/useUiMeta';

defineProps<{
  screen: ScreenId;
  aiOpen: boolean;
  railTab: 'backlog' | 'events';
}>();
const emit = defineEmits<{
  'update:screen': [s: ScreenId];
  'update:aiOpen': [v: boolean];
  'update:railTab': [v: 'backlog' | 'events'];
}>();

function setScreen(s: ScreenId) { emit('update:screen', s); }
function setRailTab(t: 'backlog' | 'events') { emit('update:railTab', t); }

// ⌘K 検索オーバーレイ
const { toggle: toggleSearch } = useSearch();

onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleSearch();
    }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});
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
        <!-- 旧「/ <現在画面ラベル>」breadcrumb 末尾は撤去 (WC-924256e9)。
             Events 切替時に setScreen を呼ばず cur.label が更新されず紛らわしかったため。
             現在地は seg-ctrl の active 状態とレールのハイライトで分かる。 -->
      </div>
      <div class="header-actions">
        <button class="h-btn" data-testid="search-btn" @click="toggleSearch">
          <Icon name="search" /> <span>Search</span> <span class="kbd">⌘K</span>
        </button>
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
