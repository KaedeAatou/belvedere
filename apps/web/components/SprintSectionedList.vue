<script setup lang="ts">
// 儀式画面の 3 区画共通ビュー (Wave 1 / 2026-06-13)。
// Backlog / Refinement / Planning が共有する「CURRENT / NEXT / BACKLOG」セクションリスト。
//
// 区画内 d&d 並び替え: 各区画に独立した useTicketReorder インスタンスを持つ。
// 区画跨ぎ d&d 移動: ドラッグ開始区画とドロップ先区画が異なれば moveToSection を emit する
//   (親が patchTicket で sprintId を current=activeSprint.id / next=nextPlanned.id / backlog=null に変更)。
// within vs across の判別: dragSection (開始区画) と drop 先の区画を比較。同区画なら reorder、別区画なら move。

import type { Ticket, Priority, TicketType, Member, Sprint } from '@belvedere/shared';

type SectionKey = 'current' | 'next' | 'backlog';

const props = defineProps<{
  current: Ticket[];
  next: Ticket[];
  backlog: Ticket[];
  selectedId: string | null;
  members: Member[];
  sprints: Sprint[];
  /** CURRENT セクションのラベル (例: "Sprint 13")。 */
  currentLabel?: string;
  /** NEXT セクションのラベル (例: "Sprint 14 (planned)")。 */
  nextLabel?: string;
  /** 作成ダイアログの種別セレクタに出す候補。incident/bug は全画面、story は Backlog のみ。 */
  allowedTypes: TicketType[];
  /** 各行 #extra スロット用に finding ピル等を行が描く前提なので追加 props は不要。 */
}>();

const emit = defineEmits<{
  select: [id: string];
  /** 区画跨ぎ移動 (sprintId 変更)。親が patch する。 */
  moveToSection: [ticketId: string, section: SectionKey];
  /** 作成成功後 (親で findings 再取得などに使う)。 */
  created: [];
}>();

// 各行右の追加スロット (Refinement の「ポーカー開始」等)。デフォルトは StatusDot のみ。
defineSlots<{
  'row-extra'(props: { ticket: Ticket }): unknown;
}>();

const { createTicket, patchTicket, isLoading: createLoading, error: liveError } = useTickets();
const { findingsFor, refresh: refreshFindings } = useFindings();

// 複数選択 (全区画跨ぎ選択可)。BulkActionBar は上部に 1 つ。
const sel = useTicketSelection();
const allVisibleIds = computed(() => [
  ...props.current.map((t) => t.id),
  ...props.next.map((t) => t.id),
  ...props.backlog.map((t) => t.id),
]);

// ===== ドラッグ中の発生区画を記録 (within vs across 判別) =====
const dragSection = ref<SectionKey | null>(null);

// ===== 各区画の独立した並び替えインスタンス =====
const currentSorted = computed(() => props.current);
const nextSorted = computed(() => props.next);
const backlogSorted = computed(() => props.backlog);

const currentReorder = useTicketReorder({ sorted: currentSorted, patch: (id, body) => patchTicket(id, body) });
const nextReorder = useTicketReorder({ sorted: nextSorted, patch: (id, body) => patchTicket(id, body) });
const backlogReorder = useTicketReorder({ sorted: backlogSorted, patch: (id, body) => patchTicket(id, body) });

function reorderFor(section: SectionKey) {
  return section === 'current' ? currentReorder : section === 'next' ? nextReorder : backlogReorder;
}

function onReorderStart(section: SectionKey, id: string): void {
  dragSection.value = section;
  reorderFor(section).onReorderStart(id);
}

function onReorderOver(section: SectionKey, id: string, e: DragEvent): void {
  // 同区画内のドラッグのみ行内インジケータ (before/after ライン) を出す。
  if (dragSection.value !== section) return;
  reorderFor(section).onReorderOver(id, e);
}

function onReorderDrop(section: SectionKey, id: string): void {
  const from = dragSection.value;
  if (from === section) {
    // within-section: 通常の並び替え。
    void reorderFor(section).onReorderDrop(id);
  } else if (from) {
    // across-section: sprintId 変更。draggingId は drop 側区画には無いので
    // 発生区画の onReorderEnd で状態を掃除しつつ、移動だけ emit する。
    const draggedId = reorderFor(from).draggingId.value;
    reorderFor(from).onReorderEnd();
    if (draggedId) emit('moveToSection', draggedId, section);
  }
  dragSection.value = null;
}

function onReorderEnd(section: SectionKey): void {
  reorderFor(section).onReorderEnd();
  dragSection.value = null;
}

// セクションのボディ/ヘッダにドロップ (空区画や行間以外へ落とした場合の区画跨ぎ移動)。
function onSectionDrop(section: SectionKey, e: DragEvent): void {
  e.preventDefault();
  const from = dragSection.value;
  if (!from || from === section) {
    // 同区画 or 不明なら何もしない (行の drop ハンドラに委ねる)。
    dragSection.value = null;
    return;
  }
  const draggedId = reorderFor(from).draggingId.value;
  reorderFor(from).onReorderEnd();
  dragSection.value = null;
  if (draggedId) emit('moveToSection', draggedId, section);
}

function onSectionDragOver(section: SectionKey, e: DragEvent): void {
  // 区画跨ぎドロップを受け付けるため dragover で preventDefault。
  if (dragSection.value && dragSection.value !== section) e.preventDefault();
}

// ===== セクション統計 =====
function stats(list: Ticket[]) {
  return {
    count: list.length,
    sp: list.reduce((n, t) => n + (t.estimatePt ?? 0), 0),
    flagged: list.filter((t) => findingsFor(t.id).length > 0).length,
  };
}
const currentStats = computed(() => stats(props.current));
const nextStats = computed(() => stats(props.next));
const backlogStats = computed(() => stats(props.backlog));

// ===== 新規作成ダイアログ (allowedTypes で種別を制限) =====
const showCreateDialog = ref(false);
const newTitle = ref('');
const newType = ref<TicketType>(props.allowedTypes[0] ?? 'task');
const newPriority = ref<Priority>('medium');
const newEstimatePt = ref<number | null>(null);
const newTimebox = ref<number | null>(null);
const createError = ref<string | null>(null);

const suggestSpike = computed(
  () => props.allowedTypes.includes('spike') && /(調査|検証|比較|スパイク)/.test(newTitle.value) && newType.value !== 'spike',
);
function applySpike(): void { newType.value = 'spike'; }

function openCreate(): void {
  newTitle.value = '';
  newType.value = props.allowedTypes[0] ?? 'task';
  newPriority.value = 'medium';
  newEstimatePt.value = null;
  newTimebox.value = null;
  createError.value = null;
  showCreateDialog.value = true;
}

defineExpose({ openCreate });

// U-2: ESC で作成ダイアログを閉じる (入力中は無視)。
onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (showCreateDialog.value) { e.stopPropagation(); showCreateDialog.value = false; }
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
    if (newEstimatePt.value !== null) input.estimatePt = newEstimatePt.value;
  }
  const created = await createTicket(input);
  if (created) {
    showCreateDialog.value = false;
    void refreshFindings();
    emit('created');
  } else {
    createError.value = liveError.value ?? 'API 呼出失敗';
  }
}
</script>

<template>
  <div class="screen-body" data-testid="live-section">
    <BulkActionBar
      v-if="sel.count.value > 0"
      :count="sel.count.value"
      :members="members"
      :sprints="sprints"
      :busy="sel.isBusy.value"
      @set-status="(s) => sel.applyToSelected({ status: s })"
      @set-assignee="(a) => sel.applyToSelected({ assigneeId: a })"
      @set-priority="(p) => sel.applyToSelected({ priority: p })"
      @set-value-impact="(v) => sel.applyToSelected({ valueImpact: v })"
      @set-sprint="(sp) => sel.applyToSelected({ sprintId: sp })"
      @remove="sel.removeSelected"
      @clear="sel.clear"
      @select-all="() => sel.selectMany(allVisibleIds)"
    />

    <!-- CURRENT SPRINT -->
    <div class="backlog-section" data-testid="section-current"
         @dragover="(e) => onSectionDragOver('current', e)"
         @drop="(e) => onSectionDrop('current', e)">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">{{ currentLabel ?? 'Current Sprint' }}</span>
        <span class="chip amber solid">CURRENT</span>
        <div class="meta">
          <span><b>{{ currentStats.count }}</b> issues</span>
          <span><b>{{ currentStats.sp }}</b> SP</span>
          <span><b>{{ currentStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in current" :key="t.id" :t="t" data-testid="live-ticket"
                 :selected="selectedId === t.id" drag-handle reorderable
                 selectable :bulk-selected="sel.isSelected(t.id)"
                 :drop-edge="currentReorder.dropEdgeFor(t.id)"
                 @click="emit('select', t.id)"
                 @toggle-select="sel.toggle(t.id)"
                 @reorder-start="onReorderStart('current', t.id)"
                 @reorder-over="(e) => onReorderOver('current', t.id, e)"
                 @reorder-drop="onReorderDrop('current', t.id)"
                 @reorder-end="onReorderEnd('current')">
        <template #extra>
          <slot name="row-extra" :ticket="t" />
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
      <p v-if="current.length === 0" class="live-msg">アクティブスプリントにチケットがありません。</p>
    </div>

    <!-- NEXT SPRINT -->
    <div class="backlog-section" data-testid="section-next"
         @dragover="(e) => onSectionDragOver('next', e)"
         @drop="(e) => onSectionDrop('next', e)">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">{{ nextLabel ?? 'Next Sprint' }}</span>
        <span class="chip amber">NEXT</span>
        <div class="meta">
          <span><b>{{ nextStats.count }}</b> issues</span>
          <span><b>{{ nextStats.sp }}</b> SP</span>
          <span><b>{{ nextStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <TicketRow v-for="t in next" :key="t.id" :t="t" data-testid="live-ticket"
                 :selected="selectedId === t.id" drag-handle reorderable
                 selectable :bulk-selected="sel.isSelected(t.id)"
                 :drop-edge="nextReorder.dropEdgeFor(t.id)"
                 @click="emit('select', t.id)"
                 @toggle-select="sel.toggle(t.id)"
                 @reorder-start="onReorderStart('next', t.id)"
                 @reorder-over="(e) => onReorderOver('next', t.id, e)"
                 @reorder-drop="onReorderDrop('next', t.id)"
                 @reorder-end="onReorderEnd('next')">
        <template #extra>
          <slot name="row-extra" :ticket="t" />
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
      <p v-if="next.length === 0" class="live-msg">計画中スプリントにチケットがありません。</p>
    </div>

    <!-- BACKLOG (未スケジュール) -->
    <div class="backlog-section" data-testid="section-backlog"
         @dragover="(e) => onSectionDragOver('backlog', e)"
         @drop="(e) => onSectionDrop('backlog', e)">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Backlog</span>
        <span class="chip">UNSCHEDULED</span>
        <div class="meta">
          <span><b>{{ backlogStats.count }}</b> issues</span>
          <span><b>{{ backlogStats.sp }}</b> SP</span>
          <span><b>{{ backlogStats.flagged }}</b> flagged</span>
        </div>
        <button class="h-btn" data-testid="section-new-ticket-btn" style="margin-left: 16px"
                @click="openCreate"><Icon name="plus" /> New issue</button>
      </div>
      <TicketRow v-for="t in backlog" :key="t.id" :t="t" data-testid="live-ticket"
                 :selected="selectedId === t.id" drag-handle reorderable
                 selectable :bulk-selected="sel.isSelected(t.id)"
                 :drop-edge="backlogReorder.dropEdgeFor(t.id)"
                 @click="emit('select', t.id)"
                 @toggle-select="sel.toggle(t.id)"
                 @reorder-start="onReorderStart('backlog', t.id)"
                 @reorder-over="(e) => onReorderOver('backlog', t.id, e)"
                 @reorder-drop="onReorderDrop('backlog', t.id)"
                 @reorder-end="onReorderEnd('backlog')">
        <template #extra>
          <slot name="row-extra" :ticket="t" />
          <StatusDot :status="t.status" />
        </template>
      </TicketRow>
      <p v-if="backlog.length === 0" class="live-msg">未スケジュールのチケットはありません。</p>
    </div>
  </div>

  <!-- 新規作成ダイアログ (allowedTypes で種別制限) -->
  <div v-if="showCreateDialog" class="dialog-overlay" data-testid="create-dialog" @click.self="showCreateDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">新規チケット</h2>
        <button class="close-btn" @click="showCreateDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <div class="field">
          <label class="label" for="ssl-new-title">タイトル <span class="req">*</span></label>
          <input
            id="ssl-new-title"
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
            <label class="label" for="ssl-new-type">種別</label>
            <select id="ssl-new-type" v-model="newType" data-testid="new-ticket-type" class="select-input">
              <option v-for="tp in allowedTypes" :key="tp" :value="tp">{{ tp }}</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="ssl-new-priority">優先度</label>
            <select id="ssl-new-priority" v-model="newPriority" data-testid="new-ticket-priority" class="select-input">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div v-if="newType === 'spike'" class="field">
            <label class="label" for="ssl-new-timebox">Timebox (時間)</label>
            <input
              id="ssl-new-timebox"
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
            <label class="label" for="ssl-new-sp">Story Point (任意)</label>
            <input
              id="ssl-new-sp"
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

/* ダイアログ (BacklogScreen と同系。scoped で持つ) */
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
  font-family: var(--sans); font-size: 14px;
}
.text-input:focus, .select-input:focus { outline: none; border-color: var(--accent); }
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
.btn-primary {
  padding: 8px 20px; background: var(--ink-0); color: var(--bg-0);
  border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: var(--ink-1); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
