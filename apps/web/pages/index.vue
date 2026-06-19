<script setup lang="ts">
import type { Status, Ticket } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';

// 実 API データ源 (R3: demo data 廃止)。useState 共有なので各画面は composable から直接読む。
const { tickets, fetchTickets, changeStatus } = useTickets();
const { fetchMembers } = useMembers();
const { fetchSprints } = useSprints();
const { fetchEpics } = useEpics();
const { fetchFindings } = useFindings();

const screen = ref<ScreenId>('backlog');
const aiOpen = ref(true);
const railTab = ref<'backlog' | 'events'>('backlog');
const selected = ref<string | null>(null);
// Refinement の「ポーカー開始」→ DetailSheet を開き、見積もりパネル (T7) が auto-start する合図
const pokerAutostart = useState<string | null>('poker-autostart', () => null);

// ⌘K 検索オーバーレイ
const { isOpen: searchOpen, query: searchQuery, close: closeSearch, filter: filterTickets } = useSearch();
const searchResults = computed<Ticket[]>(() => filterTickets(tickets.value));
const searchCursor = ref(0);
// 検索 input の実体。テンプレートの ref="searchInputEl" を受ける宣言がなく、再オープン時に
// autofocus が効かない (autofocus は要素の初回挿入時のみ) ため、open 監視で明示フォーカスする。
const searchInputEl = ref<HTMLInputElement | null>(null);

watch(searchQuery, () => { searchCursor.value = 0; });
watch(searchOpen, (v) => {
  if (v) nextTick(() => searchInputEl.value?.focus());
  else searchCursor.value = 0;
});

function onSearchSelect(id: string): void {
  closeSearch();
  selected.value = id;
  // backlog 画面でなければ遷移
  if (screen.value !== 'backlog') {
    screen.value = 'backlog';
    railTab.value = 'backlog';
  }
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchCursor.value = Math.min(searchCursor.value + 1, searchResults.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchCursor.value = Math.max(searchCursor.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const t = searchResults.value[searchCursor.value];
    if (t) onSearchSelect(t.id);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
  }
}

onMounted(() => {
  fetchTickets();
  fetchMembers();
  fetchSprints();
  fetchEpics(); // story 作成フォームの親 Epic セレクタ候補 (案A)
  fetchFindings('refinement'); // 全画面共通: チケット品質の指摘 (T5-3 ピル / T9 ワークキュー)

  // U-2: ESC で DetailSheet を閉じる。
  // 入力フィールドにフォーカスがある場合はブラウザのデフォルト (blur) に任せ、sheet には触れない。
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (selected.value !== null) {
      e.preventDefault();
      selected.value = null;
    }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});

watch(screen, (s) => {
  if (s === 'backlog') railTab.value = 'backlog';
});

function onSelect(id: string) { selected.value = id; }
function onClose() { selected.value = null; }
function onMove(id: string, status: Status) { changeStatus(id, status); }
function onJump(id: string) { selected.value = id; }
function onStartPoker(id: string) { pokerAutostart.value = id; selected.value = id; }

const ticket = computed(() =>
  selected.value ? tickets.value.find((t) => t.id === selected.value) ?? null : null,
);
</script>

<template>
  <Shell v-model:screen="screen" v-model:ai-open="aiOpen" v-model:rail-tab="railTab">
    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative">
      <BacklogScreen v-if="screen === 'backlog'"
                     :tickets="tickets" :selected-id="selected"
                     @select="onSelect" />
      <PlanningScreen v-else-if="screen === 'planning'"
                      :tickets="tickets" :selected-id="selected"
                      @select="onSelect" />
      <DailyScreen v-else-if="screen === 'daily'"
                   :tickets="tickets" :selected-id="selected"
                   @select="onSelect" @move="onMove" />
      <RefinementScreen v-else-if="screen === 'refinement'"
                        :tickets="tickets" :selected-id="selected"
                        @select="onSelect" @start-poker="onStartPoker" />
      <ReviewScreen v-else-if="screen === 'review'"
                    :tickets="tickets" :selected-id="selected"
                    @select="onSelect" @go-retro="screen = 'retro'" />
      <RetroScreen v-else-if="screen === 'retro'" />

      <DetailSheet v-if="ticket" :ticket="ticket" @close="onClose" />
    </div>

    <template #ai>
      <AIPanel :screen="screen" :tickets="tickets" @jump="onJump" />
    </template>
  </Shell>

  <!-- ⌘K 検索オーバーレイ (T-1) -->
  <div v-if="searchOpen" class="search-overlay" data-testid="search-overlay" @click.self="closeSearch">
    <div class="search-box">
      <div class="search-head">
        <Icon name="search" :size="16" />
        <input
          ref="searchInputEl"
          v-model="searchQuery"
          data-testid="search-input"
          type="text"
          class="search-input"
          placeholder="チケット ID またはタイトルで検索..."
          autofocus
          @keydown="onSearchKeydown"
        />
        <span class="kbd-key">ESC</span>
      </div>
      <div v-if="searchQuery.trim()" class="search-results">
        <div v-if="searchResults.length === 0" class="search-empty">
          一致するチケットがありません
        </div>
        <button
          v-for="(t, i) in searchResults"
          :key="t.id"
          :class="['search-result', i === searchCursor && 'active']"
          :data-testid="`search-result-${t.id}`"
          @click="onSearchSelect(t.id)"
          @mousemove="searchCursor = i"
        >
          <span class="result-id">{{ t.id }}</span>
          <span class="result-title">{{ t.title }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ⌘K 検索オーバーレイ */
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 8, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  z-index: 300;
}
.search-box {
  width: 100%;
  max-width: 520px;
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgba(8, 8, 8, 0.15);
  overflow: hidden;
}
.search-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.search-input {
  flex: 1;
  font-family: var(--sans);
  font-size: 15px;
  color: var(--ink-0);
  background: transparent;
  border: none;
  outline: none;
}
.search-input::placeholder { color: var(--ink-3); }
.search-results {
  max-height: 360px;
  overflow-y: auto;
}
.search-empty {
  padding: 20px 16px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-3);
  text-align: center;
}
.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  border-bottom: var(--hairline) solid var(--line-1);
  transition: background 0.1s ease;
  cursor: pointer;
}
.search-result:last-child { border-bottom: none; }
.search-result:hover,
.search-result.active {
  background: var(--bg-2);
}
.result-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.06em;
  flex-shrink: 0;
  min-width: 80px;
}
.result-title {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
