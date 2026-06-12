<script setup lang="ts">
// Planning 画面 (floor 01 / Wave 1 で 3 区画共通ビューに統一)。
// ゴール / SMART / PLANNED-VELOCITY は CURRENT (active sprint) に対して表示する。
// その下に SprintSectionedList (CURRENT / NEXT / BACKLOG)。
// 「スプリント計画/開始」ダイアログ + Pull from backlog は次スプリント (nextPlanned) を練る入口として維持する。
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { sprints, velocityHistory, activeSprint, nextPlanned, patchSprint, startSprint, createSprint } = useSprints();
const { patchTicket } = useTickets();
const { members } = useMembers();

// 全チケットを 3 区画へ。
const allTickets = computed(() => props.tickets);
const { current, next, backlog } = useSprintSections(allTickets);

const currentLabel = computed(() => (activeSprint.value ? `Sprint ${activeSprint.value.number}` : 'Current Sprint'));
const nextLabel = computed(() => (nextPlanned.value ? `Sprint ${nextPlanned.value.number} (planned)` : 'Next Sprint'));

// ゴール / velocity は CURRENT (active sprint) に対して算出する。
const totalSP = computed(() => current.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  if (vs.length === 0) return 0;
  return Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});
const hasVelocity = computed(() => avgVelocity.value > 0);
const overBy = computed(() => totalSP.value - avgVelocity.value);
const goal = computed(() => activeSprint.value?.goal ?? 'スプリントゴール未設定');

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

// ===== 区画跨ぎ d&d 移動 (sprintId 変更) =====
async function onMoveToSection(ticketId: string, section: 'current' | 'next' | 'backlog'): Promise<void> {
  if (section === 'current') {
    if (!activeSprint.value) return;
    await patchTicket(ticketId, { sprintId: activeSprint.value.id });
  } else if (section === 'next') {
    if (!nextPlanned.value) return;
    await patchTicket(ticketId, { sprintId: nextPlanned.value.id });
  } else {
    await patchTicket(ticketId, { sprintId: null });
  }
}

// ===== 次スプリント計画 (B案: ゴール先行で planned を練り「開始」で active 化) =====
const showSprintDialog = ref(false);
const createMode = ref(false);
const draftGoal = ref('');
const draftStart = ref(''); // YYYY-MM-DD (input[type=date])
const draftEnd = ref('');
const sprintBusy = ref(false);
const sprintError = ref<string | null>(null);

const toDate = (iso: string) => iso.slice(0, 10);
const fromStart = (d: string) => `${d}T00:00:00+09:00`;
const fromEnd = (d: string) => `${d}T23:59:59+09:00`;

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { start: now.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function openSprintDialog() {
  const s = nextPlanned.value;
  if (!s) return;
  createMode.value = false;
  draftGoal.value = s.goal === 'スプリントゴールが設定されていません' ? '' : s.goal;
  draftStart.value = toDate(s.startsAt);
  draftEnd.value = toDate(s.endsAt);
  sprintError.value = null;
  showSprintDialog.value = true;
}

function openCreateDialog() {
  createMode.value = true;
  draftGoal.value = '';
  const r = defaultRange();
  draftStart.value = r.start;
  draftEnd.value = r.end;
  sprintError.value = null;
  showSprintDialog.value = true;
}

async function createNewSprint() {
  const err = validate();
  if (err) { sprintError.value = err; return; }
  sprintBusy.value = true; sprintError.value = null;
  try {
    await createSprint(buildBody());
    showSprintDialog.value = false;
  } catch (e) { sprintError.value = errText(e); } finally { sprintBusy.value = false; }
}

function buildBody() {
  return { goal: draftGoal.value.trim(), startsAt: fromStart(draftStart.value), endsAt: fromEnd(draftEnd.value) };
}

function validate(): string | null {
  if (!draftGoal.value.trim()) return 'スプリントゴールを入力してください。';
  if (!draftStart.value || !draftEnd.value) return '開始日と終了日を入力してください。';
  if (Date.parse(fromStart(draftStart.value)) > Date.parse(fromEnd(draftEnd.value))) return '開始日は終了日より前にしてください。';
  return null;
}

function errText(e: unknown): string {
  const err = e as { data?: { error?: string }; message?: string };
  return err.data?.error ?? err.message ?? 'unknown error';
}

async function saveSprint() {
  const err = validate();
  if (err) { sprintError.value = err; return; }
  const s = nextPlanned.value; if (!s) return;
  sprintBusy.value = true; sprintError.value = null;
  try {
    await patchSprint(s.id, buildBody());
    showSprintDialog.value = false;
  } catch (e) { sprintError.value = errText(e); } finally { sprintBusy.value = false; }
}

async function startNextSprint() {
  const err = validate();
  if (err) { sprintError.value = err; return; }
  const s = nextPlanned.value; if (!s) return;
  sprintBusy.value = true; sprintError.value = null;
  try {
    await startSprint(s.id, buildBody());
    showSprintDialog.value = false;
  } catch (e) { sprintError.value = errText(e); } finally { sprintBusy.value = false; }
}

// ===== Pull from backlog ダイアログ (次スプリント nextPlanned へ積む) =====
const showPullDialog = ref(false);
const pullSelected = ref<Set<string>>(new Set());
const pullBusy = ref(false);
const pullError = ref<string | null>(null);

// バックログチケット: nextPlanned に属さず status === 'backlog'
const pullableBacklog = computed(() => {
  const planId = nextPlanned.value?.id;
  return props.tickets.filter((t) => {
    const notInPlanSprint = !planId || t.sprintId !== planId;
    return notInPlanSprint && t.status === 'backlog';
  });
});

function openPullDialog(): void {
  pullSelected.value = new Set();
  pullError.value = null;
  showPullDialog.value = true;
}

function togglePullRow(id: string): void {
  const s = new Set(pullSelected.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  pullSelected.value = s;
}

async function submitPull(): Promise<void> {
  const sprint = nextPlanned.value;
  if (!sprint) return;
  const ids = [...pullSelected.value];
  if (ids.length === 0) return;
  pullBusy.value = true;
  pullError.value = null;
  try {
    for (const id of ids) {
      const result = await patchTicket(id, { sprintId: sprint.id, status: 'todo' });
      if (!result) throw new Error(`チケット ${id} の更新に失敗しました`);
    }
    showPullDialog.value = false;
  } catch (e) {
    pullError.value = errText(e);
  } finally {
    pullBusy.value = false;
  }
}

// U-2: ESC でダイアログを閉じる
onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (showPullDialog.value) { e.stopPropagation(); showPullDialog.value = false; return; }
    if (showSprintDialog.value) { e.stopPropagation(); showSprintDialog.value = false; }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});
</script>

<template>
  <div class="planning">
    <div class="goal-block">
      <div style="display: flex; align-items: center; margin-bottom: 8px">
        <div class="t-cap">
          <template v-if="activeSprint">Sprint {{ activeSprint.number }} (進行中)</template>
          <template v-else>SPRINT GOAL</template>
        </div>
        <div style="margin-left: auto; display: flex; gap: 8px">
          <button v-if="nextPlanned" class="h-btn" data-testid="plan-next-sprint" @click="openSprintDialog">
            <Icon name="edit" /> 次スプリントを計画
          </button>
          <button v-if="nextPlanned" class="h-btn h-btn--primary" data-testid="sprint-start-cta" @click="openSprintDialog">
            スプリントを開始 →
          </button>
          <button v-else class="h-btn" data-testid="create-sprint" @click="openCreateDialog">
            <Icon name="plus" /> 新規スプリントを計画
          </button>
        </div>
      </div>
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

      <!-- PLANNED / VELOCITY — CURRENT (active sprint) の積み上げ SP vs velocity 実績 -->
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
      <h2>Sprint planning</h2>
      <span style="margin-left: auto" />
      <button class="h-btn" data-testid="pull-from-backlog"
              :disabled="!nextPlanned"
              @click="openPullDialog">
        <Icon name="plus" /> Pull from backlog
      </button>
    </div>

    <div class="col-body">
      <SprintSectionedList
        :current="current" :next="next" :backlog="backlog"
        :selected-id="selectedId"
        :members="members" :sprints="sprints"
        :current-label="currentLabel" :next-label="nextLabel"
        :allowed-types="['incident', 'bug']"
        @select="(id) => emit('select', id)"
        @move-to-section="onMoveToSection"
      />
    </div>
  </div>

  <!-- Pull from backlog ダイアログ (次スプリント nextPlanned へ積む) -->
  <div v-if="showPullDialog" class="dialog-overlay" data-testid="pull-dialog" @click.self="showPullDialog = false">
    <div class="dialog pull-dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">バックログから追加</h2>
        <button class="close-btn" @click="showPullDialog = false">×</button>
      </div>
      <div class="dialog-body" style="padding-bottom: 8px">
        <p style="font-size: 12px; color: var(--ink-2); margin: 0; line-height: 1.6">
          Sprint {{ nextPlanned?.number }} (計画中) に追加するチケットを選択してください。
        </p>
        <div class="pull-list">
          <p v-if="pullableBacklog.length === 0"
             style="font-size: 13px; color: var(--ink-2); padding: 16px 0; margin: 0; text-align: center">
            バックログにチケットがありません。
          </p>
          <div
            v-for="t in pullableBacklog"
            :key="t.id"
            :data-testid="`pull-row-${t.id}`"
            :class="['pull-row', pullSelected.has(t.id) && 'pull-row--selected']"
            @click="togglePullRow(t.id)"
          >
            <span class="pull-check">
              <span v-if="pullSelected.has(t.id)" style="color: var(--accent)">✓</span>
            </span>
            <TypeMark :type="t.type" />
            <span class="trow-id t-mono" style="font-size: 11px; color: var(--ink-3); min-width: 72px">{{ t.id }}</span>
            <span class="pull-title">{{ t.title }}</span>
            <span v-if="t.estimatePt != null" class="pull-sp">{{ t.estimatePt }} SP</span>
            <span v-else class="pull-sp" style="color: var(--ink-3)">—</span>
          </div>
        </div>
        <p v-if="pullError" class="msg-error" data-testid="pull-error">{{ pullError }}</p>
      </div>
      <div class="dialog-foot">
        <button class="btn-cancel" :disabled="pullBusy" @click="showPullDialog = false">キャンセル</button>
        <button
          class="btn-primary"
          data-testid="pull-submit"
          :disabled="pullSelected.size === 0 || pullBusy"
          @click="submitPull"
        >
          {{ pullBusy ? '追加中…' : `${pullSelected.size} 件をスプリントへ →` }}
        </button>
      </div>
    </div>
  </div>

  <!-- 次スプリント計画ダイアログ (ゴール先行 → 開始で active 化) -->
  <div v-if="showSprintDialog" class="dialog-overlay" data-testid="sprint-dialog" @click.self="showSprintDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">{{ createMode ? '新規スプリントを計画' : `次スプリント (S${nextPlanned?.number}) を計画` }}</h2>
        <button class="close-btn" @click="showSprintDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <p v-if="createMode" style="font-size: 12px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.6">
          新しいスプリントを <b style="color: var(--ink-0)">planned</b> として作成します。
          作成後、Pull from backlog でチケットを積み、準備ができたら「開始」で active 化します。
        </p>
        <p v-else style="font-size: 12px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.6">
          ゴールはプランニングのアウトプットです。ゴールと期間を決めて
          <b style="color: var(--ink-0)">開始</b>すると、現在のスプリントは完了し velocity が確定します。
        </p>
        <div class="field">
          <label class="label" for="sp-goal">スプリントゴール <span class="req">*</span></label>
          <textarea id="sp-goal" v-model="draftGoal" data-testid="sprint-goal-input"
                    class="text-input" rows="3" maxlength="200"
                    placeholder="例: 決済フローの MVP を本番公開し、離脱率を計測可能にする" />
        </div>
        <div class="field-row">
          <div class="field">
            <label class="label" for="sp-start">開始日 <span class="req">*</span></label>
            <input id="sp-start" v-model="draftStart" data-testid="sprint-start-input" type="date" class="text-input" />
          </div>
          <div class="field">
            <label class="label" for="sp-end">終了日 <span class="req">*</span></label>
            <input id="sp-end" v-model="draftEnd" data-testid="sprint-end-input" type="date" class="text-input" />
          </div>
        </div>
        <p v-if="sprintError" class="msg-error" data-testid="sprint-error">{{ sprintError }}</p>
      </div>
      <div class="dialog-foot">
        <template v-if="createMode">
          <button class="btn-cancel" :disabled="sprintBusy" @click="showSprintDialog = false">キャンセル</button>
          <button class="btn-primary" :disabled="sprintBusy" data-testid="sprint-create-submit" @click="createNewSprint">
            スプリントを作成
          </button>
        </template>
        <template v-else>
          <button class="btn-cancel" :disabled="sprintBusy" data-testid="sprint-save" @click="saveSprint">
            保存 (開始せず)
          </button>
          <button class="btn-primary" :disabled="sprintBusy" data-testid="sprint-start" @click="startNextSprint">
            スプリントを開始 →
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0;
  background: rgba(8, 8, 8, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}
.dialog {
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  width: 100%; max-width: 480px;
  box-shadow: 0 8px 32px rgba(8, 8, 8, 0.12);
}
.dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.dialog-title { font-family: var(--display); font-size: 20px; font-weight: 600; margin: 0; }
.close-btn { background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--ink-2); }
.dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }
.label { font-family: var(--mono); font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; text-transform: uppercase; }
.req { color: var(--accent); }
.text-input {
  padding: 10px 12px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans); font-size: 14px;
  resize: vertical;
}
.text-input:focus { outline: none; border-color: var(--accent); }
.msg-error { color: var(--err); font-size: 12px; margin: 0; }
.dialog-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 16px 20px;
  border-top: var(--hairline) solid var(--line-1);
}
.btn-cancel {
  padding: 8px 16px; background: transparent;
  border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; cursor: pointer;
}
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  padding: 8px 20px; background: var(--accent); color: #FBF8F2;
  border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-dim); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Sprint header CTA — accent 塗り h-btn (ダイアログ外のインライン用) */
.h-btn--primary {
  background: var(--accent); color: #FBF8F2;
  border-color: transparent;
  font-weight: 500;
}
.h-btn--primary:hover { background: var(--accent-dim, #b84600); border-color: transparent; }

/* Pull from backlog ダイアログ — リスト */
.pull-dialog { max-width: 560px; }
.pull-list {
  max-height: 50vh;
  overflow-y: auto;
  border: var(--hairline) solid var(--line-1);
  border-radius: var(--radius);
}
.pull-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: var(--hairline) solid var(--line-1);
  transition: background 0.1s;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-0);
}
.pull-row:last-child { border-bottom: none; }
.pull-row:hover { background: var(--bg-2); }
.pull-row--selected { background: var(--accent-bg, #fff3ee); }
.pull-row--selected:hover { background: var(--accent-bg, #ffe8db); }
.pull-check {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
}
.pull-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pull-sp {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}
</style>
