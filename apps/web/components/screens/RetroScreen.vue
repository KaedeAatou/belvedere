<script setup lang="ts">
const { memberName } = useMembers();
const { activeSprint } = useSprints();
const { tries: stack, fetchTries, create, toggleDone, remove } = useRetroTries();

// 積み上げは Firestore 永続 (GET /api/retro-tries)。過去スプリント由来の Try は最初から積み上がっている。
onMounted(() => fetchTries());

// KPT ボード (Retro は tickets を受けない / demo シード)。who は実メンバー userId を参照する。
const cols = ref({
  keep: [
    { id: 'k1', text: '新機能リリース後、社内利用が +60% 増えた。導線として効いている。', who: 'kagayayuuki', votes: 5, hot: true },
    { id: 'k2', text: 'AI形骸化チェックがプランニングで2件のスコープ漏れを事前に拾った。', who: 'uehara', votes: 4, hot: true },
    { id: 'k3', text: 'ペアレビューを REVIEW 列で実施したのは良かった。', who: 'okubo', votes: 2, hot: false },
  ],
  problem: [
    { id: 'p1', text: 'Spike が長期 DOING に留まった。タイムボックスが弱い。', who: 'hirai', votes: 6, hot: true },
    { id: 'p2', text: 'BLOCKED チケットの理由が空のまま2日経過していた。', who: 'uehara', votes: 3, hot: true },
    { id: 'p3', text: 'ゴールのMが弱く、レビュー時に判定が割れた。', who: 'kagayayuuki', votes: 3, hot: false },
    { id: 'p4', text: '週後半の更新頻度が落ちた（金曜の更新 0件）。', who: 'hayashi', votes: 1, hot: false },
  ],
  try: [
    { id: 'try1', text: 'Spikeに 1.5日のハードタイムボックス、超過時は自動でレトロ議題に。', who: 'okubo', votes: 5, hot: true },
    { id: 'try2', text: 'BLOCKED に遷移したら理由必須にする（Belvedere AIで強制）。', who: 'uehara', votes: 4, hot: true },
    { id: 'try3', text: '金曜午前に "micro-daily" を実施し更新を促す。', who: 'hayashi', votes: 2, hot: false },
  ],
});

const dotColor: Record<string, string> = {
  keep: 'var(--ok)',
  problem: 'var(--err)',
  try: 'var(--accent)',
};

const colDefs = [
  { key: 'keep' as const, label: 'Keep', desc: '続けたいこと' },
  { key: 'problem' as const, label: 'Problem', desc: '困ったこと' },
  { key: 'try' as const, label: 'Try', desc: '次に試す候補' },
];

function sorted(key: 'keep' | 'problem' | 'try') {
  return [...cols.value[key]].sort((a, b) => b.votes - a.votes);
}

// ===== アクション積み上げ (carry-forward stack) =====
// 「次に試すこと(Try)」を d&d で積み上げに移すと、スプリントを跨いで蓄積される。
// この積み上げが各儀式 AI のコンテキストになる (Firestore 永続 / useRetroTries 経由)。
// 過去スプリント由来の Try は最初から積み上がっている。
const dragTryId = ref<string | null>(null);
const stackOver = ref(false);

function onTryDragStart(id: string) { dragTryId.value = id; }
function onTryDragEnd() { dragTryId.value = null; }

async function onStackDrop(e: DragEvent) {
  e.preventDefault();
  stackOver.value = false;
  const t = cols.value.try.find((x) => x.id === dragTryId.value);
  dragTryId.value = null;
  if (!t) return;
  // id 形式が変わったため重複判定は「同一 text が既に積み上げに存在するか」で行う。
  if (stack.value.some((s) => s.text === t.text)) return;
  // 由来スプリントは active sprint。number はバッジ表示 / Agent コンテキスト用。
  await create({
    text: t.text,
    sprintNumber: activeSprint.value?.number ?? 0,
    ...(activeSprint.value && { sprintId: activeSprint.value.id }),
  });
}

const inStack = (tryText: string) => stack.value.some((s) => s.text === tryText);
</script>

<template>
  <div class="retro">
    <div class="retro-board">
      <div v-for="c in colDefs" :key="c.key" class="retro-col">
        <div class="retro-col-head">
          <span class="dot" :style="{ background: dotColor[c.key] }" />
          <span class="name">{{ c.label }}</span>
          <span style="font-size: 11px; color: var(--ink-3); margin-left: 4px">{{ c.desc }}</span>
          <span class="ct">{{ sorted(c.key).length }}</span>
        </div>
        <div class="retro-col-body">
          <div v-for="n in sorted(c.key)" :key="n.id"
               :class="['retro-note', c.key === 'try' && 'draggable', c.key === 'try' && inStack(n.text) && 'stacked']"
               :draggable="c.key === 'try'"
               @dragstart="c.key === 'try' && onTryDragStart(n.id)"
               @dragend="onTryDragEnd">
            <div class="text">{{ n.text }}</div>
            <div class="meta">
              <Avatar :user="n.who" />
              <span>{{ memberName(n.who) }}</span>
              <span v-if="c.key === 'try'" class="drag-hint"><Icon name="branch" :size="11" /> 積み上げへ</span>
              <span v-else :class="['vote', n.hot && 'hot']">
                <Icon name="up" />
                <span style="font-family: var(--mono); font-size: 10px">{{ n.votes }}</span>
              </span>
            </div>
          </div>
          <div class="retro-add">+ ADD NOTE</div>
        </div>
      </div>
    </div>

    <!-- アクション積み上げ: Try を d&d で蓄積 / スプリントを跨いで担当 AI のコンテキストになる -->
    <div :class="['retro-stack', stackOver && 'drop-over']"
         data-testid="retro-stack"
         @dragover.prevent="stackOver = true"
         @dragleave="stackOver = false"
         @drop="onStackDrop">
      <div class="stack-head">
        <h3>Action items <span class="carry">— carry-forward 積み上げ</span></h3>
        <p>Try を <b>ドラッグ</b>して積み上げると、スプリントを跨いで蓄積され各儀式 AI のコンテキストになります。</p>
      </div>
      <div class="stack-list">
        <div v-for="a in stack" :key="a.id" data-testid="retro-stack-item" :class="['stack-item', a.done && 'done']">
          <span :class="['check', a.done && 'on']" @click="toggleDone(a)">
            <Icon v-if="a.done" name="check" :size="10" />
          </span>
          <span class="text">{{ a.text }}</span>
          <span class="sprint-badge">S{{ a.sprintNumber }}</span>
          <button class="rm" title="積み上げから削除" @click="remove(a.id)">
            <Icon name="x" :size="12" />
          </button>
        </div>
        <div v-if="stack.length === 0" class="stack-empty">
          Try をここにドラッグして積み上げを開始
        </div>
      </div>
    </div>
  </div>
</template>
