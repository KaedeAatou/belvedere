<script setup lang="ts">
const { members, memberName } = useMembers();

// 議論ノートは demo シード (Retro は tickets を受けない / 型追従のみ)。
// who は実メンバー userId を参照する。
const cols = ref({
  keep: [
    { id: 1, text: '新機能リリース後、社内利用が +60% 増えた。導線として効いている。', who: 'kagayayuuki', votes: 5, hot: true },
    { id: 2, text: 'AI形骸化チェックがプランニングで2件のスコープ漏れを事前に拾った。', who: 'uehara', votes: 4, hot: true },
    { id: 3, text: 'ペアレビューを REVIEW 列で実施したのは良かった。', who: 'okubo', votes: 2, hot: false },
  ],
  problem: [
    { id: 4, text: 'Spike が長期 DOING に留まった。タイムボックスが弱い。', who: 'hirai', votes: 6, hot: true },
    { id: 5, text: 'BLOCKED チケットの理由が空のまま2日経過していた。', who: 'uehara', votes: 3, hot: true },
    { id: 6, text: 'ゴールのMが弱く、レビュー時に判定が割れた。', who: 'kagayayuuki', votes: 3, hot: false },
    { id: 7, text: '週後半の更新頻度が落ちた（金曜の更新 0件）。', who: 'hayashi', votes: 1, hot: false },
  ],
  try: [
    { id: 8, text: 'Spikeに 1.5日のハードタイムボックス、超過時は自動でレトロ議題に。', who: 'okubo', votes: 5, hot: true },
    { id: 9, text: 'BLOCKED に遷移したら理由必須にする（Belvedere AIで強制）。', who: 'uehara', votes: 4, hot: true },
    { id: 10, text: '金曜午前に "micro-daily" を実施し更新を促す。', who: 'hayashi', votes: 2, hot: false },
  ],
});

const actions = [
  { id: 'a1', text: 'Spike テンプレに 1.5d ハードタイムボックス欄を追加', owner: 'okubo', due: 'Next D03', done: false },
  { id: 'a2', text: 'BLOCKED 遷移時の理由必須バリデーション', owner: 'uehara', due: 'Next D02', done: true },
  { id: 'a3', text: '前回 TODO 「ペアプロを週2回」の現状調査', owner: 'kagayayuuki', due: 'Next D05', done: false },
];

const dotColor: Record<string, string> = {
  keep: 'var(--ok)',
  problem: 'var(--err)',
  try: 'var(--accent)',
};

const colDefs = [
  { key: 'keep' as const, label: 'Keep', desc: '続けたいこと' },
  { key: 'problem' as const, label: 'Problem', desc: '困ったこと' },
  { key: 'try' as const, label: 'Try', desc: '次に試すこと' },
];

function sorted(key: 'keep' | 'problem' | 'try') {
  return [...cols.value[key]].sort((a, b) => b.votes - a.votes);
}

const totalNotes = computed(() => cols.value.keep.length + cols.value.problem.length + cols.value.try.length);
const openActions = computed(() => actions.filter((a) => !a.done).length);
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 04 / RETRO</div>
      <h1>Sprint Retrospective</h1>
      <div class="subtitle">
        Keep / Problem / Try でチームを点検。AIが <span style="color: var(--accent)">議論候補</span>と<span style="color: var(--accent)">前回未実行</span>を提示。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Notes</div><div class="v t-num">{{ totalNotes }}</div><div class="delta">{{ members.length }} contributors</div></div>
      <div class="stat"><div class="label">Votes</div><div class="v t-num">36</div><div class="delta">per member</div></div>
      <div class="stat"><div class="label">Actions</div><div class="v t-num accent">{{ openActions }}</div><div class="delta">open</div></div>
    </div>
  </div>

  <div class="retro">
    <div v-for="c in colDefs" :key="c.key" class="retro-col">
      <div class="retro-col-head">
        <span class="dot" :style="{ background: dotColor[c.key] }" />
        <span class="name">{{ c.label }}</span>
        <span style="font-size: 11px; color: var(--ink-3); margin-left: 4px">{{ c.desc }}</span>
        <span class="ct">{{ sorted(c.key).length }}</span>
      </div>
      <div class="retro-col-body">
        <div v-for="n in sorted(c.key)" :key="n.id" class="retro-note">
          <div class="text">{{ n.text }}</div>
          <div class="meta">
            <Avatar :user="n.who" />
            <span>{{ memberName(n.who) }}</span>
            <span :class="['vote', n.hot && 'hot']">
              <Icon name="up" />
              <span style="font-family: var(--mono); font-size: 10px">{{ n.votes }}</span>
            </span>
          </div>
        </div>
        <div class="retro-add">+ ADD NOTE</div>
      </div>
    </div>

    <div class="retro-actions">
      <div>
        <h3>Action items</h3>
        <p>レトロから生まれたコミットメント。次スプリントのチケットに連携されます。</p>
        <button class="h-btn" style="margin-top: 10px"><Icon name="sparkle" /> AI: Suggest from Try</button>
      </div>
      <div class="action-list">
        <div v-for="a in actions" :key="a.id" :class="['action-row', a.done && 'done']">
          <span :class="['check', a.done && 'on']"><Icon v-if="a.done" name="check" :size="10" /></span>
          <span class="text">{{ a.text }}</span>
          <Avatar :user="a.owner" />
          <span class="t-mono" style="font-size: 10px; color: var(--ink-3)">{{ a.due }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
