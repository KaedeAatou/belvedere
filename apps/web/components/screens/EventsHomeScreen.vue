<script setup lang="ts">
// events ホーム (WC-cba82df1)。events タブを押した時に「ぱっと見でスプリント状態」が分かる
// ダッシュボード。現スプリントの ステータス別件数 + バーンダウン + 停滞チケット を 1 画面に集約し、
// レールでさらに儀式へドリルダウンできる。表示集合は current sprint (Daily/Planning CURRENT と一致)。
import type { Ticket, Status, Epic } from '@belvedere/shared';
import type { ScreenId } from '~/composables/useUiMeta';

const props = defineProps<{ tickets: Ticket[]; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string]; go: [screen: ScreenId] }>();

const { activeSprint, nextPlanned, velocityHistory, currentLabel } = useSprints();

// Product Goal (WC-23): 全体に紐づく到達点なので Home を本籍に、ここで表示+編集する。
// 編集は PO / admin のみ (product.goal ゲート)。Planning は読み取り専用で参照する。
const { current: currentWs, updateProductGoal } = useWorkspaces();
const productGoal = computed(() => currentWs.value?.productGoal?.trim() ?? '');
const canEditGoal = computed(() => currentWs.value?.role === 'admin' || currentWs.value?.role === 'po');
const editingGoal = ref(false);
const goalDraft = ref('');
const goalSaving = ref(false);
const goalError = ref<string | null>(null);
function startEditGoal(): void {
  goalDraft.value = productGoal.value;
  goalError.value = null;
  editingGoal.value = true;
}
async function saveGoal(): Promise<void> {
  if (goalSaving.value) return;
  goalSaving.value = true;
  const ok = await updateProductGoal(goalDraft.value.trim());
  goalSaving.value = false;
  if (ok) editingGoal.value = false;
  else goalError.value = '保存に失敗しました';
}

// Epics (WC-22 派生): プロダクト全体の Epic 一覧 + 戦略意図の編集。Product Goal と同じ Home 本籍思想。
// 編集ゲートは product.goal と同一 (admin/po = epic.write と一致)。一度に 1 Epic だけ編集する。
const { epics, updateEpic } = useEpics();
const canEditEpics = canEditGoal;
const editingEpicId = ref<string | null>(null);
const epicDraft = reactive({ name: '', rationale: '', successMetric: '', strategicTheme: '' });
const epicSaving = ref(false);
const epicError = ref<string | null>(null);
function startEditEpic(e: Epic): void {
  editingEpicId.value = e.id;
  epicDraft.name = e.name;
  epicDraft.rationale = e.rationale ?? '';
  epicDraft.successMetric = e.successMetric ?? '';
  epicDraft.strategicTheme = e.strategicTheme ?? '';
  epicError.value = null;
}
async function saveEpic(id: string): Promise<void> {
  if (epicSaving.value || !epicDraft.name.trim()) return;
  epicSaving.value = true;
  const ok = await updateEpic(id, {
    name: epicDraft.name.trim(),
    rationale: epicDraft.rationale.trim(),
    successMetric: epicDraft.successMetric.trim(),
    strategicTheme: epicDraft.strategicTheme.trim(),
  });
  epicSaving.value = false;
  if (ok) editingEpicId.value = null;
  else epicError.value = '保存に失敗しました';
}

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

    <!-- Product Goal (WC-23): プロダクト全体の到達点。ここで設定し、Planning が参照する。 -->
    <section class="ehome-card pg-card" data-testid="ehome-product-goal">
      <div class="ehome-card-head">
        <h2>Product Goal</h2>
        <button v-if="canEditGoal && !editingGoal" class="pg-edit" data-testid="pg-edit" @click="startEditGoal">編集</button>
      </div>
      <template v-if="!editingGoal">
        <p v-if="productGoal" class="pg-text" data-testid="pg-text">{{ productGoal }}</p>
        <p v-else class="pg-empty" data-testid="pg-empty">
          プロダクトゴール未設定。<template v-if="canEditGoal">「編集」で、このプロダクトで達成したい長期の到達点を設定してください。</template><template v-else>PO / 管理者が設定できます。</template>
        </p>
      </template>
      <template v-else>
        <textarea v-model="goalDraft" class="pg-input" data-testid="pg-input" rows="3" maxlength="280"
                  placeholder="このプロダクトで達成したい長期の到達点 (例: 決済MVPを本番リリースし社内10チームが日次利用する)" />
        <div class="pg-actions">
          <button class="h-btn h-btn--primary" data-testid="pg-save" :disabled="goalSaving" @click="saveGoal">{{ goalSaving ? '保存中…' : '保存' }}</button>
          <button class="h-btn" data-testid="pg-cancel" @click="editingGoal = false">キャンセル</button>
          <span v-if="goalError" class="pg-error">{{ goalError }}</span>
        </div>
      </template>
    </section>

    <!-- Epics (WC-22 派生): プロダクト全体の Epic 一覧 + 戦略意図の編集。Product Goal と同じ Home 本籍。編集は admin/po のみ。 -->
    <section class="ehome-card epics-card" data-testid="ehome-epics">
      <div class="ehome-card-head">
        <h2>Epics</h2>
        <span class="ehome-sp">{{ epics.length }} epics</span>
      </div>
      <p v-if="epics.length === 0" class="pg-empty" data-testid="epics-empty">
        Epic がまだありません。Story 作成時に親 Epic を追加できます。
      </p>
      <ul v-else class="epic-list">
        <li v-for="e in epics" :key="e.id" class="epic-item" :data-testid="`epic-row-${e.id}`">
          <template v-if="editingEpicId !== e.id">
            <div class="epic-head">
              <span class="epic-id">{{ e.id }}</span>
              <span class="epic-name">{{ e.name }}</span>
              <button v-if="canEditEpics" class="pg-edit" :data-testid="`epic-edit-${e.id}`" @click="startEditEpic(e)">編集</button>
            </div>
            <p v-if="e.rationale" class="epic-field"><b>意図</b>{{ e.rationale }}</p>
            <p v-if="e.successMetric" class="epic-field"><b>成功指標</b>{{ e.successMetric }}</p>
            <p v-if="e.strategicTheme" class="epic-field"><b>テーマ</b>{{ e.strategicTheme }}</p>
          </template>
          <template v-else>
            <div class="epic-form">
              <input v-model="epicDraft.name" class="pg-input" :data-testid="`epic-name-input-${e.id}`" placeholder="Epic 名 (必須)" />
              <textarea v-model="epicDraft.rationale" class="pg-input" rows="2" :data-testid="`epic-rationale-input-${e.id}`" placeholder="戦略意図 / なぜこの Epic か" />
              <input v-model="epicDraft.successMetric" class="pg-input" :data-testid="`epic-metric-input-${e.id}`" placeholder="成功指標 (例: 誤検出率 10% 以下)" />
              <input v-model="epicDraft.strategicTheme" class="pg-input" :data-testid="`epic-theme-input-${e.id}`" placeholder="戦略テーマ (任意)" />
              <div class="pg-actions">
                <button class="h-btn h-btn--primary" :data-testid="`epic-save-${e.id}`" :disabled="epicSaving || !epicDraft.name.trim()" @click="saveEpic(e.id)">{{ epicSaving ? '保存中…' : '保存' }}</button>
                <button class="h-btn" :data-testid="`epic-cancel-${e.id}`" @click="editingEpicId = null">キャンセル</button>
                <span v-if="epicError" class="pg-error">{{ epicError }}</span>
              </div>
            </div>
          </template>
        </li>
      </ul>
    </section>

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
/* Product Goal カード (WC-23) */
.pg-card { border-left: 3px solid var(--accent); }
.pg-edit {
  background: transparent; border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  padding: 3px 10px; font-family: var(--sans); font-size: 12px; color: var(--ink-1); cursor: pointer;
}
.pg-edit:hover { background: var(--bg-2); color: var(--ink-0); }
.pg-text { font-family: var(--sans); font-size: 15px; line-height: 1.55; color: var(--ink-0); margin: 0; }
.pg-empty { font-size: 13px; color: var(--ink-3); font-style: italic; margin: 0; }
.pg-input {
  width: 100%; resize: vertical; padding: 8px 10px; font-family: var(--sans); font-size: 14px; line-height: 1.5;
  border: var(--hairline) solid var(--line-2); border-radius: var(--radius); background: var(--bg-0);
}
.pg-input:focus { outline: none; border-color: var(--accent); }
.pg-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.pg-error { color: var(--err); font-size: 12px; }
/* Epics カード (WC-22 派生: Home で戦略意図を編集) */
.epics-card { border-left: 3px solid var(--line-2); }
.epic-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.epic-item { border-top: var(--hairline) solid var(--line-1); padding-top: 12px; }
.epic-item:first-child { border-top: none; padding-top: 0; }
.epic-head { display: flex; align-items: baseline; gap: 10px; }
.epic-id { font-family: var(--mono); font-size: 10px; color: var(--ink-3); letter-spacing: 0.06em; }
.epic-name { font-size: 14px; color: var(--ink-0); flex: 1; }
.epic-field { font-family: var(--sans); font-size: 12px; color: var(--ink-2); margin: 4px 0 0; }
.epic-field b { color: var(--ink-1); font-weight: 600; font-size: 11px; margin-right: 6px; }
.epic-form { display: flex; flex-direction: column; gap: 6px; }
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
