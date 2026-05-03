<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';
import { TEAM, SPRINT } from '~/composables/useDemoData';

const props = defineProps<{
  tickets: DemoTicket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const sprintTickets = computed(() => props.tickets.filter((t) => t.sprint === 'S24'));
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.sp ?? 0), 0));
const capacity = SPRINT.capacity;

const smart = [
  { letter: 'S', name: 'Specific',   ok: true,  note: '螺旋ナビゲーション初版' },
  { letter: 'M', name: 'Measurable', ok: false, note: '出荷の定義が曖昧' },
  { letter: 'A', name: 'Attainable', ok: true,  note: '容量内に収まる' },
  { letter: 'R', name: 'Relevant',   ok: true,  note: 'ロードマップQ2に整合' },
  { letter: 'T', name: 'Time-bound', ok: true,  note: '5/4まで' },
];

const memberLoad = computed(() =>
  TEAM.map((m) => {
    const items = sprintTickets.value.filter((t) => t.assignee === m.id);
    return {
      ...m,
      sp: items.reduce((n, t) => n + (t.sp ?? 0), 0),
      max: 7,
      count: items.length,
    };
  }),
);
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 01 / PLANNING</div>
      <h1>Sprint 24 — Planning</h1>
      <div class="subtitle">
        ゴールの具体性、容量、リスクを点検します。AIが <span style="color: var(--accent)">3件</span> の修正提案を出しています。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Days</div><div class="v t-num">14</div><div class="delta">Apr 21–May 04</div></div>
      <div class="stat"><div class="label">Capacity</div><div class="v t-num">{{ capacity }}</div><div class="delta">SP</div></div>
      <div class="stat"><div class="label">Planned</div><div class="v t-num accent">{{ totalSP }}</div><div class="delta">+1 over</div></div>
      <div class="stat"><div class="label">Items</div><div class="v t-num">{{ sprintTickets.length }}</div><div class="delta">tickets</div></div>
    </div>
  </div>

  <div class="planning">
    <!-- LEFT — goal + items -->
    <div class="col">
      <div class="goal-block">
        <div class="t-cap" style="margin-bottom: 8px">SPRINT GOAL</div>
        <div class="goal-text">{{ SPRINT.goal }}</div>
        <div class="smart-row">
          <div v-for="s in smart" :key="s.letter" :class="['smart-cell', s.ok ? 'ok' : 'weak']">
            <div class="letter">{{ s.letter }}</div>
            <div class="name">{{ s.name }}</div>
            <div class="check" :style="{ color: s.ok ? 'var(--ok)' : 'var(--accent)' }">
              {{ s.ok ? '✓' : '△' }}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 14px; font-size: 11.5px; color: var(--ink-2)">
          <Icon name="sparkle" />
          <span>AI: <b style="color: var(--ink-0)">M（測定可能）</b>が弱い。「初版を出荷」→「Web/Mobile 2画面で公開、利用率 30% 達成」を提案。</span>
        </div>
      </div>

      <div class="col-head" style="border-top: none">
        <h2>Sprint items</h2>
        <span class="t-cap">{{ sprintTickets.length }} planned</span>
        <span style="margin-left: auto" />
        <button class="h-btn"><Icon name="plus" /> Pull from backlog</button>
      </div>
      <div class="col-body">
        <TicketRow v-for="t in sprintTickets" :key="t.id" :t="t"
                   :selected="selectedId === t.id" drag-handle
                   @click="emit('select', t.id)" />
      </div>
    </div>

    <!-- RIGHT — capacity + members -->
    <div class="col">
      <div class="capacity">
        <div class="capacity-head">
          <div class="t-cap">CAPACITY</div>
          <div style="font-family: var(--mono); font-size: 11px; color: var(--accent)">
            +1 SP OVER
          </div>
        </div>
        <div class="capacity-num">
          <span style="color: var(--accent)">{{ totalSP }}</span>
          <span class="div">/</span>
          <span class="total">{{ capacity }}</span>
        </div>
        <div class="capacity-bar" style="margin-top: 14px">
          <i v-for="i in 33" :key="i" :class="i - 1 < capacity ? '' : 'over'" />
        </div>
        <div class="capacity-legend">
          <span class="it"><i style="background: var(--ink-2)" />Planned</span>
          <span class="it"><i style="background: var(--accent)" />Over capacity</span>
          <span class="it"><i style="background: var(--bg-3)" />Available</span>
        </div>
      </div>

      <div class="col-head" style="border-top: none">
        <h2>Per-member load</h2>
        <span class="t-cap">6 members</span>
      </div>
      <div class="member-rows">
        <div v-for="m in memberLoad" :key="m.id" class="member-row">
          <Avatar :user="m.id" />
          <span>{{ m.name }}</span>
          <div class="meter">
            <i :class="m.sp > m.max ? 'amber' : ''" :style="{ width: `${Math.min(100, (m.sp / m.max) * 100)}%` }" />
          </div>
          <span class="v"><span class="t-num">{{ m.sp }}</span><span class="max">/{{ m.max }}</span></span>
        </div>
      </div>

      <div class="col-head" style="border-top: var(--hairline) solid var(--line-1)">
        <h2>Velocity</h2>
        <span class="t-cap">last 6 sprints</span>
      </div>
      <div style="padding: 18px 18px 24px">
        <svg viewBox="0 0 360 120" style="width: 100%; height: 120px">
          <line x1="0" y1="80" x2="360" y2="80" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 4" />
          <text x="0" y="76" font-size="9" fill="var(--ink-3)" font-family="var(--mono)">avg 26.7</text>
          <g v-for="(v, i) in SPRINT.velocity" :key="i">
            <rect :x="i * 48 + 8" :y="110 - (v / 35) * 100" :width="40" :height="(v / 35) * 100"
                  :fill="i === 5 ? 'var(--accent)' : 'var(--ink-2)'" />
            <text :x="i * 48 + 28" y="118" font-size="9" fill="var(--ink-3)" text-anchor="middle" font-family="var(--mono)">S{{ 19 + i }}</text>
            <text :x="i * 48 + 28" :y="107 - (v / 35) * 100" font-size="10" fill="var(--ink-1)" text-anchor="middle" font-family="var(--mono)">{{ v }}</text>
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>
