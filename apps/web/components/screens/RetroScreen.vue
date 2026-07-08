<script setup lang="ts">
import type { RetroNote, RetroTry } from '@belvedere/shared';
import { VueDraggable } from 'vue-draggable-plus';
import { notesInColumn } from '~/composables/useRetroNotes';

const { memberName } = useMembers();
const { activeSprint } = useSprints();
const { me, fetchMe } = useMe();
const { notes, fetchNotes, create: createNote, toggleVote, remove: removeNote } = useRetroNotes();
// 積み上げ (RetroTry) は KPT ノートとは別の永続。Try 列のノートを昇格してここに溜める。
const { tries: stack, fetchTries, create: createTry, toggleDone, remove: removeTry } = useRetroTries();

// ノートと積み上げは Firestore 永続。レトロを実際に開催するための実データ。
onMounted(() => {
  fetchMe();
  fetchTries();
});

// F-16: KPT ノートは「今回の振り返り」= active sprint の番号で取得する。
// sprints は useState 共有 (app 側で fetch 済み) — active が後からロードされても watch で再取得する。
watch(
  () => activeSprint.value?.number,
  (n) => {
    void fetchNotes(n !== undefined ? { sprintNumber: n } : {});
  },
  { immediate: true },
);

type ColKey = 'keep' | 'problem' | 'try';

const dotColor: Record<ColKey, string> = {
  keep: 'var(--ok)',
  problem: 'var(--err)',
  try: 'var(--accent)',
};

const colDefs: { key: ColKey; label: string; desc: string }[] = [
  { key: 'keep', label: 'Keep', desc: '続けたいこと' },
  { key: 'problem', label: 'Problem', desc: '困ったこと' },
  { key: 'try', label: 'Try', desc: '次に試す候補' },
];

// 列ごとに votes 数で降順表示。F-16: 今回 (active sprint) のノートだけに絞る
// (絞りロジックは notesInColumn 純粋関数 — useRetroNotes.test.ts で直接テスト)。
function notesIn(key: ColKey): RetroNote[] {
  return notesInColumn(notes.value, key, activeSprint.value?.number ?? null);
}

const myId = computed(() => me.value?.userId ?? null);
const hasVoted = (n: RetroNote) => (myId.value ? n.votes.includes(myId.value) : false);
const isMine = (n: RetroNote) => myId.value !== null && n.authorId === myId.value;

// ===== インラインのノート追加 =====
const addingCol = ref<ColKey | null>(null);
const draftText = ref('');

function startAdd(key: ColKey) {
  addingCol.value = key;
  draftText.value = '';
}
function cancelAdd() {
  addingCol.value = null;
  draftText.value = '';
}
async function submitAdd(key: ColKey) {
  const text = draftText.value.trim();
  if (!text) return;
  await createNote({ text, column: key, sprintNumber: activeSprint.value?.number ?? 0 });
  // 続けて追加できるよう入力欄は開いたまま空にする
  draftText.value = '';
}

// ===== アクション積み上げ (carry-forward stack) =====
// Try 列のノートを d&d で積み上げに移すと RetroTry として永続化され、スプリントを跨いで蓄積される。
// d&d は vue-draggable-plus (SortableJS) の clone group。Try 列は pull:'clone' の source、
// 積み上げは put:true の target。これは「移動」ではなく「昇格」 — RetroNote(ノート)と
// RetroTry(積み上げ)は別エンティティで、ノートは Try 列に残したまま新しい RetroTry を作る。
// よって drop で挿入された clone は破棄し、onStackAdd で createTry を 1 回だけ呼ぶ。重複は text 比較で抑止。
const TRY_GROUP = { name: 'retro-try', pull: 'clone', put: false } as const;
const NODRAG_GROUP = { name: 'retro-none', pull: false, put: false } as const;
const STACK_GROUP = { name: 'retro-try', pull: false, put: true } as const;

const inStack = (noteText: string) => stack.value.some((s) => s.text === noteText);

// VueDraggable は v-model に可変配列を要求するので、列ノート(votes降順)と積み上げをローカルにミラーする。
const colNotes = reactive<Record<ColKey, RetroNote[]>>({ keep: [], problem: [], try: [] });
function syncColNotes(): void {
  for (const c of colDefs) colNotes[c.key] = notesIn(c.key);
}
syncColNotes();
// F-16: 絞り込みが activeSprint にも依存するため、active の遅延ロード/切替でも再ミラーする。
watch([notes, () => activeSprint.value?.number], syncColNotes, { deep: true });

const stackMirror = ref<RetroTry[]>([]);
watch(stack, () => { stackMirror.value = [...stack.value]; }, { immediate: true, deep: true });

// Try ノートを積み上げ (RetroTry) に昇格する中核。ボタン (主導線 / F-14) と d&d の両方から呼ぶ。
// 冪等性: 同一 text が既に積み上げにあれば無視 (二重追加防止)。
async function promoteToStack(note: RetroNote): Promise<void> {
  if (inStack(note.text)) return;
  await createTry({
    text: note.text,
    sprintNumber: activeSprint.value?.number ?? 0,
    ...(activeSprint.value && { sprintId: activeSprint.value.id }),
  });
}

// 積み上げに clone がドロップされた時。clone は破棄して実データ(stack)で描画し直し、createTry を 1 回呼ぶ。
async function onStackAdd(evt: { item: HTMLElement }): Promise<void> {
  const noteId = evt.item?.getAttribute?.('data-note-id') ?? null;
  // SortableJS が stackMirror に挿入した clone を即破棄 (実体は createTry → fetchTries で来る)。
  stackMirror.value = [...stack.value];
  const note = notes.value.find((n) => n.id === noteId);
  if (!note) return;
  await promoteToStack(note);
}
</script>

<template>
  <div class="retro">
    <div class="retro-board">
      <div v-for="c in colDefs" :key="c.key" class="retro-col" :data-testid="`retro-col-${c.key}`">
        <div class="retro-col-head">
          <span class="dot" :style="{ background: dotColor[c.key] }" />
          <span class="name">{{ c.label }}</span>
          <span style="font-size: 11px; color: var(--ink-3); margin-left: 4px">{{ c.desc }}</span>
          <span class="ct">{{ notesIn(c.key).length }}</span>
        </div>
        <div class="retro-col-body">
          <VueDraggable
            v-model="colNotes[c.key]"
            :group="c.key === 'try' ? TRY_GROUP : NODRAG_GROUP"
            :disabled="c.key !== 'try'"
            :sort="false"
            handle=".retro-drag-grab"
            :animation="150" :force-fallback="true"
            class="retro-notes">
            <div v-for="n in colNotes[c.key]" :key="n.id"
                 data-testid="retro-note"
                 :data-note-id="n.id"
                 :class="['retro-note', c.key === 'try' && 'draggable', c.key === 'try' && inStack(n.text) && 'stacked']">
              <div class="text">{{ n.text }}</div>
              <div class="meta">
                <Avatar :user="n.authorId" />
                <span>{{ memberName(n.authorId) }}</span>
                <span v-if="c.key === 'try'" class="drag-hint retro-drag-grab" style="touch-action: none; user-select: none" title="ドラッグで積み上げへ"><Icon name="branch" :size="11" /></span>
                <!-- F-14: 主導線はボタン (d&d は上の grab ハンドルで残す)。積み上げ済みは冪等スキップ + disabled。 -->
                <button
                  v-if="c.key === 'try'"
                  class="stack-add"
                  data-testid="retro-stack-add"
                  :disabled="inStack(n.text)"
                  :title="inStack(n.text) ? '積み上げ済み' : '積み上げ (Action items) へ追加'"
                  @click="promoteToStack(n)">
                  {{ inStack(n.text) ? '積み上げ済み' : '積み上げへ追加' }}
                </button>
                <button
                  data-testid="retro-vote"
                  :class="['vote', hasVoted(n) && 'hot']"
                  title="投票"
                  @click="toggleVote(n.id)">
                  <Icon name="up" />
                  <span style="font-family: var(--mono); font-size: 10px">{{ n.votes.length }}</span>
                </button>
                <button v-if="isMine(n)" class="note-rm" title="ノートを削除"
                        data-testid="retro-note-rm" @click="removeNote(n.id)">
                  <Icon name="x" :size="11" />
                </button>
              </div>
            </div>
          </VueDraggable>

          <!-- インライン追加 (VueDraggable の外: ドラッグ対象にしない) -->
          <div v-if="addingCol === c.key" class="retro-add-form" :data-testid="`retro-add-form-${c.key}`">
            <textarea
              v-model="draftText"
              class="retro-add-input"
              :data-testid="`retro-add-input-${c.key}`"
              rows="2"
              placeholder="ノートを入力… (⌘/Ctrl+Enter で追加)"
              @keydown.meta.enter.prevent="submitAdd(c.key)"
              @keydown.ctrl.enter.prevent="submitAdd(c.key)"
              @keydown.esc="cancelAdd" />
            <div class="retro-add-actions">
              <button class="h-btn h-btn--primary" :data-testid="`retro-add-submit-${c.key}`"
                      :disabled="!draftText.trim()" @click="submitAdd(c.key)">追加</button>
              <button class="h-btn" @click="cancelAdd">閉じる</button>
            </div>
          </div>
          <div v-else class="retro-add" :data-testid="`retro-add-${c.key}`" @click="startAdd(c.key)">+ ノート追加</div>
        </div>
      </div>
    </div>

    <!-- アクション積み上げ: Try ノートを d&d で蓄積 / スプリントを跨いで担当 AI のコンテキストになる -->
    <div class="retro-stack" data-testid="retro-stack">
      <div class="stack-head">
        <h3>Action items <span class="carry">— carry-forward 積み上げ</span></h3>
        <p>Try ノートの<b>「積み上げへ追加」</b> (またはドラッグ) で積み上げると、スプリントを跨いで蓄積され各儀式 AI のコンテキストになります。</p>
      </div>
      <VueDraggable v-model="stackMirror" :group="STACK_GROUP" :sort="false" :animation="150"
                    class="stack-list" @add="onStackAdd">
        <div v-for="a in stackMirror" :key="a.id" data-testid="retro-stack-item" :class="['stack-item', a.done && 'done']">
          <span :class="['check', a.done && 'on']" @click="toggleDone(a)">
            <Icon v-if="a.done" name="check" :size="10" />
          </span>
          <span class="text">{{ a.text }}</span>
          <span class="sprint-badge">S{{ a.sprintNumber }}</span>
          <button class="rm" title="積み上げから削除" @click="removeTry(a.id)">
            <Icon name="x" :size="12" />
          </button>
        </div>
      </VueDraggable>
      <div v-if="stackMirror.length === 0" class="stack-empty">
        Try ノートの「積み上げへ追加」(またはここへドラッグ) で積み上げを開始
      </div>
    </div>
  </div>
</template>

<style scoped>
/* F-14: Try ノート→積み上げの主導線ボタン (d&d の drag-hint は残置)。 */
.stack-add {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  border: var(--hairline) solid var(--accent);
  color: var(--accent);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}
.stack-add:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.stack-add:disabled {
  border-color: var(--line-1);
  color: var(--ink-3);
  cursor: default;
}
</style>
