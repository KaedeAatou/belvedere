<script setup lang="ts">
import type { Status } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';

// 実 API データ源 (R3: demo data 廃止)。useState 共有なので各画面は composable から直接読む。
const { tickets, fetchTickets, changeStatus } = useTickets();
const { fetchMembers } = useMembers();
const { fetchSprints } = useSprints();
const { fetchFindings } = useFindings();

const screen = ref<ScreenId>('backlog');
const aiOpen = ref(true);
const railTab = ref<'backlog' | 'events'>('backlog');
const selected = ref<string | null>(null);
// Refinement の「ポーカー開始」→ DetailSheet を開き、見積もりパネル (T7) が auto-start する合図
const pokerAutostart = useState<string | null>('poker-autostart', () => null);

onMounted(() => {
  fetchTickets();
  fetchMembers();
  fetchSprints();
  fetchFindings('refinement'); // 全画面共通: チケット品質の指摘 (T5-3 ピル / T9 ワークキュー)
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
                    :tickets="tickets"
                    @select="onSelect" />
      <RetroScreen v-else-if="screen === 'retro'" />

      <DetailSheet v-if="ticket" :ticket="ticket" @close="onClose" />
    </div>

    <template #ai>
      <AIPanel :screen="screen" :tickets="tickets" @jump="onJump" />
    </template>
  </Shell>
</template>
