<script setup lang="ts">
// 見積もりポーカーパネル (T7-2 / A 案: DetailSheet 内セクション)。
// ticket.type==='story' のときだけ表示。隠蔽はサーバ側強制なので返ってきた view を素直に描画。
// DetailSheet 側で :key="ticket.id" を付けてチケットごとに mount し直す前提。
import type { Ticket, EstimationValue } from '@belvedere/shared';
import { FIBONACCI_POINTS } from '@belvedere/shared';

const props = defineProps<{ ticket: Ticket }>();

const { me } = useMe();
const { memberName } = useMembers();
const est = useEstimation();

type EstimationView = Awaited<ReturnType<typeof est.fetch>>;
const session = ref<EstimationView>(null);

// 権限再設計 (2026-06-23): 見積もりは操作ごとに許可ロールが違う (permissions.ts の MATRIX と一致)。
//   facilitate(開始/開示/再投票)=admin/sm、vote(投票)=admin/dev、adopt(採用)=admin/sm/dev。
const role = computed(() => me.value?.role ?? '');
const canFacilitate = computed(() => ['admin', 'sm'].includes(role.value)); // 開始 / 開示 / 再投票
const canVote = computed(() => ['admin', 'dev'].includes(role.value));      // 投票 (見積もる当事者)
const canAdopt = computed(() => ['admin', 'sm', 'dev'].includes(role.value)); // 採用 (確定)
const fibs: EstimationValue[] = [1, 2, 3, 5, 8, 13, '?'];

// 状態別に型を絞った view
const votingView = computed(() => {
  const s = session.value;
  return s && s.status === 'voting' ? s : null;
});
const resultView = computed(() => {
  const s = session.value;
  return s && s.status !== 'voting' ? s : null;
});

// フィボナッチ 2 段以上の開きで「割れている」と判定
const diverged = computed(() => {
  const r = resultView.value;
  if (!r) return false;
  const idxs = r.votes
    .map((v) => FIBONACCI_POINTS.indexOf(v.value as never))
    .filter((i) => i >= 0);
  if (idxs.length < 2) return false;
  return Math.max(...idxs) - Math.min(...idxs) >= 2;
});

let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() { session.value = await est.fetch(props.ticket.id); }
async function start() { session.value = await est.start(props.ticket.id); }
async function vote(v: EstimationValue) { session.value = await est.vote(props.ticket.id, v); }
async function reveal() { session.value = await est.reveal(props.ticket.id); }
async function adopt(v: number) { session.value = await est.adopt(props.ticket.id, v); }

onMounted(async () => {
  // Refinement の「ポーカー開始」合図 (T9) があれば即 start、無ければ現状取得
  const autostart = useState<string | null>('poker-autostart');
  if (autostart.value === props.ticket.id) {
    autostart.value = null;
    await start();
  } else {
    await refresh();
  }
  timer = setInterval(refresh, 5000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div class="field" data-testid="estimation-panel">
    <div class="l" style="color: var(--accent)">見積もり (Planning Poker)</div>

    <!-- セッションなし -->
    <div v-if="!session" class="est-block">
      <div class="est-current">
        現在の SP: <b>{{ ticket.estimatePt ?? '未設定' }}</b>
      </div>
      <button v-if="canFacilitate" class="est-primary" data-testid="est-start" @click="start">
        見積もりセッションを開始
      </button>
      <p v-else class="est-note">見積もりセッションはまだありません（開始はスクラムマスター）。</p>
    </div>

    <!-- voting -->
    <div v-else-if="votingView" class="est-block">
      <!-- 投票は見積もる当事者 = 開発者 (Dev) のみ。進行役 (PO/SM) には投票 UI を出さない。 -->
      <div v-if="canVote" class="est-fibs">
        <button v-for="f in fibs" :key="f"
                :class="['est-vote', votingView.myVote === f && 'mine']"
                :data-testid="`est-vote-${f}`"
                @click="vote(f)">{{ f }}</button>
      </div>
      <p class="est-note">
        {{ votingView.voteCount }} 人投票済<template v-if="votingView.votedUserIds.length">: {{ votingView.votedUserIds.map((u) => memberName(u)).join('、') }}</template>
        <span style="color: var(--ink-3)"> （値は開示まで非表示）</span>
      </p>
      <button v-if="canFacilitate" class="est-primary" data-testid="est-reveal"
              :disabled="votingView.voteCount === 0" @click="reveal">
        開示する
      </button>
    </div>

    <!-- adopted -->
    <div v-else-if="resultView && resultView.status === 'adopted'" class="est-block">
      <div class="est-adopted">SP <b>{{ resultView.adoptedValue }}</b> 採用済</div>
    </div>

    <!-- revealed / discarded -->
    <div v-else-if="resultView" class="est-block">
      <div class="est-votes">
        <div v-for="v in resultView.votes" :key="v.userId" class="est-vote-row">
          <span class="est-name">{{ memberName(v.userId) }}</span>
          <span class="est-val">{{ v.value }}</span>
        </div>
      </div>
      <p v-if="diverged" class="est-warn">
        見積もりが割れています。話し合って再投票か採用を選んでください。
      </p>
      <!-- 採用 (確定) は SM・Dev (admin 含む)。再投票 (= 開始しなおし) は facilitate = SM のみ。 -->
      <div v-if="canAdopt" class="est-adopt-row">
        <span class="est-note">この値で採用:</span>
        <button v-for="f in FIBONACCI_POINTS" :key="f" class="est-vote"
                :data-testid="`est-adopt-${f}`" @click="adopt(f)">{{ f }}</button>
      </div>
      <button v-if="canFacilitate" class="est-secondary" data-testid="est-revote" @click="start">再投票</button>
    </div>
  </div>
</template>

<style scoped>
.est-block { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
.est-current, .est-adopted { font-size: 13px; color: var(--ink-1); }
.est-note { font-size: 12px; color: var(--ink-2); margin: 0; }
.est-fibs, .est-adopt-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.est-vote {
  min-width: 34px; padding: 6px 10px;
  border: var(--hairline) solid var(--line-2); background: var(--bg-0);
  border-radius: var(--radius); font-family: var(--mono); font-size: 13px; cursor: pointer;
}
.est-vote:hover { border-color: var(--accent); }
.est-vote.mine { background: var(--accent); color: #FBF8F2; border-color: var(--accent); }
.est-primary {
  align-self: flex-start; padding: 8px 16px;
  background: var(--accent); color: #FBF8F2; border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; cursor: pointer;
}
.est-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.est-secondary {
  align-self: flex-start; padding: 6px 14px;
  background: transparent; border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; cursor: pointer;
}
.est-votes { display: flex; flex-direction: column; gap: 4px; }
.est-vote-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: var(--hairline) solid var(--line-1); }
.est-name { color: var(--ink-1); }
.est-val { font-family: var(--mono); color: var(--ink-0); font-weight: 600; }
.est-warn { font-size: 12px; color: var(--err); margin: 0; }
</style>
