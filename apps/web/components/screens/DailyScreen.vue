<script setup lang="ts">
import type { DemoTicket, Status } from '~/composables/useDemoData';

const props = defineProps<{
  tickets: DemoTicket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  move: [id: string, status: Status];
}>();

const sprintTickets = computed(() => props.tickets.filter((t) => t.sprint === 'S24'));
const cols: Status[] = ['TODO', 'DOING', 'REVIEW', 'DONE'];
const totalDays = 14;
const remaining = 11;
const today = computed(() => sprintTickets.value.filter((t) => t.lastUpdate === '2026-04-30').length);

const drag = ref<string | null>(null);
const over = ref<string | null>(null);

function ageInDays(started: string | null | undefined) {
  if (!started) return 0;
  const now = new Date('2026-04-30');
  const s = new Date(started);
  return Math.max(1, Math.round((now.getTime() - s.getTime()) / 86400000));
}

const ideal = Array.from({ length: totalDays + 1 }, (_, i) => 32 - (32 / totalDays) * i);
const actual = [32, 32, 30, 28, 26, 24, 22, 20, 21];

// Burndown SVG paths
const W = 320, H = 200, P = 8, max = 32;
const xCoord = (i: number) => P + (i / totalDays) * (W - P * 2);
const yCoord = (v: number) => P + (1 - v / max) * (H - P * 2);
const idealPath = ideal.map((v, i) => `${i === 0 ? 'M' : 'L'}${xCoord(i)},${yCoord(v)}`).join(' ');
const actualPath = actual.map((v, i) => `${i === 0 ? 'M' : 'L'}${xCoord(i)},${yCoord(v)}`).join(' ');
const actualArea = actualPath + ` L${xCoord(actual.length - 1)},${yCoord(0)} L${xCoord(0)},${yCoord(0)} Z`;

function colItems(col: Status) {
  return sprintTickets.value.filter((t) => t.status === col);
}

function onDragStart(id: string) { drag.value = id; }
function onDragEnd() { drag.value = null; over.value = null; }
function onDragOver(e: DragEvent, col: Status) { e.preventDefault(); over.value = col; }
function onDragLeave(col: Status) { if (over.value === col) over.value = null; }
function onDrop(e: DragEvent, col: Status) {
  e.preventDefault();
  if (drag.value) emit('move', drag.value, col);
  over.value = null;
  drag.value = null;
}
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 02 / DAILY</div>
      <h1>Daily Scrum — Day 08</h1>
      <div class="subtitle">
        昨日の前進、今日のコミット、ブロッカーを 15 分で。AIは
        <span style="color: var(--accent)">滞留</span>と<span style="color: var(--accent)">ベロシティ乖離</span>を監視中。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Day</div><div class="v t-num">08<span style="color: var(--ink-3); font-size: 14px">/{{ totalDays }}</span></div></div>
      <div class="stat"><div class="label">Remain</div><div class="v t-num">{{ remaining }}</div><div class="delta">SP</div></div>
      <div class="stat"><div class="label">Pace</div><div class="v t-num accent">−2</div><div class="delta">SP vs ideal</div></div>
      <div class="stat"><div class="label">Updates</div><div class="v t-num">{{ today }}</div><div class="delta">today</div></div>
    </div>
  </div>

  <div class="daily">
    <div class="daily-strip">
      <div class="cell">
        <div class="l">YESTERDAY</div>
        <div class="v t-num">5<span class="u">SP</span></div>
        <div class="sub">3 tickets advanced</div>
      </div>
      <div class="cell">
        <div class="l">IN PROGRESS</div>
        <div class="v t-num">{{ sprintTickets.filter((t) => t.status === 'DOING').length }}</div>
        <div class="sub" style="color: var(--accent)">2 long-doing</div>
      </div>
      <div class="cell">
        <div class="l">BLOCKED</div>
        <div class="v t-num">{{ sprintTickets.filter((t) => t.status === 'BLOCKED').length }}</div>
        <div class="sub" style="color: var(--accent)">1 silent</div>
      </div>
      <div class="cell">
        <div class="l">CYCLE TIME (avg)</div>
        <div class="v t-num">2.6<span class="u">d</span></div>
        <div class="sub">target ≤ 2.0d</div>
      </div>
    </div>

    <div class="daily-body">
      <div class="daily-board">
        <div v-for="col in cols" :key="col" class="col-board">
          <div class="ch">
            <span class="name">{{ col }}</span>
            <span class="count">{{ colItems(col).length }}</span>
          </div>
          <div class="col-body"
               :style="over === col ? { background: 'var(--bg-2)' } : {}"
               @dragover="(e) => onDragOver(e, col)"
               @dragleave="onDragLeave(col)"
               @drop="(e) => onDrop(e, col)">
            <template v-for="t in colItems(col)" :key="t.id">
              <div :class="[
                     'tcard',
                     (t.flags ?? []).length > 0 && 'flagged',
                     drag === t.id && 'dragging',
                   ]"
                   draggable="true"
                   @dragstart="onDragStart(t.id)"
                   @dragend="onDragEnd"
                   @click="emit('select', t.id)">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span class="id">{{ t.id }}</span>
                  <TypeMark :type="t.type" />
                </div>
                <div class="title">{{ t.title }}</div>
                <div class="row">
                  <StoryPoints :value="t.sp" :critical="t.sp == null" />
                  <FlagPill v-for="f in (t.flags ?? []).slice(0, 2)" :key="f" :flag="f" mini />
                  <span class="spacer" />
                  <span v-if="col === 'DOING'"
                        :class="['age', ageInDays(t.started) > 2 && 'warn']">
                    <Icon name="clock" /> {{ ageInDays(t.started) }}d
                  </span>
                  <Avatar :user="t.assignee" />
                </div>
              </div>
            </template>
            <div v-if="colItems(col).length === 0"
                 style="padding: 24px 0; text-align: center; font-family: var(--mono); font-size: 10px; color: var(--ink-4); letter-spacing: 0.16em; text-transform: uppercase">
              empty
            </div>
          </div>
        </div>
      </div>

      <div class="burn">
        <h3>Burndown</h3>
        <div class="legend">
          <span><i style="background: var(--ink-3); border-top: 1px dashed var(--ink-3)" />Ideal</span>
          <span><i style="background: var(--accent)" />Actual</span>
        </div>
        <div class="burn-chart">
          <svg :viewBox="`0 0 ${W} ${H}`" style="position: absolute; inset: 0; width: 100%; height: 100%">
            <line v-for="g in [0, 8, 16, 24, 32]" :key="g" :x1="P" :y1="yCoord(g)" :x2="W - P" :y2="yCoord(g)" stroke="var(--line-1)" />
            <text v-for="g in [0, 16, 32]" :key="`t${g}`" :x="W - P + 2" :y="yCoord(g) + 3" font-size="9" fill="var(--ink-3)" font-family="var(--mono)">{{ g }}</text>
            <path :d="idealPath" stroke="var(--ink-3)" stroke-width="1" fill="none" stroke-dasharray="3 4" />
            <path :d="actualArea" fill="rgba(245,194,66,0.08)" />
            <path :d="actualPath" stroke="var(--accent)" stroke-width="1.5" fill="none" />
            <circle :cx="xCoord(actual.length - 1)" :cy="yCoord(actual[actual.length - 1] ?? 0)" r="3" fill="var(--accent)" />
            <circle :cx="xCoord(actual.length - 1)" :cy="yCoord(actual[actual.length - 1] ?? 0)" r="6" fill="none" stroke="var(--accent)" opacity="0.4" />
            <line :x1="xCoord(actual.length - 1)" :y1="P" :x2="xCoord(actual.length - 1)" :y2="H - P" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2 3" opacity="0.4" />
            <text :x="xCoord(actual.length - 1) + 4" :y="P + 10" font-size="9" fill="var(--accent)" font-family="var(--mono)">DAY 8</text>
          </svg>
        </div>
        <div class="axis-x">
          <span v-for="i in [0, 2, 4, 6, 8, 10, 12, 14]" :key="i">D{{ String(i).padStart(2, '0') }}</span>
        </div>

        <div class="burn-stat-row">
          <div class="burn-stat">
            <div class="l">Done</div>
            <div class="v t-num">{{ 32 - remaining }}<span style="font-size: 13px; color: var(--ink-3)">SP</span></div>
          </div>
          <div class="burn-stat">
            <div class="l">Today's pace</div>
            <div class="v t-num">2.6<span style="font-size: 13px; color: var(--ink-3)">SP/d</span></div>
          </div>
          <div class="burn-stat">
            <div class="l">Forecast</div>
            <div class="v t-num" style="color: var(--accent)">+1d</div>
          </div>
        </div>

        <div style="margin-top: 24px; padding: 14px; border: 1px solid var(--accent-dim); background: var(--accent-bg)">
          <div class="t-cap" style="color: var(--accent); margin-bottom: 6px">AI INSIGHT</div>
          <div style="font-size: 12px; line-height: 1.55">
            理想ラインから −2SP の遅れ。BLV-207（10日DOING）を分割し、
            BLV-202 を Day 9 までに REVIEW に進められれば回復可能です。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
