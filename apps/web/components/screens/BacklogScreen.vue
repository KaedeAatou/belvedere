<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';

const props = defineProps<{
  tickets: DemoTicket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const sprintTickets = computed(() => props.tickets.filter((t) => t.sprint === 'S24'));
const backlogTickets = computed(() => props.tickets.filter((t) => !t.sprint));
const issueCount = computed(() => props.tickets.reduce((n, t) => n + (t.flags?.length ?? 0), 0));
const noSP = computed(() => props.tickets.filter((t) => t.flags.includes('no-points')).length);
const noAcc = computed(() => props.tickets.filter((t) => t.flags.includes('no-acceptance')).length);
const totalSP = computed(() => props.tickets.reduce((n, t) => n + (t.sp ?? 0), 0));

// 実 API データセクション (Phase 1-C / 2026-06-11)
// Demo data と並行表示、Phase 1-C 後半で完全置換予定
const { tickets: liveTickets, isLoading: liveLoading, error: liveError, fetchTickets, createTicket } = useTickets();
onMounted(() => { fetchTickets(); });

// 新規作成ダイアログ
const showCreateDialog = ref(false);
const newTitle = ref('');
const newPriority = ref<'low' | 'medium' | 'high' | 'urgent'>('medium');
const newEstimatePt = ref<number | null>(null);
const createError = ref<string | null>(null);

function openCreate(): void {
  newTitle.value = '';
  newPriority.value = 'medium';
  newEstimatePt.value = null;
  createError.value = null;
  showCreateDialog.value = true;
}

async function submitCreate(): Promise<void> {
  createError.value = null;
  if (!newTitle.value.trim()) {
    createError.value = 'タイトルは必須です';
    return;
  }
  const input: { title: string; priority: 'low' | 'medium' | 'high' | 'urgent'; estimatePt?: number } = {
    title: newTitle.value.trim(),
    priority: newPriority.value,
  };
  if (newEstimatePt.value !== null) input.estimatePt = newEstimatePt.value;
  const created = await createTicket(input);
  if (created) {
    showCreateDialog.value = false;
  } else {
    createError.value = liveError.value ?? 'API 呼出失敗';
  }
}

const sprintStats = computed(() => ({
  count: sprintTickets.value.length,
  sp: sprintTickets.value.reduce((n, t) => n + (t.sp ?? 0), 0),
  flagged: sprintTickets.value.filter((t) => t.flags.length).length,
}));
const backlogStats = computed(() => ({
  count: backlogTickets.value.length,
  sp: backlogTickets.value.reduce((n, t) => n + (t.sp ?? 0), 0),
  flagged: backlogTickets.value.filter((t) => t.flags.length).length,
}));
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 00 / BACKLOG</div>
      <h1>Backlog</h1>
      <div class="subtitle">
        プロダクト全体の在庫。AIが <span style="color: var(--accent)">{{ issueCount }}件</span> の形骸化リスクを検出しています。
      </div>
    </div>
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

  <div class="screen-body">
    <div class="backlog-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Sprint 24 — Spiral</span>
        <span class="chip amber solid">CURRENT</span>
        <span class="t-cap">Apr 21 → May 04</span>
        <div class="meta">
          <span><b>{{ sprintStats.count }}</b> issues</span>
          <span><b>{{ sprintStats.sp }}</b> SP</span>
          <span><b>{{ sprintStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in sprintTickets" :key="t.id" :t="t"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)">
        <template #extra>
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
    </div>

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
      <TicketRow v-for="t in backlogTickets" :key="t.id" :t="t"
                 :selected="selectedId === t.id" drag-handle
                 @click="emit('select', t.id)" />
    </div>

    <!-- Phase 1-C 実 API データセクション (Demo data とは別、新規作成はここに反映) -->
    <div class="backlog-section live-section" data-testid="live-section">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Live (実 API)</span>
        <span class="chip amber solid">PHASE 1-C</span>
        <div class="meta">
          <span><b>{{ liveTickets.length }}</b> issues</span>
        </div>
      </div>
      <p v-if="liveLoading && liveTickets.length === 0" class="live-msg">読み込み中…</p>
      <p v-else-if="liveError" class="live-msg live-error">取得失敗: {{ liveError }}</p>
      <p v-else-if="liveTickets.length === 0" class="live-msg">まだチケットがありません。「+ New issue」で作成してください。</p>
      <ul v-else class="live-list" data-testid="live-tickets">
        <li v-for="t in liveTickets" :key="t.id" class="live-row" data-testid="live-ticket">
          <span class="live-id">{{ t.id }}</span>
          <span class="live-title">{{ t.title }}</span>
          <span class="live-priority" :data-priority="t.priority">{{ t.priority }}</span>
          <span v-if="t.estimatePt !== undefined" class="live-sp">{{ t.estimatePt }} SP</span>
        </li>
      </ul>
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
        <div class="field-row">
          <div class="field">
            <label class="label" for="new-priority">優先度</label>
            <select id="new-priority" v-model="newPriority" data-testid="new-ticket-priority" class="select-input">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </div>
          <div class="field">
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
        <button class="btn-primary" data-testid="submit-create" :disabled="liveLoading" @click="submitCreate">
          {{ liveLoading ? '作成中…' : '作成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-section {
  border-top: 2px solid var(--accent);
  padding-top: 16px;
  margin-top: 24px;
}
.live-msg {
  padding: 12px 16px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
}
.live-msg.live-error {
  color: var(--err);
}
.live-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.live-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: var(--hairline) solid var(--line-1);
  font-family: var(--sans);
  font-size: 13px;
}
.live-row:hover {
  background: var(--bg-3);
}
.live-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  min-width: 80px;
}
.live-title {
  flex: 1;
  color: var(--ink-0);
}
.live-priority {
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  background: var(--bg-3);
  color: var(--ink-2);
}
.live-priority[data-priority='urgent'] {
  background: rgba(184, 90, 74, 0.15);
  color: var(--err);
}
.live-priority[data-priority='high'] {
  background: rgba(217, 83, 0, 0.12);
  color: var(--accent);
}
.live-sp {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
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
