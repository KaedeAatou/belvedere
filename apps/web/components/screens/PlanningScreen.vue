<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint, velocityHistory } = useSprints();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
// 相対見積もり (SP) の積み上げを過去スプリントの velocity 実績と比較する。
// 時間稼働ベースの capacity は使わない (SP ベースの velocity 駆動プランニング)。
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  if (vs.length === 0) return 0;
  return Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});
const hasVelocity = computed(() => avgVelocity.value > 0);
const overBy = computed(() => totalSP.value - avgVelocity.value);
const goal = computed(() => activeSprint.value?.goal ?? 'スプリントゴールが設定されていません');

// 1 セグメント = 1 SP。velocity を超えた分が over (accent) になる。
const barTotal = computed(() => Math.max(totalSP.value, avgVelocity.value, 1));

// SMART は構造ガイド (汎用)。実評価は AI 連携で別途。
const smart = [
  { letter: 'S', name: 'Specific', ok: true, note: 'ゴールが具体的か' },
  { letter: 'M', name: 'Measurable', ok: false, note: '測定可能な指標があるか' },
  { letter: 'A', name: 'Attainable', ok: true, note: 'velocity 内に収まるか' },
  { letter: 'R', name: 'Relevant', ok: true, note: 'ロードマップに整合するか' },
  { letter: 'T', name: 'Time-bound', ok: true, note: '期限が明確か' },
];
</script>

<template>
  <div class="planning">
    <div class="goal-block">
      <div class="t-cap" style="margin-bottom: 8px">SPRINT GOAL</div>
      <div class="goal-text">{{ goal }}</div>
      <div class="smart-row">
        <div v-for="s in smart" :key="s.letter" :class="['smart-cell', s.ok ? 'ok' : 'weak']">
          <div class="letter">{{ s.letter }}</div>
          <div class="name">{{ s.name }}</div>
          <div class="check" :style="{ color: s.ok ? 'var(--ok)' : 'var(--accent)' }">
            {{ s.ok ? '✓' : '△' }}
          </div>
        </div>
      </div>

      <!-- PLANNED / VELOCITY — SMART の下にコンパクト表示 (チケット幅を確保するため右カラムは廃止) -->
      <div class="vel-inline">
        <span class="t-cap">PLANNED / VELOCITY</span>
        <span class="nums">
          <span style="color: var(--accent)">{{ totalSP }}</span>
          <span class="div">/</span>
          <span class="total">{{ hasVelocity ? avgVelocity : '—' }}</span>
        </span>
        <span class="delta" :style="{ color: !hasVelocity ? 'var(--ink-3)' : overBy > 0 ? 'var(--accent)' : 'var(--ok)' }">
          {{ hasVelocity ? (overBy > 0 ? `+${overBy} SP OVER` : `${-overBy} SP ROOM`) : '実績なし' }}
        </span>
        <span class="bar">
          <i v-for="i in barTotal" :key="i" :class="hasVelocity && i > avgVelocity ? 'over' : ''" />
        </span>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 14px; font-size: 11.5px; color: var(--ink-2)">
        <Icon name="sparkle" />
        <span>AI: ゴールに <b style="color: var(--ink-0)">測定可能な指標</b>を加えると、レビュー時の判定が明確になります。</span>
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
      <p v-if="sprintTickets.length === 0" style="padding: 16px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
        アクティブスプリントにチケットがありません。
      </p>
    </div>
  </div>
</template>
