<script setup lang="ts">
// Planning 画面 (floor 01 / Wave 1 で 3 区画共通ビューに統一)。
// ゴール / SMART / PLANNED-VELOCITY は CURRENT (active sprint) に対して表示する。
// その下に SprintSectionedList (CURRENT / NEXT / BACKLOG)。
// 「スプリント計画/開始」ダイアログは次スプリント (nextPlanned) を練る入口として維持する。
// Pull from backlog は投入先 (CURRENT / Next) を選べる (F-08 / 既定は Next)。
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { sprints, velocityHistory, activeSprint, nextPlanned, currentLabel, nextLabel, patchSprint, startSprint } = useSprints();
const { patchTicket } = useTickets();
const { members } = useMembers();
// Product Goal (WC-23): Planning では読み取り専用で参照 (編集は Home)。Sprint Goal がこれに貢献するかが R 観点。
const { current: currentWs } = useWorkspaces();
const productGoal = computed(() => currentWs.value?.productGoal?.trim() ?? '');

// 全チケットを 3 区画へ。
const allTickets = computed(() => props.tickets);
const { current, next, backlog } = useSprintSections(allTickets);

// ゴール / velocity は CURRENT (active sprint) に対して算出する。
const totalSP = computed(() => current.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  if (vs.length === 0) return 0;
  return Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});
const hasVelocity = computed(() => avgVelocity.value > 0);
const overBy = computed(() => totalSP.value - avgVelocity.value);
const goal = computed(() => activeSprint.value?.goal?.trim() || 'スプリントゴール未設定');

// 1 セグメント = 1 SP。velocity を超えた分が over (accent) になる。
const barTotal = computed(() => Math.max(totalSP.value, avgVelocity.value, 1));

// SMART 実評価 (WC-14): AI が active スプリントの Goal を 5観点で採点する。
// 未評価時は 5観点の構造ガイド (neutral) を出し、「AI で評価」で verdict に差し替える。
const { verdict: smartVerdict, loading: smartLoading, error: smartError, evaluate: evaluateSmart } = useSmartEval();
const SMART_GUIDE: { letter: string; name: string; note: string }[] = [
  { letter: 'S', name: 'Specific', note: 'ゴールが具体的か' },
  { letter: 'M', name: 'Measurable', note: '測定可能な指標があるか' },
  { letter: 'A', name: 'Attainable', note: 'velocity 内に収まるか' },
  { letter: 'R', name: 'Relevant', note: 'ロードマップに整合するか' },
  { letter: 'T', name: 'Time-bound', note: '期限が明確か' },
];
// 評価済なら AI の criteria、未評価なら guide (ok=null 相当で neutral 表示)。
const smart = computed(() =>
  smartVerdict.value
    ? smartVerdict.value.criteria.map((c) => ({ letter: c.letter, name: c.name, ok: c.ok, note: c.note, evaluated: true }))
    : SMART_GUIDE.map((g) => ({ ...g, ok: null as boolean | null, evaluated: false })),
);
// Planning コンパクト化: SMART 分析はデフォルト折りたたみ、ヘッダクリックで展開 (チケットリストを主役にする)。
const smartCollapsed = ref(true);

// 自動評価 (WC-14 / A 案): Goal が変わった時だけ実評価し、開いた時は前回結果 (キャッシュ) を表示する。
// SMART 評価は実 Gemini 呼び出しなので無駄打ちを避ける。チケット追加で SP を見直したい時等は手動「再評価」で。
function maybeAutoEvaluateSmart(): void {
  const g = activeSprint.value?.goal?.trim() ?? '';
  if (!g) return; // ゴール未設定なら評価しない (neutral ガイドのまま)
  if (smartVerdict.value?.goal === g) return; // 同じ Goal を評価済ならキャッシュ表示 (呼ばない)
  void evaluateSmart();
}
onMounted(maybeAutoEvaluateSmart);
// activeSprint は初期ロードで後から入るので、goal の変化 (undefined→値 / 編集で変更) を監視して自動評価。
watch(() => activeSprint.value?.goal, maybeAutoEvaluateSmart);

// 区画跨ぎ d&d 移動 (sprintId 変更) は SprintSectionedList.onDragEnd → reorderTickets が直接担う
// (旧 @move-to-section emit 経路は撤去済)。patchTicket は下の submitPull で引き続き使う。

// ===== スプリント編集 / 計画 / 開始 ダイアログ =====
// 常時稼働化 (active 1 + planned 1 が常在) により手動「新規作成」は不要。
// dialogTarget='current' は active の名前/ゴール/期間の編集、'next' は planned の計画 + 開始。
const showSprintDialog = ref(false);
const dialogTarget = ref<'current' | 'next'>('next');
const draftName = ref('');
const draftGoal = ref('');
const draftStart = ref(''); // YYYY-MM-DD (input[type=date])
const draftEnd = ref('');
const sprintBusy = ref(false);
const sprintError = ref<string | null>(null);

const toDate = (iso: string) => iso.slice(0, 10);
const fromStart = (d: string) => `${d}T00:00:00+09:00`;
const fromEnd = (d: string) => `${d}T23:59:59+09:00`;

const dialogSprint = computed(() => (dialogTarget.value === 'current' ? activeSprint.value : nextPlanned.value));
const dialogTitle = computed(() =>
  dialogTarget.value === 'current' ? `現スプリント (${currentLabel.value}) を編集` : `次スプリント (${nextLabel.value}) を計画`,
);

// WC-30: スプリント開始時に持ち越す未完了チケット。現 active の非done を候補にし、開始ダイアログで既定全チェック。
// 外したものは付け替えられず旧 (completed) sprint に残る (= 履歴閲覧のみ / 作業画面から消える) ので UI で明示する。
const carryOverCandidates = computed(() => {
  const aid = activeSprint.value?.id;
  if (!aid) return [];
  return props.tickets.filter((t) => t.sprintId === aid && t.status !== 'done');
});
const carrySelected = ref<Set<string>>(new Set());
function toggleCarry(id: string): void {
  const nextSet = new Set(carrySelected.value);
  if (nextSet.has(id)) nextSet.delete(id);
  else nextSet.add(id);
  carrySelected.value = nextSet;
}

function openSprintDialog(target: 'current' | 'next') {
  const s = target === 'current' ? activeSprint.value : nextPlanned.value;
  if (!s) return;
  dialogTarget.value = target;
  draftName.value = s.name ?? '';
  draftGoal.value = s.goal ?? '';
  draftStart.value = toDate(s.startsAt);
  draftEnd.value = toDate(s.endsAt);
  sprintError.value = null;
  // 開始ダイアログを開くとき、現 active の未完了チケットを既定全チェックで持ち越し対象にする。
  carrySelected.value = new Set(carryOverCandidates.value.map((t) => t.id));
  showSprintDialog.value = true;
}

// 名前 (空可) は常に送る (空 = 名前解除)。ゴールは空なら省略 (patch の min(1) を踏まないため)。
function buildBody() {
  const name = draftName.value.trim();
  const g = draftGoal.value.trim();
  return {
    name,
    ...(g !== '' && { goal: g }),
    startsAt: fromStart(draftStart.value),
    endsAt: fromEnd(draftEnd.value),
  };
}

function validateDates(): string | null {
  if (!draftStart.value || !draftEnd.value) return '開始日と終了日を入力してください。';
  if (Date.parse(fromStart(draftStart.value)) > Date.parse(fromEnd(draftEnd.value))) return '開始日は終了日より前にしてください。';
  return null;
}

function errText(e: unknown): string {
  const err = e as { data?: { error?: string }; message?: string };
  return err.data?.error ?? err.message ?? 'unknown error';
}

// 保存: current / next いずれも patch (status は変えない)。
async function saveSprint() {
  const err = validateDates();
  if (err) { sprintError.value = err; return; }
  const s = dialogSprint.value; if (!s) return;
  sprintBusy.value = true; sprintError.value = null;
  try {
    await patchSprint(s.id, buildBody());
    showSprintDialog.value = false;
  } catch (e) { sprintError.value = errText(e); } finally { sprintBusy.value = false; }
}

// 開始: next のみ。ゴールはスクラムの必須アウトプットなので開始時のみ必須にする。
async function startNextSprint() {
  const err = validateDates() ?? (draftGoal.value.trim() ? null : 'スプリントゴールを入力してください。');
  if (err) { sprintError.value = err; return; }
  const s = nextPlanned.value; if (!s) return;
  sprintBusy.value = true; sprintError.value = null;
  try {
    await startSprint(s.id, { ...buildBody(), carryOverIds: [...carrySelected.value] });
    showSprintDialog.value = false;
  } catch (e) { sprintError.value = errText(e); } finally { sprintBusy.value = false; }
}

// ===== Pull from backlog ダイアログ (CURRENT / Next へ積む) =====
const showPullDialog = ref(false);
const pullSelected = ref<Set<string>>(new Set());
const pullBusy = ref(false);
const pullError = ref<string | null>(null);

// 投入先 (F-08): 従来は Next 固定で CURRENT へ一括で入れられなかった。
// 実在する区画 (nextPlanned / activeSprint) だけを候補に出し、既定は Next (従来挙動)。
type PullTarget = 'next' | 'current';
const pullTarget = ref<PullTarget>('next');
const pullTargetOptions = computed<{ value: PullTarget; label: string }[]>(() => {
  const opts: { value: PullTarget; label: string }[] = [];
  if (nextPlanned.value) opts.push({ value: 'next', label: `${nextLabel.value} (NEXT)` });
  if (activeSprint.value) opts.push({ value: 'current', label: `${currentLabel.value} (CURRENT)` });
  return opts;
});
const pullTargetSprint = computed(() => (pullTarget.value === 'current' ? activeSprint.value : nextPlanned.value));
const pullTargetLabel = computed(() => (pullTarget.value === 'current' ? currentLabel.value : nextLabel.value));

// バックログチケット: 投入先スプリントに属さず status === 'backlog'
const pullableBacklog = computed(() => {
  const targetId = pullTargetSprint.value?.id;
  return props.tickets.filter((t) => {
    const notInTargetSprint = !targetId || t.sprintId !== targetId;
    return notInTargetSprint && t.status === 'backlog';
  });
});

function openPullDialog(): void {
  pullSelected.value = new Set();
  pullError.value = null;
  // 既定は Next (従来挙動)。Next スプリントが無い環境では CURRENT に倒す。
  pullTarget.value = nextPlanned.value ? 'next' : 'current';
  showPullDialog.value = true;
}

function togglePullRow(id: string): void {
  const s = new Set(pullSelected.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  pullSelected.value = s;
}

async function submitPull(): Promise<void> {
  const sprint = pullTargetSprint.value;
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
          <template v-if="activeSprint">{{ currentLabel }} (進行中)</template>
          <template v-else>SPRINT GOAL</template>
        </div>
        <div style="margin-left: auto; display: flex; gap: 8px">
          <button v-if="activeSprint" class="h-btn" data-testid="edit-current-sprint" @click="openSprintDialog('current')">
            <Icon name="edit" /> 現スプリントを編集
          </button>
          <button v-if="nextPlanned" class="h-btn" data-testid="plan-next-sprint" @click="openSprintDialog('next')">
            <Icon name="edit" /> 次スプリントを計画
          </button>
          <!-- F-06 (2026-07-08): 旧ラベル「スプリントを開始」は現行スプリントの完了を伴うことが
               読み取れず、誤操作リスクがあった。何が起きるかをラベルで明示する。 -->
          <button v-if="nextPlanned" class="h-btn h-btn--primary" data-testid="sprint-start-cta" @click="openSprintDialog('next')">
            次スプリントを開始 →
          </button>
        </div>
      </div>
      <p v-if="!activeSprint && !nextPlanned" class="sprint-empty" data-testid="sprint-empty">
        スプリントを準備中です。表示されない場合はページをリロードしてください。
      </p>
      <!-- Product Goal (WC-23): 読み取り専用。Sprint Goal がこの到達点に貢献するか (SMART の R) を見る。編集は Home。 -->
      <div class="pg-ref" data-testid="planning-product-goal">
        <span class="pg-ref-cap">PRODUCT GOAL</span>
        <span v-if="productGoal" class="pg-ref-text">{{ productGoal }}</span>
        <span v-else class="pg-ref-empty">未設定 — Home で設定すると Sprint Goal の整合 (R) を評価できます</span>
      </div>
      <div class="goal-text">{{ goal }}</div>
      <div class="smart-head smart-toggle" data-testid="smart-toggle" style="cursor: pointer" @click="smartCollapsed = !smartCollapsed">
        <span class="t-cap" style="display: flex; align-items: center; gap: 6px">
          <span :style="{ display: 'inline-flex', transition: 'transform 0.15s ease', transform: smartCollapsed ? 'none' : 'rotate(90deg)' }">▸</span>SMART GOAL
        </span>
        <button v-if="!smartCollapsed" class="h-btn" data-testid="smart-eval-btn" :disabled="smartLoading" @click.stop="evaluateSmart">
          <Icon name="sparkle" /> {{ smartLoading ? '評価中…' : smartVerdict ? '再評価' : 'AI で評価' }}
        </button>
      </div>
      <template v-if="!smartCollapsed">
        <!-- SMART の目的を 1 行で説明 (WC-14: 使い方が分からない指摘)。曖昧なゴールを事前に捕まえる診断。 -->
        <p class="smart-explain" data-testid="smart-explain">
          Sprint Goal が「具体的・測定可能・達成可能・整合・期限明確」かを AI が採点します。△ の観点を潰すと
          Review で達成を判定できるゴールになります。Goal を変えると自動で再評価します。
        </p>
        <div class="smart-row">
          <div v-for="s in smart" :key="s.letter"
               :class="['smart-cell', s.evaluated ? (s.ok ? 'ok' : 'weak') : 'neutral']"
               :data-testid="`smart-cell-${s.letter}`" :title="s.note">
            <div class="letter">{{ s.letter }}</div>
            <div class="name">{{ s.name }}</div>
            <div class="check" :style="{ color: !s.evaluated ? 'var(--ink-4)' : s.ok ? 'var(--ok)' : 'var(--accent)' }">
              {{ !s.evaluated ? '—' : s.ok ? '✓' : '△' }}
            </div>
          </div>
        </div>
        <p v-if="smartError" class="smart-error" data-testid="smart-error">{{ smartError }}</p>
        <!-- AI 評価後: summary + 弱い観点の改善提案 (note) を出す。 -->
        <div v-if="smartVerdict" class="smart-notes" data-testid="smart-notes">
          <p v-if="smartVerdict.summary" class="smart-summary">{{ smartVerdict.summary }}</p>
          <div v-for="c in smartVerdict.criteria.filter((x) => !x.ok)" :key="c.letter" class="smart-note">
            <span class="smart-note-letter">{{ c.letter }}</span>
            <span>{{ c.note }}</span>
          </div>
        </div>
      </template>

      <!-- PLANNED / VELOCITY — CURRENT (active sprint) の積み上げ SP vs velocity 実績 -->
      <div class="vel-inline">
        <span class="t-cap" title="Velocity = 直近スプリントで完了した Story Point の実績平均。計画 SP がこれを超えると過剰計画のサイン">PLANNED / VELOCITY</span>
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
              :disabled="!nextPlanned && !activeSprint"
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
        split-mode="task-spike"
        @select="(id) => emit('select', id)"
      />
    </div>
  </div>

  <!-- Pull from backlog ダイアログ (投入先 CURRENT / Next を選んで積む / F-08) -->
  <div v-if="showPullDialog" class="dialog-overlay" data-testid="pull-dialog" @click.self="showPullDialog = false">
    <div class="dialog pull-dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">バックログから追加</h2>
        <button class="close-btn" @click="showPullDialog = false">×</button>
      </div>
      <div class="dialog-body" style="padding-bottom: 8px">
        <!-- 投入先 (F-08): 従来の Next 固定を廃し、CURRENT / Next から選ぶ (既定 Next)。 -->
        <div class="field">
          <label class="label" for="pull-target">投入先</label>
          <select id="pull-target" v-model="pullTarget" data-testid="pull-target" class="text-input">
            <option v-for="o in pullTargetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <p style="font-size: 12px; color: var(--ink-2); margin: 0; line-height: 1.6">
          {{ pullTargetLabel }} に追加するチケットを選択してください。
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
            <input
              type="checkbox"
              class="pull-check"
              :checked="pullSelected.has(t.id)"
              style="accent-color: var(--accent); pointer-events: none"
              tabindex="-1"
              :data-testid="`pull-check-${t.id}`"
            />
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

  <!-- スプリント編集 / 計画 ダイアログ (current=編集 / next=計画 + 開始) -->
  <div v-if="showSprintDialog" class="dialog-overlay" data-testid="sprint-dialog" @click.self="showSprintDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">{{ dialogTitle }}</h2>
        <button class="close-btn" @click="showSprintDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <p v-if="dialogTarget === 'current'" style="font-size: 12px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.6">
          進行中スプリントの名前 / ゴール / 期間を編集します。状態 (active) は変わりません。
        </p>
        <p v-else style="font-size: 12px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.6">
          ゴールはプランニングのアウトプットです。ゴールと期間を決めて
          <b style="color: var(--ink-0)">開始</b>すると、現在のスプリントは完了 (velocity 確定) し、
          このスプリントが現在のスプリントへ繰り上がります。
        </p>
        <div class="field">
          <label class="label" for="sp-name">スプリント名 <span style="color: var(--ink-3)">(任意)</span></label>
          <input id="sp-name" v-model="draftName" data-testid="sprint-name-input"
                 type="text" class="text-input" maxlength="80" placeholder="例: 決済MVP" />
        </div>
        <div class="field">
          <label class="label" for="sp-goal">スプリントゴール <span v-if="dialogTarget === 'next'" class="req">*</span></label>
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
        <div v-if="dialogTarget === 'next' && carryOverCandidates.length > 0" class="field" data-testid="carryover-field">
          <label class="label">未完了チケットの持ち越し
            <span style="color: var(--ink-3)">({{ carrySelected.size }}/{{ carryOverCandidates.length }})</span>
          </label>
          <p class="carryover-hint">現在のスプリントで完了しなかったチケットを次スプリントへ引き継ぎます。外すと履歴に残り、作業画面から外れます。</p>
          <div class="carryover-list">
            <label v-for="t in carryOverCandidates" :key="t.id" class="carryover-row" :data-testid="`carryover-row-${t.id}`">
              <input type="checkbox" :checked="carrySelected.has(t.id)" style="accent-color: var(--accent)" @change="toggleCarry(t.id)" />
              <span class="carryover-id">{{ t.id }}</span>
              <span class="carryover-title">{{ t.title }}</span>
            </label>
          </div>
        </div>
        <p v-if="dialogTarget === 'next'" class="carryover-hint">
          「開始」を押すと現在のスプリントは完了になり velocity が確定します。未完了チケットは上の選択に従って持ち越されます。
        </p>
        <p v-if="sprintError" class="msg-error" data-testid="sprint-error">{{ sprintError }}</p>
      </div>
      <div class="dialog-foot">
        <button class="btn-cancel" :disabled="sprintBusy" @click="showSprintDialog = false">キャンセル</button>
        <template v-if="dialogTarget === 'current'">
          <button class="btn-primary" :disabled="sprintBusy" data-testid="sprint-save" @click="saveSprint">
            保存
          </button>
        </template>
        <template v-else>
          <button class="btn-cancel" :disabled="sprintBusy" data-testid="sprint-save" @click="saveSprint">
            保存 (開始せず)
          </button>
          <button class="btn-primary" :disabled="sprintBusy" data-testid="sprint-start" @click="startNextSprint">
            現スプリントを完了して次を開始 →
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
  /* WC-30: 持ち越しリスト等で内容が増えても画面を超えない。head/foot 固定 + body だけスクロール。 */
  max-height: 90vh; display: flex; flex-direction: column;
}
.dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.dialog-title { font-family: var(--display); font-size: 20px; font-weight: 600; margin: 0; }
.close-btn { background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--ink-2); }
.dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex: 1; min-height: 0; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }
/* WC-30: 持ち越し確認チェックリスト */
.carryover-hint { color: var(--ink-3); font-size: 12px; margin: 2px 0 8px; line-height: 1.5; }
.carryover-list { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; }
.carryover-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.carryover-row:hover { background: var(--accent-bg, #fff3ee); }
.carryover-id { font-family: var(--mono); font-size: 11px; color: var(--ink-2); flex-shrink: 0; min-width: 74px; }
.carryover-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-1); }
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
.sprint-empty {
  font-size: 12.5px; color: var(--ink-2);
  background: var(--bg-2); border: var(--hairline) solid var(--line-1);
  border-radius: var(--radius); padding: 10px 12px; margin: 0 0 10px;
}
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
