<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint, velocityHistory, nextPlanned, patchSprint, startSprint } = useSprints();

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

// ===== 次スプリント計画 (B案: ゴール先行で planned を練り「開始」で active 化) =====
// ゴールはプランニングのアウトプット。ゴール + 期間を決めて開始すると現 active は
// completed になり velocity が確定する。
const showSprintDialog = ref(false);
const draftGoal = ref('');
const draftStart = ref(''); // YYYY-MM-DD (input[type=date])
const draftEnd = ref('');
const sprintBusy = ref(false);
const sprintError = ref<string | null>(null);

const toDate = (iso: string) => iso.slice(0, 10);
const fromStart = (d: string) => `${d}T00:00:00+09:00`;
const fromEnd = (d: string) => `${d}T23:59:59+09:00`;

function openSprintDialog() {
  const s = nextPlanned.value;
  if (!s) return;
  draftGoal.value = s.goal === 'スプリントゴールが設定されていません' ? '' : s.goal;
  draftStart.value = toDate(s.startsAt);
  draftEnd.value = toDate(s.endsAt);
  sprintError.value = null;
  showSprintDialog.value = true;
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
</script>

<template>
  <div class="planning">
    <div class="goal-block">
      <div style="display: flex; align-items: center; margin-bottom: 8px">
        <div class="t-cap">SPRINT GOAL</div>
        <button v-if="nextPlanned" class="h-btn" style="margin-left: auto"
                data-testid="plan-next-sprint" @click="openSprintDialog">
          <Icon name="plus" /> 次スプリント (S{{ nextPlanned.number }}) を計画
        </button>
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

  <!-- 次スプリント計画ダイアログ (ゴール先行 → 開始で active 化) -->
  <div v-if="showSprintDialog" class="dialog-overlay" data-testid="sprint-dialog" @click.self="showSprintDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">次スプリント (S{{ nextPlanned?.number }}) を計画</h2>
        <button class="close-btn" @click="showSprintDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <p style="font-size: 12px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.6">
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
        <button class="btn-cancel" :disabled="sprintBusy" @click="saveSprint" data-testid="sprint-save">
          保存 (開始せず)
        </button>
        <button class="btn-primary" :disabled="sprintBusy" data-testid="sprint-start" @click="startNextSprint">
          スプリントを開始 →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 次スプリント計画ダイアログ (Backlog の生成ダイアログと同系。.field 等の汎用名が
   EstimationPanel と衝突するためグローバル化せず scoped で持つ)。 */
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
</style>
