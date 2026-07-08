<script setup lang="ts">
import type { Ticket, Status } from '@belvedere/shared';
import { VueDraggable } from 'vue-draggable-plus';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  move: [id: string, status: Status];
}>();

const { activeSprint, velocityHistory } = useSprints();
const { findingsFor } = useFindings();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);

// Daily は current sprint の作業ボード。列は todo/in-progress/review/done の 4 列。
// backlog 状態は「スプリント未所属」を意味し current には存在しない不変条件 (API が保証 / WC-676a53e1)
// ため backlog 列は持たない。Daily の表示集合 = current sprint の全チケット = Planning CURRENT に一致する。
const cols: Status[] = ['todo', 'in-progress', 'review', 'done'];
const COL_LABEL: Record<Status, string> = {
  backlog: 'BACKLOG',
  todo: 'TODO',
  'in-progress': 'DOING',
  review: 'REVIEW',
  done: 'DONE',
};

// VueDraggable は v-model に可変配列を要求するため、各列を status フィルタからローカルにミラーする。
// SortableJS が DOM を動かす → onDragEnd で move emit → tickets 更新 → sprintTickets 変化 →
// watch で再同期、のループ (SprintSectionedList と同方式)。列内の並び順は Daily では永続しない。
const colLists = reactive<Record<Status, Ticket[]>>({
  backlog: [], todo: [], 'in-progress': [], review: [], done: [],
});
function syncCols(): void {
  for (const col of cols) {
    colLists[col] = sprintTickets.value.filter((t) => t.status === col);
  }
}
syncCols();
watch(sprintTickets, syncCols);

const doneSP = computed(() =>
  sprintTickets.value.filter((t) => t.status === 'done').reduce((n, t) => n + (t.estimatePt ?? 0), 0),
);
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const remaining = computed(() => Math.max(0, totalSP.value - doneSP.value));

// 過去スプリントの velocity 実績 (バーンダウンの目標ペース)。
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  if (vs.length === 0) return 0;
  return Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});

const sprintDays = computed(() => {
  if (!activeSprint.value) return { elapsed: 0, total: 14 };
  const start = Date.parse(activeSprint.value.startsAt);
  const end = Date.parse(activeSprint.value.endsAt);
  const total = Math.max(1, Math.round((end - start) / 86_400_000));
  const elapsed = Math.min(total, Math.max(0, Math.round((Date.now() - start) / 86_400_000)));
  return { elapsed, total };
});

// 経過日数は共通純粋関数 (utils/ticketAge / F-23)。旧実装の Math.max(1,…) は着手数分後でも
// 「1d」と表示していた。満日数 (floor) + 1 日未満は <1d 表示に統一。
const ageDays = (started?: string): number => ticketAgeDays(started, Date.now());
const ageLabel = (started?: string): string => ticketAgeLabel(started, Date.now());

// d&d は vue-draggable-plus (SortableJS)。4 列を同一 group にし、列間ドラッグで status を変更する。
// 確定は SortableJS の end (= drop 成否に関わらず必ず発火) で行う。旧 native DnD は drop でしか
// emit せず、実ブラウザが drop を取りこぼすと移動が無かったことになる footgun を踏んでいた。
const DAILY_GROUP = 'daily-board';

async function onDragEnd(evt: { item: HTMLElement; from: HTMLElement; to: HTMLElement }): Promise<void> {
  const id = evt.item?.getAttribute?.('data-ticket-id') ?? null;
  const fromStatus = (evt.from?.getAttribute?.('data-status') ?? null) as Status | null;
  const toStatus = (evt.to?.getAttribute?.('data-status') ?? null) as Status | null;
  // 列内の並べ替え (from===to) は Daily では永続しないため正準順に戻す。列が変わった時だけ status 変更。
  if (!id || !toStatus || fromStatus === toStatus) { syncCols(); return; }
  emit('move', id, toStatus);
}

// ===== Burndown: 各チケットの SP 積み上げ (totalSP) を残量として、目標 velocity のペースと比較 =====
// 横長レイアウト (ボードの下段)。縦軸 = 残 SP / 横軸 = スプリント経過日。
const W = 720, H = 150, PX = 20, PY = 16;
const totalDays = computed(() => sprintDays.value.total);
const elapsedDays = computed(() => sprintDays.value.elapsed);
// 計画 SP と目標 velocity の大きい方を上端に (過剰計画なら計画線が velocity 線の上に出る)。
const yMax = computed(() => Math.max(totalSP.value, avgVelocity.value, 1));
const targetTop = computed(() => (avgVelocity.value > 0 ? avgVelocity.value : totalSP.value));
const xCoord = (d: number) => PX + (d / totalDays.value) * (W - PX * 2);
const yCoord = (v: number) => PY + (1 - v / yMax.value) * (H - PY * 2);
// 目標 velocity 線: velocity を起点にスプリント終了で 0 へ落とす理想ペース。
const targetPath = computed(() => `M${xCoord(0)},${yCoord(targetTop.value)} L${xCoord(totalDays.value)},${yCoord(0)}`);
// 実績線: 計画 SP (D0) → 現在の残 SP (今日)。
const actualPath = computed(() => `M${xCoord(0)},${yCoord(totalSP.value)} L${xCoord(elapsedDays.value)},${yCoord(remaining.value)}`);
const gridY = computed(() => [0, yMax.value / 2, yMax.value]);
const dayTicks = computed(() => {
  const step = Math.max(2, Math.round(totalDays.value / 7));
  const out: number[] = [];
  for (let d = 0; d <= totalDays.value; d += step) out.push(d);
  if (out[out.length - 1] !== totalDays.value) out.push(totalDays.value);
  return out;
});
</script>

<template>
  <div class="daily">
    <div class="daily-board">
      <div v-for="col in cols" :key="col" class="col-board">
        <div class="ch">
          <span class="name">{{ COL_LABEL[col] }}</span>
          <span class="count">{{ colLists[col].length }}</span>
        </div>
        <VueDraggable v-model="colLists[col]" :group="DAILY_GROUP" handle=".daily-grab"
                      :animation="150" :force-fallback="true" :data-status="col"
                      :data-testid="`daily-col-${col}`" class="col-body" @end="onDragEnd">
          <div v-for="t in colLists[col]" :key="t.id"
               :class="['tcard', findingsFor(t.id).length > 0 && 'flagged']"
               :data-testid="`daily-card-${t.id}`"
               :data-ticket-id="t.id"
               @click="emit('select', t.id)">
            <div style="display: flex; align-items: center; gap: 6px">
              <span class="daily-grab" style="touch-action: none; user-select: none" draggable="false" @click.stop><Icon name="drag" /></span>
              <span class="id">{{ t.id }}</span>
              <span style="flex: 1" />
              <TypeMark :type="t.type" />
            </div>
            <div class="title">{{ t.title }}</div>
            <div class="row">
              <StoryPoints :value="t.estimatePt ?? null" :critical="t.estimatePt == null" />
              <FindingPill v-for="f in findingsFor(t.id).slice(0, 2)" :key="f.ruleId" :finding="f" />
              <span class="spacer" />
              <span v-if="col === 'in-progress' && t.startedAt"
                    :class="['age', ageDays(t.startedAt) > 2 && 'warn']">
                <Icon name="clock" /> {{ ageLabel(t.startedAt) }}
              </span>
              <Avatar :user="t.assigneeId" />
            </div>
          </div>
        </VueDraggable>
        <div v-if="colLists[col].length === 0" class="col-empty-hint">チケットなし</div>
      </div>
    </div>

    <!-- Burndown: ボード下段に横長で配置 (横並びだとボードが狭くなるため上下分割) -->
    <div class="daily-burn">
      <div class="burn-chart-wrap">
        <div class="burn-head">
          <h3>Burndown</h3>
          <div class="legend">
            <span><i class="actual" />実績 (残 {{ remaining }}SP)</span>
            <span><i class="target" />目標 velocity {{ avgVelocity > 0 ? avgVelocity : '—' }}</span>
          </div>
        </div>
        <svg :viewBox="`0 0 ${W} ${H}`" class="burn-svg" preserveAspectRatio="none">
          <line v-for="g in gridY" :key="g" :x1="PX" :y1="yCoord(g)" :x2="W - PX" :y2="yCoord(g)" stroke="var(--line-1)" />
          <path :d="targetPath" stroke="var(--ink-3)" stroke-width="1.5" fill="none" stroke-dasharray="4 5" />
          <path :d="actualPath" stroke="var(--accent)" stroke-width="2" fill="none" />
          <circle :cx="xCoord(elapsedDays)" :cy="yCoord(remaining)" r="3.5" fill="var(--accent)" />
        </svg>
        <div class="burn-axis">
          <span v-for="d in dayTicks" :key="d">D{{ String(d).padStart(2, '0') }}</span>
        </div>
      </div>

      <div class="burn-insight">
        <div class="t-cap" style="color: var(--accent); margin-bottom: 6px">AI INSIGHT</div>
        <div style="font-size: 12px; line-height: 1.55; color: var(--ink-1)">
          残り <b style="color: var(--ink-0)">{{ remaining }}SP</b>。目標 velocity は
          <b style="color: var(--ink-0)">{{ avgVelocity > 0 ? `${avgVelocity}SP` : '実績なし' }}</b> です。
          in-progress に長く留まるチケットは分割を、停滞は理由の記録を推奨します。
        </div>
      </div>
    </div>
  </div>
</template>
