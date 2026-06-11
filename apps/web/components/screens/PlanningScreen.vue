<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint, velocityHistory } = useSprints();
const { members } = useMembers();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const capacity = computed(() => activeSprint.value?.capacity ?? 32);
const overBy = computed(() => totalSP.value - capacity.value);
const goal = computed(() => activeSprint.value?.goal ?? 'スプリントゴールが設定されていません');

// SMART は構造ガイド (汎用)。実評価は AI 連携で別途。
const smart = [
  { letter: 'S', name: 'Specific', ok: true, note: 'ゴールが具体的か' },
  { letter: 'M', name: 'Measurable', ok: false, note: '測定可能な指標があるか' },
  { letter: 'A', name: 'Attainable', ok: true, note: '容量内に収まるか' },
  { letter: 'R', name: 'Relevant', ok: true, note: 'ロードマップに整合するか' },
  { letter: 'T', name: 'Time-bound', ok: true, note: '期限が明確か' },
];

const memberLoad = computed(() =>
  members.value.map((m) => {
    const items = sprintTickets.value.filter((t) => t.assigneeId === m.userId);
    return {
      userId: m.userId,
      name: m.displayName,
      sp: items.reduce((n, t) => n + (t.estimatePt ?? 0), 0),
      max: 13,
      count: items.length,
    };
  }),
);

const velMax = computed(() => Math.max(35, ...velocityHistory.value.map((v) => v.velocity)));
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 01 / PLANNING</div>
      <h1>{{ activeSprint ? `Sprint ${activeSprint.number} — Planning` : 'Sprint Planning' }}</h1>
      <div class="subtitle">
        ゴールの具体性、容量、リスクを点検します。AIが容量とゴール紐付けを確認しています。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Capacity</div><div class="v t-num">{{ capacity }}</div><div class="delta">SP</div></div>
      <div class="stat"><div class="label">Planned</div><div class="v t-num accent">{{ totalSP }}</div><div class="delta">{{ overBy > 0 ? `+${overBy} over` : `${-overBy} free` }}</div></div>
      <div class="stat"><div class="label">Items</div><div class="v t-num">{{ sprintTickets.length }}</div><div class="delta">tickets</div></div>
      <div class="stat"><div class="label">Members</div><div class="v t-num">{{ members.length }}</div><div class="delta">team</div></div>
    </div>
  </div>

  <div class="planning">
    <!-- LEFT — goal + items -->
    <div class="col">
      <div class="goal-block">
        <div class="t-cap" style="margin-bottom: 8px">SPRINT GOAL</div>
        <div class="goal-text">{{ goal }}</div>
        <div class="smart-row">
          <div v-for="s in smart" :key="s.letter" :class="['smart-cell', s.ok ? 'ok' : 'weak']">
            <div class="letter">{{ s.letter }}</div>
            <div class="name">{{ s.name }}</div>
            <div class="check" :style="{ color: s.ok ? 'var(--ok)' : 'var(--accent)' }">
              {{ s.ok ? '✓' : '△' }}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 14px; font-size: 11.5px; color: var(--ink-2)">
          <Icon name="sparkle" />
          <span>AI: ゴールに <b style="color: var(--ink-0)">測定可能な指標</b>を加えると、レビュー時の判定が明確になります。</span>
        </div>
      </div>

      <div class="col-head" style="border-top: none">
        <h2>Sprint items</h2>
        <span class="t-cap">{{ sprintTickets.length }} planned</span>
        <span style="margin-left: auto" />
        <button class="h-btn"><Icon name="plus" /> Pull from backlog</button>
      </div>
      <div class="col-body">
        <TicketRow v-for="t in sprintTickets" :key="t.id" :t="t"
                   :selected="selectedId === t.id" drag-handle
                   @click="emit('select', t.id)" />
        <p v-if="sprintTickets.length === 0" style="padding: 16px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
          アクティブスプリントにチケットがありません。
        </p>
      </div>
    </div>

    <!-- RIGHT — capacity + members -->
    <div class="col">
      <div class="capacity">
        <div class="capacity-head">
          <div class="t-cap">CAPACITY</div>
          <div style="font-family: var(--mono); font-size: 11px; color: var(--accent)">
            {{ overBy > 0 ? `+${overBy} SP OVER` : `${-overBy} SP FREE` }}
          </div>
        </div>
        <div class="capacity-num">
          <span style="color: var(--accent)">{{ totalSP }}</span>
          <span class="div">/</span>
          <span class="total">{{ capacity }}</span>
        </div>
        <div class="capacity-bar" style="margin-top: 14px">
          <i v-for="i in 33" :key="i" :class="i - 1 < capacity ? '' : 'over'" />
        </div>
        <div class="capacity-legend">
          <span class="it"><i style="background: var(--ink-2)" />Planned</span>
          <span class="it"><i style="background: var(--accent)" />Over capacity</span>
          <span class="it"><i style="background: var(--bg-3)" />Available</span>
        </div>
      </div>

      <div class="col-head" style="border-top: none">
        <h2>Per-member load</h2>
        <span class="t-cap">{{ members.length }} members</span>
      </div>
      <div class="member-rows">
        <div v-for="m in memberLoad" :key="m.userId" class="member-row">
          <Avatar :user="m.userId" />
          <span>{{ m.name }}</span>
          <div class="meter">
            <i :class="m.sp > m.max ? 'amber' : ''" :style="{ width: `${Math.min(100, (m.sp / m.max) * 100)}%` }" />
          </div>
          <span class="v"><span class="t-num">{{ m.sp }}</span><span class="max">/{{ m.max }}</span></span>
        </div>
        <p v-if="memberLoad.length === 0" style="padding: 12px 18px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
          メンバー情報を読み込み中…
        </p>
      </div>

      <div class="col-head" style="border-top: var(--hairline) solid var(--line-1)">
        <h2>Velocity</h2>
        <span class="t-cap">completed sprints</span>
      </div>
      <div style="padding: 18px 18px 24px">
        <svg v-if="velocityHistory.length > 0" viewBox="0 0 360 120" style="width: 100%; height: 120px">
          <line x1="0" y1="80" x2="360" y2="80" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 4" />
          <g v-for="(v, i) in velocityHistory" :key="v.number">
            <rect :x="i * 48 + 8" :y="110 - (v.velocity / velMax) * 100" :width="40" :height="(v.velocity / velMax) * 100"
                  :fill="i === velocityHistory.length - 1 ? 'var(--accent)' : 'var(--ink-2)'" />
            <text :x="i * 48 + 28" y="118" font-size="9" fill="var(--ink-3)" text-anchor="middle" font-family="var(--mono)">S{{ v.number }}</text>
            <text :x="i * 48 + 28" :y="107 - (v.velocity / velMax) * 100" font-size="10" fill="var(--ink-1)" text-anchor="middle" font-family="var(--mono)">{{ v.velocity }}</text>
          </g>
        </svg>
        <p v-else style="font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
          完了済スプリントのベロシティ実績がまだありません。
        </p>
      </div>
    </div>
  </div>
</template>
