<script setup lang="ts">
// events ホーム (WC-cba82df1)。events タブを押した時に「ぱっと見でスプリント状態」が分かる
// ダッシュボード。現スプリントの ステータス別件数 + バーンダウン + 停滞チケット を 1 画面に集約し、
// レールでさらに儀式へドリルダウンできる。表示集合は current sprint (Daily/Planning CURRENT と一致)。
import type { Ticket, Status } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';

const props = defineProps<{ tickets: Ticket[]; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string]; go: [screen: ScreenId] }>();

const { activeSprint, nextPlanned, velocityHistory, currentLabel } = useSprints();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);

// ステータス別件数 (current sprint)。
const cols: { key: Status; label: string }[] = [
  { key: 'todo', label: 'TODO' },
  { key: 'in-progress', label: 'DOING' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
];
const counts = computed<Record<Status, number>>(() => {
  const c = { backlog: 0, todo: 0, 'in-progress': 0, review: 0, done: 0 } as Record<Status, number>;
  for (const t of sprintTickets.value) c[t.status] += 1;
  return c;
});
const total = computed(() => sprintTickets.value.length);

// SP / バーンダウン。
const doneSP = computed(() =>
  sprintTickets.value.filter((t) => t.status === 'done').reduce((n, t) => n + (t.estimatePt ?? 0), 0),
);
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const remaining = computed(() => Math.max(0, totalSP.value - doneSP.value));
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  return vs.length === 0 ? 0 : Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});
const goal = computed(() => activeSprint.value?.goal?.trim() || 'スプリントゴール未設定');

const sprintDays = computed(() => {
  if (!activeSprint.value) return { elapsed: 0, total: 14 };
  const start = Date.parse(activeSprint.value.startsAt);
  const end = Date.parse(activeSprint.value.endsAt);
  const t = Math.max(1, Math.round((end - start) / 86_400_000));
  const e = Math.min(t, Math.max(0, Math.round((Date.now() - start) / 86_400_000)));
  return { elapsed: e, total: t };
});

// バーンダウン SVG (Daily と同方式の compact 版)。残 SP を目標 velocity ペースと比較。
const W = 480, H = 120, PX = 16, PY = 14;
const yMax = computed(() => Math.max(totalSP.value, avgVelocity.value, 1));
const td = computed(() => sprintDays.value.total);
const ed = computed(() => sprintDays.value.elapsed);
const xc = (d: number) => PX + (d / td.value) * (W - PX * 2);
const yc = (v: number) => PY + (1 - v / yMax.value) * (H - PY * 2);
const targetTop = computed(() => (avgVelocity.value > 0 ? avgVelocity.value : totalSP.value));
const targetPath = computed(() => `M${xc(0)},${yc(targetTop.value)} L${xc(td.value)},${yc(0)}`);
const actualPath = computed(() => `M${xc(0)},${yc(totalSP.value)} L${xc(ed.value)},${yc(remaining.value)}`);

// 停滞チケット (in-progress が 3 日以上動いていない / Daily の停滞シグナル流用)。
function ageInDays(started?: string): number {
  return started ? Math.max(0, Math.round((Date.now() - Date.parse(started)) / 86_400_000)) : 0;
}
const stalled = computed(() =>
  sprintTickets.value
    .filter((t) => t.status === 'in-progress' && ageInDays(t.startedAt) >= 3)
    .sort((a, b) => ageInDays(b.startedAt) - ageInDays(a.startedAt)),
);
</script>

<template>
  <div class="ehome" data-testid="events-home">
    <div class="ehome-head">
      <div>
        <div class="ehome-floor">EVENTS · HOME</div>
        <h1 class="ehome-title">{{ currentLabel || 'Current Sprint' }}</h1>
        <p class="ehome-goal">{{ goal }}</p>
      </div>
      <div v-if="!activeSprint" class="ehome-empty">アクティブなスプリントがありません。</div>
    </div>

    <!-- ステータス別件数 -->
    <div class="ehome-counts">
      <button v-for="c in cols" :key="c.key" class="count-card" :data-testid="`ehome-count-${c.key}`"
              @click="emit('go', 'daily')">
        <span class="count-n">{{ counts[c.key] }}</span>
        <span class="count-l">{{ c.label }}</span>
      </button>
      <div class="count-card count-total">
        <span class="count-n">{{ total }}</span>
        <span class="count-l">合計</span>
      </div>
    </div>

    <div class="ehome-grid">
      <!-- バーンダウン -->
      <section class="ehome-card">
        <div class="ehome-card-head">
          <h2>バーンダウン</h2>
          <span class="ehome-sp">残 <b>{{ remaining }}</b> / 計画 {{ totalSP }} SP · Day {{ ed }}/{{ td }}</span>
        </div>
        <svg :viewBox="`0 0 ${W} ${H}`" class="ehome-burn" preserveAspectRatio="xMidYMid meet">
          <line :x1="PX" :y1="yc(0)" :x2="W - PX" :y2="yc(0)" class="burn-axis" />
          <path :d="targetPath" class="burn-target" />
          <path :d="actualPath" class="burn-actual" />
        </svg>
        <p class="ehome-legend">
          <span class="lg lg-target">目標ペース (velocity {{ avgVelocity || '—' }})</span>
          <span class="lg lg-actual">実績</span>
        </p>
      </section>

      <!-- 停滞チケット -->
      <section class="ehome-card">
        <div class="ehome-card-head">
          <h2>停滞チケット</h2>
          <span class="ehome-sp">3 日以上 DOING のまま</span>
        </div>
        <div v-if="stalled.length === 0" class="ehome-none" data-testid="ehome-stalled-none">停滞しているチケットはありません 🎉</div>
        <div v-else class="ehome-stalled">
          <button v-for="t in stalled" :key="t.id" class="stall-row" :data-testid="`ehome-stalled-${t.id}`"
                  @click="emit('select', t.id)">
            <span class="stall-id">{{ t.id }}</span>
            <span class="stall-title">{{ t.title }}</span>
            <span class="stall-age"><Icon name="clock" /> {{ ageInDays(t.startedAt) }}d</span>
          </button>
        </div>
      </section>
    </div>

    <p class="ehome-hint">
      左のレールから各儀式 (Planning / Daily / Refinement / Review / Retrospective) に入れます。
      <span v-if="nextPlanned"> 次スプリントの計画は <a class="ehome-link" @click="emit('go', 'planning')">Planning</a> から。</span>
    </p>
  </div>
</template>

<style scoped>
.ehome { padding: 24px 28px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
.ehome-head { display: flex; justify-content: space-between; align-items: flex-start; }
.ehome-floor { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; color: var(--accent); }
.ehome-title { font-family: var(--display); font-size: 28px; font-weight: 600; margin: 4px 0 6px; }
.ehome-goal { font-family: var(--sans); font-size: 13.5px; color: var(--ink-2); margin: 0; }
.ehome-empty { font-size: 13px; color: var(--ink-3); }
.ehome-counts { display: flex; gap: 12px; flex-wrap: wrap; }
.count-card {
  flex: 1; min-width: 96px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
  padding: 14px 16px; background: var(--bg-1); border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius); cursor: pointer; transition: background 0.12s ease;
}
.count-card:hover { background: var(--bg-2); }
.count-total { cursor: default; background: var(--bg-0); }
.count-n { font-family: var(--display); font-size: 26px; font-weight: 600; color: var(--ink-0); }
.count-l { font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--ink-3); }
.ehome-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.ehome-card { background: var(--bg-1); border: var(--hairline) solid var(--line-2); border-radius: var(--radius); padding: 16px 18px; }
.ehome-card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.ehome-card-head h2 { font-family: var(--display); font-size: 16px; font-weight: 600; margin: 0; }
.ehome-sp { font-family: var(--sans); font-size: 12px; color: var(--ink-2); }
.ehome-sp b { color: var(--accent); }
.ehome-burn { width: 100%; height: auto; }
.burn-axis { stroke: var(--line-2); stroke-width: 1; }
.burn-target { fill: none; stroke: var(--ink-3); stroke-width: 1.5; stroke-dasharray: 4 3; }
.burn-actual { fill: none; stroke: var(--accent); stroke-width: 2; }
.ehome-legend { display: flex; gap: 16px; margin: 8px 0 0; font-family: var(--mono); font-size: 10px; }
.lg { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-2); }
.lg::before { content: ''; width: 14px; height: 2px; display: inline-block; }
.lg-target::before { background: var(--ink-3); }
.lg-actual::before { background: var(--accent); }
.ehome-none { font-size: 13px; color: var(--ink-2); padding: 8px 0; }
.ehome-stalled { display: flex; flex-direction: column; gap: 6px; }
.stall-row {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 8px 10px; background: var(--bg-0); border: var(--hairline) solid var(--line-1);
  border-radius: var(--radius); cursor: pointer;
}
.stall-row:hover { background: var(--bg-2); }
.stall-id { font-family: var(--mono); font-size: 11px; color: var(--accent); min-width: 96px; }
.stall-title { flex: 1; font-size: 13px; color: var(--ink-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stall-age { font-family: var(--mono); font-size: 11px; color: var(--warn); display: inline-flex; align-items: center; gap: 4px; }
.ehome-hint { font-size: 12.5px; color: var(--ink-3); margin: 0; }
.ehome-link { color: var(--accent); cursor: pointer; text-decoration: underline; }
</style>
