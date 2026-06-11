<script setup lang="ts">
import type { Ticket, Status } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  move: [id: string, status: Status];
}>();

const { activeSprint } = useSprints();
const { findingsFor } = useFindings();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);

// BLOCKED 列は廃止 (shared Status に無い)。4 列に。
const cols: Status[] = ['todo', 'in-progress', 'review', 'done'];
const COL_LABEL: Record<Status, string> = {
  backlog: 'BACKLOG',
  todo: 'TODO',
  'in-progress': 'DOING',
  review: 'REVIEW',
  done: 'DONE',
};

function colItems(col: Status) {
  return sprintTickets.value.filter((t) => t.status === col);
}

const doneSP = computed(() => colItems('done').reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const remaining = computed(() => Math.max(0, totalSP.value - doneSP.value));
const inProgressCount = computed(() => colItems('in-progress').length);
const blockedCount = computed(() => sprintTickets.value.filter((t) => (t.labels ?? []).includes('blocked')).length);

const sprintDays = computed(() => {
  if (!activeSprint.value) return { elapsed: 0, total: 14 };
  const start = Date.parse(activeSprint.value.startsAt);
  const end = Date.parse(activeSprint.value.endsAt);
  const total = Math.max(1, Math.round((end - start) / 86_400_000));
  const elapsed = Math.min(total, Math.max(0, Math.round((Date.now() - start) / 86_400_000)));
  return { elapsed, total };
});

function ageInDays(started?: string): number {
  if (!started) return 0;
  return Math.max(1, Math.round((Date.now() - Date.parse(started)) / 86_400_000));
}

const drag = ref<string | null>(null);
const over = ref<string | null>(null);

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

// Burndown: コミット済 SP (totalSP) を起点に 0 へ落とす理想線。velocity 駆動の SP ベース。
const W = 320, H = 200, P = 8;
const max = computed(() => Math.max(1, totalSP.value));
const total = computed(() => sprintDays.value.total);
const ideal = computed(() => Array.from({ length: total.value + 1 }, (_, i) => max.value - (max.value / total.value) * i));
const xCoord = (i: number) => P + (i / total.value) * (W - P * 2);
const yCoord = (v: number) => P + (1 - v / max.value) * (H - P * 2);
const idealPath = computed(() => ideal.value.map((v, i) => `${i === 0 ? 'M' : 'L'}${xCoord(i)},${yCoord(v)}`).join(' '));
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 02 / DAILY</div>
      <h1>Daily Scrum — Day {{ String(sprintDays.elapsed).padStart(2, '0') }}</h1>
      <div class="subtitle">
        昨日の前進、今日のコミット、ブロッカーを 15 分で。AIは
        <span style="color: var(--accent)">滞留</span>と<span style="color: var(--accent)">ベロシティ乖離</span>を監視中。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Day</div><div class="v t-num">{{ String(sprintDays.elapsed).padStart(2, '0') }}<span style="color: var(--ink-3); font-size: 14px">/{{ sprintDays.total }}</span></div></div>
      <div class="stat"><div class="label">Remain</div><div class="v t-num">{{ remaining }}</div><div class="delta">SP</div></div>
      <div class="stat"><div class="label">Done</div><div class="v t-num accent">{{ doneSP }}</div><div class="delta">SP</div></div>
      <div class="stat"><div class="label">In progress</div><div class="v t-num">{{ inProgressCount }}</div><div class="delta">tickets</div></div>
    </div>
  </div>

  <div class="daily">
    <div class="daily-strip">
      <div class="cell">
        <div class="l">COMMITTED</div>
        <div class="v t-num">{{ totalSP }}<span class="u">SP</span></div>
        <div class="sub">sprint commitment</div>
      </div>
      <div class="cell">
        <div class="l">IN PROGRESS</div>
        <div class="v t-num">{{ inProgressCount }}</div>
        <div class="sub">tickets active</div>
      </div>
      <div class="cell">
        <div class="l">BLOCKED</div>
        <div class="v t-num">{{ blockedCount }}</div>
        <div class="sub">labelled blocked</div>
      </div>
      <div class="cell">
        <div class="l">REMAINING</div>
        <div class="v t-num">{{ remaining }}<span class="u">SP</span></div>
        <div class="sub">to done</div>
      </div>
    </div>

    <div class="daily-body">
      <div class="daily-board">
        <div v-for="col in cols" :key="col" class="col-board">
          <div class="ch">
            <span class="name">{{ COL_LABEL[col] }}</span>
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
                     findingsFor(t.id).length > 0 && 'flagged',
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
                  <StoryPoints :value="t.estimatePt ?? null" :critical="t.estimatePt == null" />
                  <FindingPill v-for="f in findingsFor(t.id).slice(0, 2)" :key="f.ruleId" :finding="f" />
                  <span class="spacer" />
                  <span v-if="col === 'in-progress' && t.startedAt"
                        :class="['age', ageInDays(t.startedAt) > 2 && 'warn']">
                    <Icon name="clock" /> {{ ageInDays(t.startedAt) }}d
                  </span>
                  <Avatar :user="t.assigneeId" />
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
          <span><i style="background: var(--accent)" />Done</span>
        </div>
        <div class="burn-chart">
          <svg :viewBox="`0 0 ${W} ${H}`" style="position: absolute; inset: 0; width: 100%; height: 100%">
            <line v-for="g in [0, max / 4, max / 2, (max * 3) / 4, max]" :key="g" :x1="P" :y1="yCoord(g)" :x2="W - P" :y2="yCoord(g)" stroke="var(--line-1)" />
            <path :d="idealPath" stroke="var(--ink-3)" stroke-width="1" fill="none" stroke-dasharray="3 4" />
          </svg>
        </div>
        <div class="axis-x">
          <span v-for="i in [0, 2, 4, 6, 8, 10, 12, 14]" :key="i">D{{ String(i).padStart(2, '0') }}</span>
        </div>

        <div class="burn-stat-row">
          <div class="burn-stat">
            <div class="l">Done</div>
            <div class="v t-num">{{ doneSP }}<span style="font-size: 13px; color: var(--ink-3)">SP</span></div>
          </div>
          <div class="burn-stat">
            <div class="l">Remaining</div>
            <div class="v t-num">{{ remaining }}<span style="font-size: 13px; color: var(--ink-3)">SP</span></div>
          </div>
          <div class="burn-stat">
            <div class="l">Committed</div>
            <div class="v t-num">{{ totalSP }}<span style="font-size: 13px; color: var(--ink-3)">SP</span></div>
          </div>
        </div>

        <div style="margin-top: 24px; padding: 14px; border: 1px solid var(--accent-dim); background: var(--accent-bg)">
          <div class="t-cap" style="color: var(--accent); margin-bottom: 6px">AI INSIGHT</div>
          <div style="font-size: 12px; line-height: 1.55">
            in-progress に長く留まるチケットは分割を、ブロック中のものは理由の記録を推奨します。
            残り {{ remaining }}SP を計画的に消化しましょう。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
