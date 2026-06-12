<script setup lang="ts">
import type { RetroNote } from '@belvedere/shared';

const { memberName } = useMembers();
const { activeSprint } = useSprints();
const { me, fetchMe } = useMe();
const { notes, fetchNotes, create: createNote, toggleVote, remove: removeNote } = useRetroNotes();
// 積み上げ (RetroTry) は KPT ノートとは別の永続。Try 列のノートを昇格してここに溜める。
const { tries: stack, fetchTries, create: createTry, toggleDone, remove: removeTry } = useRetroTries();

// ノートと積み上げは Firestore 永続。レトロを実際に開催するための実データ。
onMounted(() => {
  fetchMe();
  fetchNotes();
  fetchTries();
});

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

// 列ごとに votes 数で降順表示。
function notesIn(key: ColKey): RetroNote[] {
  return notes.value
    .filter((n) => n.column === key)
    .sort((a, b) => b.votes.length - a.votes.length);
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
// Try 列のノートを d&d で積み上げに移すと RetroTry として永続化され、
// スプリントを跨いで蓄積される (各儀式 AI のコンテキスト)。重複は text 比較で抑止。
const dragTryId = ref<string | null>(null);
const stackOver = ref(false);

function onTryDragStart(id: string) { dragTryId.value = id; }
function onTryDragEnd() { dragTryId.value = null; }

const inStack = (noteText: string) => stack.value.some((s) => s.text === noteText);

async function onStackDrop(e: DragEvent) {
  e.preventDefault();
  stackOver.value = false;
  const note = notes.value.find((n) => n.id === dragTryId.value);
  dragTryId.value = null;
  if (!note) return;
  // 重複判定は「同一 text が既に積み上げに存在するか」(現状ロジック踏襲)。
  if (inStack(note.text)) return;
  await createTry({
    text: note.text,
    sprintNumber: activeSprint.value?.number ?? 0,
    ...(activeSprint.value && { sprintId: activeSprint.value.id }),
  });
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
          <div v-for="n in notesIn(c.key)" :key="n.id"
               data-testid="retro-note"
               :class="['retro-note', c.key === 'try' && 'draggable', c.key === 'try' && inStack(n.text) && 'stacked']"
               :draggable="c.key === 'try'"
               @dragstart="c.key === 'try' && onTryDragStart(n.id)"
               @dragend="onTryDragEnd">
            <div class="text">{{ n.text }}</div>
            <div class="meta">
              <Avatar :user="n.authorId" />
              <span>{{ memberName(n.authorId) }}</span>
              <span v-if="c.key === 'try'" class="drag-hint"><Icon name="branch" :size="11" /> 積み上げへ</span>
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

          <!-- インライン追加 -->
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
    <div :class="['retro-stack', stackOver && 'drop-over']"
         data-testid="retro-stack"
         @dragover.prevent="stackOver = true"
         @dragleave="stackOver = false"
         @drop="onStackDrop">
      <div class="stack-head">
        <h3>Action items <span class="carry">— carry-forward 積み上げ</span></h3>
        <p>Try ノートを <b>ドラッグ</b>して積み上げると、スプリントを跨いで蓄積され各儀式 AI のコンテキストになります。</p>
      </div>
      <div class="stack-list">
        <div v-for="a in stack" :key="a.id" data-testid="retro-stack-item" :class="['stack-item', a.done && 'done']">
          <span :class="['check', a.done && 'on']" @click="toggleDone(a)">
            <Icon v-if="a.done" name="check" :size="10" />
          </span>
          <span class="text">{{ a.text }}</span>
          <span class="sprint-badge">S{{ a.sprintNumber }}</span>
          <button class="rm" title="積み上げから削除" @click="removeTry(a.id)">
            <Icon name="x" :size="12" />
          </button>
        </div>
        <div v-if="stack.length === 0" class="stack-empty">
          Try ノートをここにドラッグして積み上げを開始
        </div>
      </div>
    </div>
  </div>
</template>
