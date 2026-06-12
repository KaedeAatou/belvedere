<script setup lang="ts">
import type { Ticket, Priority, ValueImpact, Status } from '@belvedere/shared';
import type { PatchTicketInput } from '~/composables/useTickets';

const props = defineProps<{ ticket: Ticket }>();
const emit = defineEmits<{ close: [] }>();

const { memberName, members } = useMembers();
const { findingsFor, refresh: refreshFindings } = useFindings();
const { patchTicket, deleteTicket } = useTickets();
const { sprints } = useSprints();

const findings = computed(() => findingsFor(props.ticket.id));
const ownerName = computed(() => memberName(props.ticket.assigneeId));

// ===== 編集モード (T10-1) =====
const editing = ref(false);
const saving = ref(false);
const editError = ref<string | null>(null);
const editTitle = ref('');
const editDescription = ref('');
const editAssignee = ref('');
const editPriority = ref<Priority>('medium');
const editValueImpact = ref<ValueImpact | ''>('');
const editStatus = ref<Status>('backlog');
const editAC = ref('');       // 改行区切りの AC テキスト
const editSprintId = ref(''); // 空文字 = 未割当/変更なし

function startEdit(): void {
  editTitle.value = props.ticket.title;
  editDescription.value = props.ticket.description ?? '';
  editAssignee.value = props.ticket.assigneeId ?? '';
  editPriority.value = props.ticket.priority;
  editValueImpact.value = props.ticket.valueImpact ?? '';
  editStatus.value = props.ticket.status;
  editAC.value = (props.ticket.acceptanceCriteria ?? []).join('\n');
  editSprintId.value = props.ticket.sprintId ?? '';
  editError.value = null;
  editing.value = true;
}
function cancelEdit(): void { editing.value = false; }

async function saveEdit(): Promise<void> {
  editError.value = null;
  if (!editTitle.value.trim()) { editError.value = 'タイトルは必須です'; return; }
  saving.value = true;
  // estimatePt は編集対象外 (SP はポーカー経由 / T7)
  const patch: PatchTicketInput = {
    title: editTitle.value.trim(),
    description: editDescription.value,
    priority: editPriority.value,
    status: editStatus.value,
    acceptanceCriteria: editAC.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  };
  if (editAssignee.value) patch.assigneeId = editAssignee.value;
  if (editValueImpact.value) patch.valueImpact = editValueImpact.value;
  // sprintId: API は null/空での解除をサポートしないため、選択がある場合のみ送信する。
  // 「バックログ (なし)」選択肢は提供しない (解除不可のため)。
  if (editSprintId.value) patch.sprintId = editSprintId.value;
  const updated = await patchTicket(props.ticket.id, patch);
  saving.value = false;
  if (updated) {
    editing.value = false;
    void refreshFindings(); // 編集で指摘が解消され得る
  } else {
    editError.value = '保存に失敗しました';
  }
}

// ===== チケット ID コピー (T-6) =====
const idCopied = ref(false);
function copyId(): void {
  void navigator.clipboard.writeText(props.ticket.id).then(() => {
    idCopied.value = true;
    setTimeout(() => { idCopied.value = false; }, 1500);
  });
}

// ===== 2 段階削除 (T10-2) =====
const deleteArmed = ref(false);
let deleteTimer: ReturnType<typeof setTimeout> | null = null;

function onDelete(): void {
  if (!deleteArmed.value) {
    deleteArmed.value = true;
    deleteTimer = setTimeout(() => { deleteArmed.value = false; }, 3000);
    return;
  }
  if (deleteTimer) clearTimeout(deleteTimer);
  void doDelete();
}
async function doDelete(): Promise<void> {
  const ok = await deleteTicket(props.ticket.id);
  if (ok) {
    void refreshFindings();
    emit('close');
  }
}
onUnmounted(() => { if (deleteTimer) clearTimeout(deleteTimer); });
</script>

<template>
  <div class="sheet-mask" @click="emit('close')" />
  <div class="sheet" @click.stop>
    <div class="sheet-head">
      <TypeMark :type="ticket.type" />
      <button class="id-copy-btn" :title="idCopied ? 'コピーしました' : 'クリックでコピー'" @click="copyId">
        <span class="t-mono" style="font-size: 11px; color: var(--ink-2)">{{ ticket.id }}</span>
        <span v-if="idCopied" class="id-copied">コピーしました</span>
      </button>
      <StatusDot :status="ticket.status" />
      <StoryPoints :value="ticket.estimatePt ?? null" :critical="ticket.estimatePt == null" />
      <span style="flex: 1" />
      <template v-if="editing">
        <button class="ibtn-text" :disabled="saving" data-testid="save-ticket" @click="saveEdit">{{ saving ? '保存中…' : '保存' }}</button>
        <button class="ibtn-text" @click="cancelEdit">キャンセル</button>
      </template>
      <button v-else class="ibtn-text" data-testid="edit-ticket" @click="startEdit">編集</button>
      <button class="ibtn" @click="emit('close')"><Icon name="x" /></button>
    </div>

    <div class="sheet-body">
      <!-- title -->
      <input v-if="editing" v-model="editTitle" class="edit-title" data-testid="edit-title" maxlength="200" />
      <h2 v-else>{{ ticket.title }}</h2>

      <div style="display: flex; gap: 10px; align-items: center; margin: 12px 0 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
        <Avatar :user="ticket.assigneeId" />
        <span>{{ ownerName }}</span>
        <span style="color: var(--ink-4)">·</span>
        <span>Updated {{ ticket.updatedAt?.slice(0, 10) ?? '—' }}</span>
        <template v-if="ticket.sprintId">
          <span style="color: var(--ink-4)">·</span>
          <span>{{ ticket.sprintId }}</span>
        </template>
      </div>

      <!-- 編集フィールド (assignee / priority / valueImpact / status / sprint) -->
      <div v-if="editing" class="edit-fields">
        <div class="edit-field">
          <label class="l">STATUS</label>
          <select v-model="editStatus" class="edit-input" data-testid="sheet-edit-status">
            <option value="backlog">backlog</option>
            <option value="todo">todo</option>
            <option value="in-progress">in-progress</option>
            <option value="review">review</option>
            <option value="done">done</option>
          </select>
        </div>
        <div class="edit-field">
          <label class="l">ASSIGNEE</label>
          <select v-model="editAssignee" class="edit-input" data-testid="edit-assignee">
            <option value="">（未割当）</option>
            <option v-for="m in members" :key="m.userId" :value="m.userId">{{ m.displayName }}</option>
          </select>
        </div>
        <div class="edit-field">
          <label class="l">PRIORITY</label>
          <select v-model="editPriority" class="edit-input" data-testid="edit-priority">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
        </div>
        <div class="edit-field">
          <label class="l">VALUE IMPACT</label>
          <select v-model="editValueImpact" class="edit-input" data-testid="edit-value-impact">
            <option value="">（未設定）</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <div class="edit-field">
          <label class="l">SPRINT</label>
          <!-- sprintId 解除は API 非対応 (z.string() のみ / null 不可) のため「なし」選択肢は出さない。
               未割当チケットは空値のまま → 保存時に sprintId を送らず現状維持。 -->
          <select v-model="editSprintId" class="edit-input" data-testid="sheet-edit-sprint">
            <option v-if="!ticket.sprintId" value="">（未割当）</option>
            <option v-for="s in sprints" :key="s.id" :value="s.id">
              S{{ s.number }} {{ s.goal.slice(0, 20) }}{{ s.goal.length > 20 ? '…' : '' }}
            </option>
          </select>
        </div>
      </div>

      <!-- Description -->
      <div class="field">
        <div class="l">DESCRIPTION</div>
        <textarea v-if="editing" v-model="editDescription" class="edit-input edit-textarea" data-testid="edit-description" rows="4" />
        <template v-else>
          <div v-if="ticket.description" style="font-size: 13.5px; line-height: 1.6; white-space: pre-wrap">{{ ticket.description }}</div>
          <div v-else
               style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
            <span style="color: var(--accent); font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em">説明なし　</span>
            詳細・ユーザーストーリーが記述されていません。
          </div>
        </template>
      </div>

      <p v-if="editError" class="edit-err" data-testid="edit-error">{{ editError }}</p>

      <!-- Acceptance -->
      <div class="field">
        <div class="l">ACCEPTANCE CRITERIA</div>
        <textarea
          v-if="editing"
          v-model="editAC"
          class="edit-input edit-textarea"
          data-testid="sheet-edit-ac"
          rows="5"
          placeholder="1行1項目で入力"
        />
        <template v-else>
          <div v-if="ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0" class="ac-list">
            <div v-for="(a, i) in ticket.acceptanceCriteria" :key="i" class="ac">
              <span class="check" />
              <span>{{ a }}</span>
            </div>
          </div>
          <div v-else
               style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
            受け入れ条件が未定義です。
          </div>
        </template>
      </div>

      <!-- AI Integrity (ルールエンジン findings) -->
      <div v-if="findings.length > 0" class="field">
        <div class="l" style="color: var(--accent)">AI INTEGRITY · {{ findings.length }} ISSUE{{ findings.length > 1 ? 'S' : '' }}</div>
        <div class="flag-stack">
          <div v-for="f in findings" :key="f.ruleId" :class="['flag-card', f.severity === 'error' && 'err']">
            <span :style="{ color: f.severity === 'error' ? 'var(--accent)' : 'var(--ink-2)' }"><Icon name="warn" /></span>
            <div>
              <div class="lab">{{ findingLabel(f) }}</div>
              <div class="desc">{{ f.message }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="field">
        <div class="l" style="color: var(--ok)">AI INTEGRITY · CLEAN</div>
        <div style="font-size: 12px; color: var(--ink-2); border: 1px solid var(--line-2); padding: 8px 10px">
          <span style="color: var(--ok)"><Icon name="check" /></span>
          <span style="margin-left: 8px">形骸化リスクは検出されていません。</span>
        </div>
      </div>

      <!-- 見積もりポーカー (story のみ / T7) -->
      <EstimationPanel v-if="ticket.type === 'story'" :key="ticket.id" :ticket="ticket" />

      <div class="field">
        <div class="l">LABELS</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <span v-for="l in (ticket.labels ?? [])" :key="l" class="chip">{{ l }}</span>
        </div>
      </div>

      <!-- 削除 (2 段階クリック / T10-2) -->
      <div class="field delete-zone">
        <button :class="['delete-btn', deleteArmed && 'armed']" data-testid="delete-ticket" @click="onDelete">
          {{ deleteArmed ? 'もう一度押すと削除します' : 'このチケットを削除' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.id-copy-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer; padding: 0;
}
.id-copy-btn:hover .t-mono { color: var(--accent) !important; }
.id-copied {
  font-family: var(--mono); font-size: 10px;
  color: var(--ok); letter-spacing: 0.04em;
}
.ibtn-text {
  padding: 4px 10px;
  background: transparent;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; cursor: pointer;
  color: var(--ink-1);
}
.ibtn-text:disabled { opacity: 0.5; cursor: not-allowed; }
.edit-title {
  width: 100%;
  font-family: var(--display); font-size: 22px; font-weight: 600;
  border: none; border-bottom: 2px solid var(--accent); background: transparent;
  padding: 4px 0; color: var(--ink-0);
}
.edit-title:focus { outline: none; }
.edit-fields { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.edit-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 120px; }
.edit-input {
  padding: 8px 10px;
  border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  background: var(--bg-0); font-family: var(--sans); font-size: 13px;
}
.edit-input:focus { outline: none; border-color: var(--accent); }
.edit-textarea { width: 100%; resize: vertical; line-height: 1.5; }
.edit-err { color: var(--err); font-size: 12px; margin: 0 0 12px; }
.delete-zone { border-top: var(--hairline) solid var(--line-1); padding-top: 16px; margin-top: 8px; }
.delete-btn {
  padding: 8px 16px;
  background: transparent; border: var(--hairline) solid var(--err);
  border-radius: var(--radius); color: var(--err);
  font-family: var(--sans); font-size: 13px; cursor: pointer;
}
.delete-btn.armed { background: var(--err); color: #FBF8F2; }
</style>
