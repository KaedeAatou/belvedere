<script setup lang="ts">
const { memberName } = useMembers();

// KPT ボード (Retro は tickets を受けない / demo シード)。who は実メンバー userId を参照する。
const cols = ref({
  keep: [
    { id: 'k1', text: '新機能リリース後、社内利用が +60% 増えた。導線として効いている。', who: 'kaede', votes: 5, hot: true },
    { id: 'k2', text: 'AI形骸化チェックがプランニングで2件のスコープ漏れを事前に拾った。', who: 'uehara', votes: 4, hot: true },
    { id: 'k3', text: 'ペアレビューを REVIEW 列で実施したのは良かった。', who: 'okubo', votes: 2, hot: false },
  ],
  problem: [
    { id: 'p1', text: 'Spike が長期 DOING に留まった。タイムボックスが弱い。', who: 'hirai', votes: 6, hot: true },
    { id: 'p2', text: 'BLOCKED チケットの理由が空のまま2日経過していた。', who: 'uehara', votes: 3, hot: true },
    { id: 'p3', text: 'ゴールのMが弱く、レビュー時に判定が割れた。', who: 'kaede', votes: 3, hot: false },
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
// この積み上げが各儀式 AI のコンテキストになる (将来は永続ストアに保存)。
// 過去スプリント由来の Try は最初から積み上がっている。
interface StackItem { id: string; text: string; sprint: string; done: boolean; }
const stack = ref<StackItem[]>([
  { id: 'st-prev1', text: 'PR レビューは依頼から 24h 以内に着手する。', sprint: 'S11', done: true },
  { id: 'st-prev2', text: 'デイリーで前日の停滞チケットを必ず 1 件共有する。', sprint: 'S12', done: false },
]);

const dragTryId = ref<string | null>(null);
const stackOver = ref(false);

function onTryDragStart(id: string) { dragTryId.value = id; }
function onTryDragEnd() { dragTryId.value = null; }

function onStackDrop(e: DragEvent) {
  e.preventDefault();
  stackOver.value = false;
  const t = cols.value.try.find((x) => x.id === dragTryId.value);
  if (t) {
    const sid = `st-${t.id}`;
    if (!stack.value.some((s) => s.id === sid)) {
      stack.value.push({ id: sid, text: t.text, sprint: 'S13', done: false });
    }
  }
  dragTryId.value = null;
}

function removeFromStack(id: string) {
  stack.value = stack.value.filter((s) => s.id !== id);
}
function toggleDone(item: StackItem) { item.done = !item.done; }

const inStack = (tryId: string) => stack.value.some((s) => s.id === `st-${tryId}`);
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
               :class="['retro-note', c.key === 'try' && 'draggable', c.key === 'try' && inStack(n.id) && 'stacked']"
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
         @dragover.prevent="stackOver = true"
         @dragleave="stackOver = false"
         @drop="onStackDrop">
      <div class="stack-head">
        <h3>Action items <span class="carry">— carry-forward 積み上げ</span></h3>
        <p>Try を <b>ドラッグ</b>して積み上げると、スプリントを跨いで蓄積され各儀式 AI のコンテキストになります。</p>
      </div>
      <div class="stack-list">
        <div v-for="a in stack" :key="a.id" :class="['stack-item', a.done && 'done']">
          <span :class="['check', a.done && 'on']" @click="toggleDone(a)">
            <Icon v-if="a.done" name="check" :size="10" />
          </span>
          <span class="text">{{ a.text }}</span>
          <span class="sprint-badge">{{ a.sprint }}</span>
          <button class="rm" title="積み上げから削除" @click="removeFromStack(a.id)">
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
