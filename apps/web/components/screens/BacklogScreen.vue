<script setup lang="ts">
import type { Ticket, Priority, TicketType } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint } = useSprints();
const { createTicket, isLoading: createLoading, error: liveError } = useTickets();
const { findingsFor, findingsByTicket, refresh: refreshFindings } = useFindings();

// active sprint のチケット / それ以外 (= プロダクトバックログ) に二分
const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);
const backlogTickets = computed(() => {
  const activeId = activeSprint.value?.id;
  // active sprint が無い (未取得 / 未設定) ときは全チケットを backlog 扱いにする。
  // (filter(sprintId !== undefined) だと sprintId 無しチケットが両区画から漏れるため)
  if (!activeId) return props.tickets;
  return props.tickets.filter((t) => t.sprintId !== activeId);
});

// ルールエンジン findings 集計 (T5-3)
function flagCount(t: Ticket): number { return findingsFor(t.id).length; }
const noSP = computed(() => props.tickets.filter((t) => findingsFor(t.id).some((f) => f.ruleId === 'STORY_SP_MISSING')).length);
const noAcc = computed(() => props.tickets.filter((t) => findingsFor(t.id).some((f) => f.ruleId === 'STORY_DOD_MISSING')).length);
const totalSP = computed(() => props.tickets.reduce((n, t) => n + (t.estimatePt ?? 0), 0));

const sprintStats = computed(() => ({
  count: sprintTickets.value.length,
  sp: sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0),
  flagged: sprintTickets.value.filter((t) => flagCount(t) > 0).length,
}));
const backlogStats = computed(() => ({
  count: backlogTickets.value.length,
  sp: backlogTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0),
  flagged: backlogTickets.value.filter((t) => flagCount(t) > 0).length,
}));

const sprintLabel = computed(() => (activeSprint.value ? `Sprint ${activeSprint.value.number}` : 'Current Sprint'));

// 新規作成ダイアログ
const showCreateDialog = ref(false);
const newTitle = ref('');
const newType = ref<TicketType>('story');
const newPriority = ref<Priority>('medium');
const newEstimatePt = ref<number | null>(null);
const newTimebox = ref<number | null>(null);
const createError = ref<string | null>(null);

// 調査系タイトルなら Spike を推奨 (inline 提案)
const suggestSpike = computed(() => /(調査|検証|比較|スパイク)/.test(newTitle.value) && newType.value !== 'spike');
function applySpike(): void { newType.value = 'spike'; }

function openCreate(): void {
  newTitle.value = '';
  newType.value = 'story';
  newPriority.value = 'medium';
  newEstimatePt.value = null;
  newTimebox.value = null;
  createError.value = null;
  showCreateDialog.value = true;
}

// D-13 + U-2: kbd C で作成ダイアログを開く / ESC で閉じる
onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (isInput) return;
      if (showCreateDialog.value) { e.stopPropagation(); showCreateDialog.value = false; }
      return;
    }
    if (e.key === 'c' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey && !showCreateDialog.value) {
      e.preventDefault();
      openCreate();
    }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});

async function submitCreate(): Promise<void> {
  createError.value = null;
  if (!newTitle.value.trim()) {
    createError.value = 'タイトルは必須です';
    return;
  }
  const input: { title: string; priority: Priority; type: TicketType; estimatePt?: number; timeboxHours?: number } = {
    title: newTitle.value.trim(),
    priority: newPriority.value,
    type: newType.value,
  };
  if (newType.value === 'spike') {
    if (newTimebox.value !== null) input.timeboxHours = newTimebox.value;
  } else if (newType.value !== 'task') {
    // Task は SP を使わない。story / bug / incident のみ SP を送る
    if (newEstimatePt.value !== null) input.estimatePt = newEstimatePt.value;
  }
  const created = await createTicket(input);
  if (created) {
    showCreateDialog.value = false;
    void refreshFindings(); // 新規チケットの指摘を反映
  } else {
    createError.value = liveError.value ?? 'API 呼出失敗';
  }
}
</script>

<template>
  <div class="screen-head">
    <div class="stat-row">
      <div class="stat"><div class="label">Total</div><div class="v t-num">{{ tickets.length }}</div><div class="delta">issues</div></div>
      <div class="stat"><div class="label">No SP</div><div class="v t-num accent">{{ noSP }}</div><div class="delta">unestimated</div></div>
      <div class="stat"><div class="label">No AC</div><div class="v t-num accent">{{ noAcc }}</div><div class="delta">unverifiable</div></div>
      <div class="stat"><div class="label">Σ Points</div><div class="v t-num">{{ totalSP }}</div><div class="delta">SP</div></div>
    </div>
  </div>

  <div class="backlog-toolbar">
    <button class="h-btn"><Icon name="filter" /> Filter</button>
    <button class="h-btn"><Icon name="sort" /> Group: Sprint</button>
    <button class="h-btn"><Icon name="sparkle" /> AI: Show only flagged</button>
    <span class="spacer" />
    <button class="h-btn" data-testid="new-ticket-btn" @click="openCreate"><Icon name="plus" /> New issue <span class="kbd">C</span></button>
  </div>

  <div class="screen-body" data-testid="live-section">
    <p v-if="createLoading && tickets.length === 0" class="live-msg">読み込み中…</p>
    <p v-else-if="liveError && tickets.length === 0" class="live-msg live-error">取得失敗: {{ liveError }}</p>

    <!-- active sprint -->
    <div class="backlog-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">{{ sprintLabel }}</span>
        <span class="chip amber solid">CURRENT</span>
        <div class="meta">
          <span><b>{{ sprintStats.count }}</b> issues</span>
          <span><b>{{ sprintStats.sp }}</b> SP</span>
          <span><b>{{ sprintStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in sprintTickets" :key="t.id" :t="t" data-testid="live-ticket"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)">
        <template #extra>
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
      <p v-if="sprintTickets.length === 0" class="live-msg">アクティブスプリントにチケットがありません。</p>
    </div>

    <!-- product backlog -->
    <div class="backlog-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Backlog</span>
        <span class="chip">UNSCHEDULED</span>
        <div class="meta">
          <span><b>{{ backlogStats.count }}</b> issues</span>
          <span><b>{{ backlogStats.sp }}</b> SP</span>
          <span><b>{{ backlogStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in backlogTickets" :key="t.id" :t="t" data-testid="live-ticket"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)">
        <template #extra>
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
      <p v-if="backlogTickets.length === 0" class="live-msg">まだチケットがありません。「+ New issue」で作成してください。</p>
    </div>
  </div>

  <!-- 新規作成ダイアログ (Phase 1-C) -->
  <div v-if="showCreateDialog" class="dialog-overlay" data-testid="create-dialog" @click.self="showCreateDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">新規チケット</h2>
        <button class="close-btn" @click="showCreateDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <div class="field">
          <label class="label" for="new-title">タイトル <span class="req">*</span></label>
          <input
            id="new-title"
            v-model="newTitle"
            data-testid="new-ticket-title"
            type="text"
            class="text-input"
            maxlength="200"
            placeholder="例: ログイン画面の入力 validation を追加"
          />
        </div>
        <div v-if="suggestSpike" class="spike-hint">
          <span>💡 調査系のタイトルです。Spike にしますか?</span>
          <button type="button" class="spike-btn" data-testid="suggest-spike" @click="applySpike">Spike にする</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="label" for="new-type">種別</label>
            <select id="new-type" v-model="newType" data-testid="new-ticket-type" class="select-input">
              <option value="story">story</option>
              <option value="task">task</option>
              <option value="spike">spike</option>
              <option value="bug">bug</option>
              <option value="incident">incident</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="new-priority">優先度</label>
            <select id="new-priority" v-model="newPriority" data-testid="new-ticket-priority" class="select-input">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div v-if="newType === 'spike'" class="field">
            <label class="label" for="new-timebox">Timebox (時間)</label>
            <input
              id="new-timebox"
              v-model.number="newTimebox"
              data-testid="new-ticket-timebox"
              type="number"
              class="text-input"
              min="0"
              max="80"
              placeholder="4"
            />
          </div>
          <div v-else-if="newType !== 'task'" class="field">
            <label class="label" for="new-sp">Story Point (任意)</label>
            <input
              id="new-sp"
              v-model.number="newEstimatePt"
              type="number"
              class="text-input"
              min="0"
              max="100"
            />
          </div>
        </div>
        <p v-if="createError" class="msg-error" data-testid="create-error">{{ createError }}</p>
      </div>
      <div class="dialog-foot">
        <button class="btn-cancel" @click="showCreateDialog = false">キャンセル</button>
        <button class="btn-primary" data-testid="submit-create" :disabled="createLoading" @click="submitCreate">
          {{ createLoading ? '作成中…' : '作成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-msg {
  padding: 12px 16px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
}
.live-msg.live-error {
  color: var(--err);
}

/* ダイアログ */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 8, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.dialog {
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  width: 100%;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(8, 8, 8, 0.12);
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.dialog-title {
  font-family: var(--display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--ink-2);
}
.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-row {
  display: flex;
  gap: 12px;
}
.field-row .field {
  flex: 1;
}
.label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.req { color: var(--accent); }
.spike-hint {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--accent-dim);
  background: var(--accent-bg);
  border-radius: var(--radius);
  font-size: 12px; color: var(--ink-1);
}
.spike-btn {
  margin-left: auto;
  padding: 4px 10px;
  background: var(--accent); color: #FBF8F2;
  border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; cursor: pointer;
  white-space: nowrap;
}
.text-input, .select-input {
  padding: 10px 12px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans);
  font-size: 14px;
}
.text-input:focus, .select-input:focus {
  outline: none;
  border-color: var(--accent);
}
.msg-error {
  color: var(--err);
  font-size: 12px;
  margin: 0;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: var(--hairline) solid var(--line-1);
}
.btn-cancel {
  padding: 8px 16px;
  background: transparent;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 13px;
  cursor: pointer;
}
.btn-primary {
  padding: 8px 20px;
  background: var(--ink-0);
  color: var(--bg-0);
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) {
  background: var(--ink-1);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
