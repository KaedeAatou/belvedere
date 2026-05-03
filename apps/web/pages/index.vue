<script setup lang="ts">
import type { ScreenId, Status } from '~/composables/useDemoData';

const { tickets, moveTicket } = useDemoData();
const screen = ref<ScreenId>('backlog');
const aiOpen = ref(true);
const railTab = ref<'backlog' | 'events'>('backlog');
const selected = ref<string | null>(null);

watch(screen, (s) => {
  if (s === 'backlog') railTab.value = 'backlog';
});

function onSelect(id: string) { selected.value = id; }
function onClose() { selected.value = null; }
function onMove(id: string, status: Status) { moveTicket(id, status); }
function onJump(id: string) { selected.value = id; }

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
