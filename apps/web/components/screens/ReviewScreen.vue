<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{ tickets: Ticket[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint, velocityHistory } = useSprints();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);
const done = computed(() => sprintTickets.value.filter((t) => t.status === 'done'));
const carry = computed(() => sprintTickets.value.filter((t) => t.status !== 'done'));
const doneSP = computed(() => done.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const totalSP = computed(() => sprintTickets.value.reduce((n, t) => n + (t.estimatePt ?? 0), 0));
const goal = computed(() => activeSprint.value?.goal ?? 'スプリントゴールが設定されていません');

// 消化 SP を過去スプリントの velocity 実績と比較した達成割合。
const avgVelocity = computed(() => {
  const vs = velocityHistory.value;
  if (vs.length === 0) return 0;
  return Math.round(vs.reduce((n, v) => n + v.velocity, 0) / vs.length);
});
const hasVelocity = computed(() => avgVelocity.value > 0);
const velocityPct = computed(() => (hasVelocity.value ? Math.round((doneSP.value / avgVelocity.value) * 100) : 0));
const demos = computed(() =>
  sprintTickets.value.filter((t) => t.status === 'done' || t.status === 'review').slice(0, 4),
);

function thumbVariant(id: string) { return id.charCodeAt(id.length - 1) % 4; }

// highlights / risks は live チケットから生成 (架空 ID を出さない)
const highlights = computed(() => done.value.slice(0, 3).map((t) => ({ id: t.id, text: t.title })));
const risks = computed(() => carry.value.slice(0, 2).map((t) => ({ id: t.id, text: t.title })));
</script>

<template>
  <div class="review">
    <div class="review-main">
      <div class="t-cap" style="margin-bottom: 6px">SPRINT GOAL</div>
      <div style="font-size: 18px; letter-spacing: -0.01em; line-height: 1.5; border-left: 2px solid var(--accent); padding-left: 14px; margin-bottom: 14px">
        {{ goal }}
      </div>

      <!-- 消化 SP / 目標 velocity の達成割合 -->
      <div class="review-velocity">
        <div class="rv-bar">
          <i :style="{ width: `${Math.min(100, velocityPct)}%` }" />
        </div>
        <div class="rv-nums">
          <span class="big">{{ doneSP }}</span>
          <span class="sep">/</span>
          <span class="vel">{{ hasVelocity ? avgVelocity : '—' }}</span>
          <span class="lbl">消化 SP / 目標 velocity</span>
          <span class="pct">{{ hasVelocity ? `${velocityPct}%` : '実績なし' }}</span>
        </div>
      </div>

      <div style="display: flex; align-items: baseline; gap: 12px; margin-top: 22px">
        <h2 style="margin: 0; font-size: 14px; font-weight: 500">Demos</h2>
        <span class="t-cap">{{ demos.length }} READY</span>
        <span style="margin-left: auto" />
        <button class="h-btn"><Icon name="sparkle" /> AI: Generate demo script</button>
      </div>
      <div v-if="demos.length > 0" class="demo-grid">
        <div v-for="t in demos" :key="t.id" class="demo-card" @click="emit('select', t.id)">
          <div class="demo-thumb">
            <svg viewBox="0 0 280 140" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern :id="'g' + t.id" width="14" height="14" patternUnits="userSpaceOnUse">
                  <path d="M0 14L14 0" stroke="var(--line-2)" stroke-width="0.5" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="280" height="140" :fill="`url(#g${t.id})`" />
              <g v-if="thumbVariant(t.id) === 0" stroke="var(--ink-1)" stroke-width="1" fill="none">
                <rect x="40" y="30" width="200" height="80" />
                <line x1="40" y1="50" x2="240" y2="50" />
                <rect x="50" y="60" width="60" height="40" fill="var(--accent)" stroke="none" opacity="0.3" />
                <rect x="120" y="60" width="60" height="40" />
                <rect x="190" y="60" width="40" height="40" />
              </g>
              <g v-else-if="thumbVariant(t.id) === 1" stroke="var(--accent)" stroke-width="1" fill="none">
                <circle cx="140" cy="70" r="50" />
                <circle cx="140" cy="70" r="32" />
                <circle cx="140" cy="70" r="16" />
                <circle cx="140" cy="70" r="3" fill="var(--accent)" />
              </g>
              <g v-else-if="thumbVariant(t.id) === 2" stroke="var(--ink-1)" stroke-width="1" fill="none">
                <path d="M30 100 L80 60 L130 80 L180 40 L230 50 L260 30" />
                <circle cx="180" cy="40" r="3" fill="var(--accent)" />
                <line x1="30" y1="100" x2="260" y2="100" stroke="var(--line-2)" />
              </g>
              <g v-else stroke="var(--ink-1)" stroke-width="1" fill="none">
                <rect x="60" y="20" width="160" height="100" />
                <rect x="70" y="32" width="60" height="8" fill="var(--ink-2)" stroke="none" />
                <rect x="70" y="48" width="140" height="2" fill="var(--line-2)" stroke="none" />
                <rect x="70" y="58" width="100" height="2" fill="var(--line-2)" stroke="none" />
                <rect x="70" y="68" width="120" height="2" fill="var(--line-2)" stroke="none" />
                <rect x="170" y="92" width="40" height="14" fill="var(--accent)" stroke="none" />
              </g>
            </svg>
          </div>
          <div class="body">
            <div class="id">{{ t.id }}</div>
            <div class="ttl">{{ t.title }}</div>
            <div class="row">
              <StatusDot :status="t.status" />
              <Avatar :user="t.assigneeId" />
              <span style="flex: 1" />
            </div>
          </div>
        </div>
      </div>
      <p v-else style="font-family: var(--sans); font-size: 13px; color: var(--ink-2); padding: 12px 0">
        デモ対象 (done / review) のチケットがまだありません。
      </p>

      <div style="margin-top: 24px">
        <h2 style="margin: 0 0 8px; font-size: 14px; font-weight: 500">Carry-over candidates</h2>
        <div style="border: 1px solid var(--line-1)">
          <TicketRow v-for="t in carry" :key="t.id" :t="t" @click="emit('select', t.id)">
            <template #extra>
              <StatusDot :status="t.status" />
            </template>
          </TicketRow>
          <p v-if="carry.length === 0" style="padding: 12px 16px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
            未完了チケットはありません。
          </p>
        </div>
      </div>
    </div>

    <aside class="review-aside">
      <div class="t-cap" style="margin-bottom: 8px">HIGHLIGHTS</div>
      <div v-if="highlights.length > 0" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px">
        <div v-for="h in highlights" :key="h.id" style="border-left: 2px solid var(--ok); padding-left: 10px">
          <div style="font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); letter-spacing: 0.04em">{{ h.id }}</div>
          <div style="font-size: 12px; margin-top: 2px">{{ h.text }}</div>
        </div>
      </div>
      <div v-else style="font-size: 12px; color: var(--ink-2); margin-bottom: 18px">完了チケットがまだありません。</div>

      <div class="t-cap" style="margin-bottom: 8px">RISKS / CARRY</div>
      <div v-if="risks.length > 0" style="display: flex; flex-direction: column; gap: 10px">
        <div v-for="r in risks" :key="r.id" style="border-left: 2px solid var(--accent); padding-left: 10px">
          <div style="font-family: var(--mono); font-size: 9.5px; color: var(--ink-3)">{{ r.id }}</div>
          <div style="font-size: 12px; margin-top: 2px">{{ r.text }}</div>
        </div>
      </div>
      <div v-else style="font-size: 12px; color: var(--ink-2)">キャリーオーバー候補はありません。</div>

      <div style="margin-top: 24px; padding: 12px; border: 1px solid var(--line-2)">
        <div class="t-cap" style="margin-bottom: 6px">NEXT STEP</div>
        <div style="font-size: 12px; margin-bottom: 10px; color: var(--ink-1)">レトロスペクティブへ進む</div>
        <button class="h-btn" style="background: var(--accent); color: #FBF8F2; font-family: var(--mono); letter-spacing: 0.08em">
          GO TO RETRO →
        </button>
      </div>
    </aside>
  </div>
</template>
