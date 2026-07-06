<script setup lang="ts">
import type { Ticket, Priority, ValueImpact, Status } from '@belvedere/shared';
import type { PatchTicketInput } from '~/composables/useTickets';

const props = defineProps<{ ticket: Ticket }>();
const emit = defineEmits<{ close: [] }>();

const { memberName, members } = useMembers();
const { findingsFor } = useFindings();
const { patchTicket, deleteTicket, addComment } = useTickets();
const { upload: uploadImage } = useImages();
const imageBusy = ref(false);

// ===== コメント / 追記スレッド (WC-2640fecd) =====
const comments = computed(() => props.ticket.comments ?? []);
const commentText = ref('');
const commentBusy = ref(false);
const commentError = ref<string | null>(null);
async function submitComment(): Promise<void> {
  const body = commentText.value.trim();
  if (!body || commentBusy.value) return;
  commentError.value = null;
  commentBusy.value = true;
  const updated = await addComment(props.ticket.id, body);
  commentBusy.value = false;
  if (updated) commentText.value = '';
  else commentError.value = 'コメントの追加に失敗しました';
}

// 画像を選択 → data URL 化 → アップロード → ![](/api/images/id) を説明末尾に挿入 (WC-a8f0be16)。
async function onPickImage(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { editError.value = '画像ファイルを選んでください'; input.value = ''; return; }
  editError.value = null;
  imageBusy.value = true;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(file);
    });
    const id = await uploadImage(dataUrl);
    if (id) {
      editDescription.value = `${editDescription.value}${editDescription.value ? '\n' : ''}![](/api/images/${id})`;
    } else {
      editError.value = '画像のアップロードに失敗しました';
    }
  } catch {
    editError.value = '画像の読み込みに失敗しました';
  } finally {
    imageBusy.value = false;
    input.value = '';
  }
}
const { sprints, sprintLabel } = useSprints();
// WC-38/35: 名前表示 (sprintLabel) + active/planned のみに絞る (現値が completed の場合だけ残す)。
const sprintOptions = computed(() => sprintOptionsForEdit(sprints.value, props.ticket.sprintId));

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
const editReproSteps = ref('');     // Bug の再現手順 (WC-2dba4170)
const editRegressionNote = ref(''); // Bug の回帰テスト方針 (WC-2dba4170)
// Bug 種別のみ再現手順 / 回帰テスト欄を出す (ルールエンジンの BUG_NO_REPRO / BUG_NO_REGRESSION_DOD 対応)
const isBug = computed(() => props.ticket.type === 'bug');

function startEdit(): void {
  editTitle.value = props.ticket.title;
  editDescription.value = props.ticket.description ?? '';
  editAssignee.value = props.ticket.assigneeId ?? '';
  editPriority.value = props.ticket.priority;
  editValueImpact.value = props.ticket.valueImpact ?? '';
  editStatus.value = props.ticket.status;
  editAC.value = (props.ticket.acceptanceCriteria ?? []).join('\n');
  editSprintId.value = props.ticket.sprintId ?? '';
  editReproSteps.value = props.ticket.reproSteps ?? '';
  editRegressionNote.value = props.ticket.regressionNote ?? '';
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
  // Bug の再現手順 / 回帰テスト専用欄 (WC-2dba4170)。bug のみ送信 (空文字でクリアも可)。
  if (isBug.value) {
    patch.reproSteps = editReproSteps.value.trim();
    patch.regressionNote = editRegressionNote.value.trim();
  }
  // sprintId: API は null/空での解除をサポートしないため、選択がある場合のみ送信する。
  // 「バックログ (なし)」選択肢は提供しない (解除不可のため)。
  if (editSprintId.value) patch.sprintId = editSprintId.value;
  const updated = await patchTicket(props.ticket.id, patch);
  saving.value = false;
  if (updated) {
    editing.value = false;
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
            <option v-for="s in sprintOptions" :key="s.id" :value="s.id">
              {{ sprintLabel(s, s.status === 'completed' ? '完了' : '', `Sprint ${s.number}`) }}
            </option>
          </select>
        </div>
      </div>

      <!-- Description -->
      <div class="field">
        <div class="l">DESCRIPTION</div>
        <template v-if="editing">
          <textarea v-model="editDescription" class="edit-input edit-textarea" data-testid="edit-description" rows="4" />
          <!-- 画像アップロード (WC-a8f0be16)。選択 → アップロード → ![](/api/images/id) を説明末尾に挿入。 -->
          <label class="img-upload-btn">
            <input type="file" accept="image/*" data-testid="desc-image-input" style="display: none" @change="onPickImage" />
            {{ imageBusy ? 'アップロード中…' : '🖼 画像を追加' }}
          </label>
        </template>
        <template v-else>
          <DescriptionView v-if="ticket.description" :text="ticket.description" />
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

      <!-- Bug 専用: 再現手順 / 回帰テスト (WC-2dba4170)。空だとルールエンジンが BUG_NO_REPRO / BUG_NO_REGRESSION_DOD を出す。 -->
      <template v-if="isBug">
        <div class="field">
          <div class="l">再現手順</div>
          <textarea v-if="editing" v-model="editReproSteps" class="edit-input edit-textarea"
                    data-testid="sheet-edit-repro" rows="4"
                    placeholder="再現手順 + 期待 vs 実動作 + 影響範囲" />
          <template v-else>
            <div v-if="ticket.reproSteps" style="font-size: 13.5px; line-height: 1.6; white-space: pre-wrap">{{ ticket.reproSteps }}</div>
            <div v-else
                 style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
              再現手順が未記入です。編集して記入してください。
            </div>
          </template>
        </div>
        <div class="field">
          <div class="l">回帰テスト</div>
          <textarea v-if="editing" v-model="editRegressionNote" class="edit-input edit-textarea"
                    data-testid="sheet-edit-regression" rows="3"
                    placeholder="再発防止の自動テスト方針" />
          <template v-else>
            <div v-if="ticket.regressionNote" style="font-size: 13.5px; line-height: 1.6; white-space: pre-wrap">{{ ticket.regressionNote }}</div>
            <div v-else
                 style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
              回帰テストが未記入です。編集して記入してください。
            </div>
          </template>
        </div>
      </template>

      <!-- レビュー指摘 (Review 儀式でこの完成 increment に残された関係者の指摘)。空なら非表示。 -->
      <div v-if="ticket.reviewNotes && ticket.reviewNotes.length > 0" class="field" data-testid="sheet-review-notes">
        <div class="l">レビュー指摘</div>
        <div class="review-note-list">
          <div v-for="(n, i) in ticket.reviewNotes" :key="i" class="review-note">{{ n }}</div>
        </div>
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

      <!-- コメント / 追記スレッド (WC-2640fecd)。説明が 1 つしか無く追記できない不便を解消。 -->
      <div class="field" data-testid="sheet-comments">
        <div class="l">コメント / 追記</div>
        <div v-if="comments.length > 0" class="comment-list">
          <div v-for="c in comments" :key="c.id" class="comment" :data-testid="`comment-${c.id}`">
            <div class="comment-meta">
              <Avatar :user="c.authorId" />
              <span class="comment-author">{{ memberName(c.authorId) }}</span>
              <span style="color: var(--ink-4)">·</span>
              <span>{{ c.createdAt.slice(0, 16).replace('T', ' ') }}</span>
            </div>
            <div class="comment-body">{{ c.body }}</div>
          </div>
        </div>
        <div v-else style="font-size: 12.5px; color: var(--ink-3); font-style: italic; margin-bottom: 8px">
          まだコメントはありません。
        </div>
        <textarea v-model="commentText" class="edit-input edit-textarea comment-textarea" data-testid="comment-input"
                  rows="4" placeholder="追記・調査メモ・議論を書く" @keydown.meta.enter="submitComment" @keydown.ctrl.enter="submitComment" />
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px">
          <button class="ibtn-text" data-testid="comment-submit"
                  :disabled="commentBusy || !commentText.trim()" @click="submitComment">
            {{ commentBusy ? '追加中…' : '追加' }}
          </button>
          <span style="font-family: var(--mono); font-size: 10px; color: var(--ink-3)">⌘ ↵</span>
          <span v-if="commentError" class="edit-err" style="margin: 0">{{ commentError }}</span>
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
/* 画像アップロードボタン (WC-a8f0be16) */
.img-upload-btn {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; align-self: flex-start;
  padding: 5px 12px; border: var(--hairline) dashed var(--accent-dim, var(--line-2)); border-radius: var(--radius);
  background: transparent; color: var(--accent); font-family: var(--sans); font-size: 12px; cursor: pointer;
}
.img-upload-btn:hover { background: var(--accent-bg, #fff3ee); }
.edit-err { color: var(--err); font-size: 12px; margin: 0 0 12px; }
/* コメント / 追記スレッド (WC-2640fecd) */
.comment-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.comment { border-left: 2px solid var(--line-2); padding: 2px 0 2px 12px; }
.comment-meta {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  font-family: var(--mono); font-size: 10.5px; color: var(--ink-3);
}
.comment-author { color: var(--ink-1); font-weight: 600; }
.comment-body { font-family: var(--sans); font-size: 13px; line-height: 1.55; color: var(--ink-0); white-space: pre-wrap; }
/* コメント入力欄は最低でも 4 行ぶんの高さを確保 (WC-9 差し戻し: 狭かった)。 */
.comment-textarea { min-height: 84px; }
.review-note-list { display: flex; flex-direction: column; gap: 6px; }
.review-note {
  font-family: var(--sans); font-size: 13px; line-height: 1.5;
  color: var(--ink-1); border-left: 2px solid var(--accent);
  padding: 4px 0 4px 12px;
}
.delete-zone { border-top: var(--hairline) solid var(--line-1); padding-top: 16px; margin-top: 8px; }
.delete-btn {
  padding: 8px 16px;
  background: transparent; border: var(--hairline) solid var(--err);
  border-radius: var(--radius); color: var(--err);
  font-family: var(--sans); font-size: 13px; cursor: pointer;
}
.delete-btn.armed { background: var(--err); color: #FBF8F2; }
</style>
