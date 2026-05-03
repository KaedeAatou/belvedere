<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';

const props = defineProps<{
  tickets: DemoTicket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const sprintTickets = computed(() => props.tickets.filter((t) => t.sprint === 'S24'));
const backlogTickets = computed(() => props.tickets.filter((t) => !t.sprint));
const issueCount = computed(() => props.tickets.reduce((n, t) => n + (t.flags?.length ?? 0), 0));
const noSP = computed(() => props.tickets.filter((t) => t.flags.includes('no-points')).length);
const noAcc = computed(() => props.tickets.filter((t) => t.flags.includes('no-acceptance')).length);
const totalSP = computed(() => props.tickets.reduce((n, t) => n + (t.sp ?? 0), 0));

const sprintStats = computed(() => ({
  count: sprintTickets.value.length,
  sp: sprintTickets.value.reduce((n, t) => n + (t.sp ?? 0), 0),
  flagged: sprintTickets.value.filter((t) => t.flags.length).length,
}));
const backlogStats = computed(() => ({
  count: backlogTickets.value.length,
  sp: backlogTickets.value.reduce((n, t) => n + (t.sp ?? 0), 0),
  flagged: backlogTickets.value.filter((t) => t.flags.length).length,
}));
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 00 / BACKLOG</div>
      <h1>Backlog</h1>
      <div class="subtitle">
        プロダクト全体の在庫。AIが <span style="color: var(--accent)">{{ issueCount }}件</span> の形骸化リスクを検出しています。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Total</div><div class="v t-num">{{ tickets.length }}</div><div class="delta">issues</div></div>
      <div class="stat"><div class="label">No SP</div><div class="v t-num accent">{{ noSP }}</div><div class="delta">unestimated</div></div>
      <div class="stat"><div class="label">No AC</div><div class="v t-num accent">{{ noAcc }}</div><div class="delta">unverifiable</div></div>
      <div class="stat"><div class="label">Σ Points</div><div class="v t-num">{{ totalSP }}</div><div class="delta">SP</div></div>
    </div>
  </div>

  <div class="backlog-toolbar">
    <button class="h-btn"><Icon name="filter" /> Filter</button>
    <button class="h-btn"><Icon name="sort" /> Group: Sprint</button>
    <button class="h-btn"><Icon name="sparkle" /> AI: Show only flagged</button>
    <span class="spacer" />
    <button class="h-btn"><Icon name="plus" /> New issue <span class="kbd">C</span></button>
  </div>

  <div class="screen-body">
    <div class="backlog-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Sprint 24 — Spiral</span>
        <span class="chip amber solid">CURRENT</span>
        <span class="t-cap">Apr 21 → May 04</span>
        <div class="meta">
          <span><b>{{ sprintStats.count }}</b> issues</span>
          <span><b>{{ sprintStats.sp }}</b> SP</span>
          <span><b>{{ sprintStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in sprintTickets" :key="t.id" :t="t"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)">
        <template #extra>
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
    </div>

    <div class="backlog-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Backlog</span>
        <span class="chip">UNSCHEDULED</span>
        <div class="meta">
          <span><b>{{ backlogStats.count }}</b> issues</span>
          <span><b>{{ backlogStats.sp }}</b> SP</span>
          <span><b>{{ backlogStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in backlogTickets" :key="t.id" :t="t"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)" />
    </div>
  </div>
</template>
