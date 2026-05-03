<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';
import { SPRINT } from '~/composables/useDemoData';

const props = defineProps<{ tickets: DemoTicket[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const sprintTickets = computed(() => props.tickets.filter((t) => t.sprint === 'S24'));
const done = computed(() => sprintTickets.value.filter((t) => t.status === 'DONE'));
const carry = computed(() => sprintTickets.value.filter((t) => t.status !== 'DONE'));
const doneSP = computed(() => done.value.reduce((n, t) => n + (t.sp ?? 0), 0));
const carrySP = computed(() => carry.value.reduce((n, t) => n + (t.sp ?? 0), 0));
const demos = computed(() =>
  sprintTickets.value.filter((t) => t.status === 'DONE' || t.status === 'REVIEW').slice(0, 4),
);

function thumbVariant(id: string) { return id.charCodeAt(id.length - 1) % 4; }

const highlights = [
  { id: 'BLV-208', text: '⌘K リリース後、社内利用 +60%' },
  { id: 'BLV-209', text: 'フォントサイズ 200KB 達成（−42%）' },
  { id: 'BLV-203', text: 'SMARTゴール入力UI を REVIEW へ' },
];
</script>

<template>
  <div class="screen-head">
    <div>
      <div class="floor"><span class="step" />FLOOR 03 / REVIEW</div>
      <h1>Sprint 24 — Review</h1>
      <div class="subtitle">
        ステークホルダー向けのデモと成果物の確認。AIが完了基準を満たすかチェック済み。
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Done</div><div class="v t-num">{{ doneSP }}<span style="font-size: 14px; color: var(--ink-3)">SP</span></div><div class="delta">{{ done.length }} items</div></div>
      <div class="stat"><div class="label">Carry</div><div class="v t-num accent">{{ carrySP }}</div><div class="delta">{{ carry.length }} items</div></div>
      <div class="stat"><div class="label">Goal</div><div class="v t-num">75<span style="font-size: 14px; color: var(--ink-3)">%</span></div><div class="delta">partial</div></div>
    </div>
  </div>

  <div class="review">
    <div class="review-main">
      <div class="t-cap" style="margin-bottom: 6px">SPRINT GOAL</div>
      <div style="font-size: 18px; letter-spacing: -0.01em; line-height: 1.5; border-left: 2px solid var(--accent); padding-left: 14px; margin-bottom: 6px">
        {{ SPRINT.goal }}
      </div>
      <div style="display: flex; gap: 18px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
        <span><span style="color: var(--ok)">●</span> AI形骸化チェック 4/4 リリース</span>
        <span><span style="color: var(--accent)">◐</span> 螺旋ナビ初版 — 実装中</span>
      </div>

      <div class="outcome-row">
        <div class="outcome-cell">
          <div class="l">Velocity (this sprint)</div>
          <div class="v t-num">{{ doneSP }}<span style="font-size: 13px; color: var(--ink-3); margin-left: 4px">SP</span></div>
          <div style="font-family: var(--mono); font-size: 10px; color: var(--ink-3); margin-top: 4px">vs avg 26.7 → −9</div>
        </div>
        <div class="outcome-cell">
          <div class="l">Acceptance Pass Rate</div>
          <div class="v t-num">100<span style="font-size: 13px; color: var(--ink-3)">%</span></div>
          <div style="font-family: var(--mono); font-size: 10px; color: var(--ok); margin-top: 4px">all DONE pass AC</div>
        </div>
      </div>

      <div style="display: flex; align-items: baseline; gap: 12px; margin-top: 12px">
        <h2 style="margin: 0; font-size: 14px; font-weight: 500">Demos</h2>
        <span class="t-cap">{{ demos.length }} READY</span>
        <span style="margin-left: auto" />
        <button class="h-btn"><Icon name="sparkle" /> AI: Generate demo script</button>
      </div>
      <div class="demo-grid">
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
              <Avatar :user="t.assignee" />
              <span style="flex: 1" />
              <span><Icon name="comment" /> 4</span>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top: 24px">
        <h2 style="margin: 0 0 8px; font-size: 14px; font-weight: 500">Carry-over candidates</h2>
        <div style="border: 1px solid var(--line-1)">
          <TicketRow v-for="t in carry" :key="t.id" :t="t" @click="emit('select', t.id)">
            <template #extra>
              <StatusDot :status="t.status" />
            </template>
          </TicketRow>
        </div>
      </div>
    </div>

    <aside class="review-aside">
      <div class="t-cap" style="margin-bottom: 8px">STAKEHOLDER NOTES</div>
      <div style="font-size: 12.5px; color: var(--ink-1); line-height: 1.6; margin-bottom: 18px">
        CTOから<span style="color: var(--accent)">螺旋ナビ初版のスクロール挙動</span>について
        フィードバックあり。次スプリントで対応予定。
      </div>

      <div class="t-cap" style="margin-bottom: 8px">HIGHLIGHTS</div>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px">
        <div v-for="h in highlights" :key="h.id" style="border-left: 2px solid var(--ok); padding-left: 10px">
          <div style="font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); letter-spacing: 0.04em">{{ h.id }}</div>
          <div style="font-size: 12px; margin-top: 2px">{{ h.text }}</div>
        </div>
      </div>

      <div class="t-cap" style="margin-bottom: 8px">RISKS / CARRY</div>
      <div style="display: flex; flex-direction: column; gap: 10px">
        <div style="border-left: 2px solid var(--accent); padding-left: 10px">
          <div style="font-family: var(--mono); font-size: 9.5px; color: var(--ink-3)">BLV-207</div>
          <div style="font-size: 12px; margin-top: 2px">WebGL Spike 10日経過、技術選定を Spike として再切り出し</div>
        </div>
        <div style="border-left: 2px solid var(--err); padding-left: 10px">
          <div style="font-family: var(--mono); font-size: 9.5px; color: var(--ink-3)">BLV-210</div>
          <div style="font-size: 12px; margin-top: 2px">Blocked silent — 次スプリント冒頭に解消会議を実施</div>
        </div>
      </div>

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
