<script setup lang="ts">
import type { Ticket, ValueImpact } from '@belvedere/shared';
import { compareTicketOrder } from '@belvedere/shared';
import type { ReorderHit } from '~/composables/usePointerReorder';
import { computeOrderIndexBetween, ORDER_STEP } from '~/composables/useTicketReorder';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  goRetro: [];
}>();

const { activeSprint, sprints, velocityHistory } = useSprints();
const { patchTicket, createTicket } = useTickets();
const { members } = useMembers();

// 複数選択 → 一括変更/削除 (画面ローカル)。全選択 = carry-over 候補全件。
const sel = useTicketSelection();

const sprintTickets = computed(() =>
  activeSprint.value ? props.tickets.filter((t) => t.sprintId === activeSprint.value!.id) : [],
);
const done = computed(() => sprintTickets.value.filter((t) => t.status === 'done'));
// Carry-over は「次スプリントへの持ち越し優先度」を d&d で決められるよう orderIndex 順に。
const carry = computed(() =>
  [...sprintTickets.value.filter((t) => t.status !== 'done')].sort(compareTicketOrder),
);

// 持ち越し候補の並び替え — pointer ベース (usePointerReorder)。
// native DnD は実機で確定が取りこぼされるため廃止。
function carryResolveAt(x: number, y: number, draggedId: string): ReorderHit {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const rowEl = el?.closest('[data-ticket-id]') as HTMLElement | null;
  const rid = rowEl?.getAttribute('data-ticket-id') ?? null;
  let id: string | null = null;
  let edge: 'before' | 'after' | null = null;
  if (rowEl && rid && rid !== draggedId) {
    id = rid;
    const r = rowEl.getBoundingClientRect();
    edge = y < r.top + r.height / 2 ? 'before' : 'after';
  }
  // section は単一 ('carry') なので固定で返す。
  return { id, section: 'carry', edge };
}

async function carryCommitFn(c: {
  draggedId: string; originSection: string; targetSection: string;
  targetId: string | null; edge: 'before' | 'after' | null;
}): Promise<void> {
  if (!c.targetId) return;
  const list = carry.value;
  const newIndex = computeOrderIndexBetween(list, c.draggedId, c.targetId, c.edge === 'before');
  if (newIndex === null) {
    // gap 枯渇: 一括リバランス
    const without = list.filter((t) => t.id !== c.draggedId);
    const dragged = list.find((t) => t.id === c.draggedId);
    if (!dragged) return;
    const idx = without.findIndex((t) => t.id === c.targetId);
    const ins = idx === -1 ? without.length : c.edge === 'before' ? idx : idx + 1;
    const reordered = [...without.slice(0, ins), dragged, ...without.slice(ins)];
    for (let i = 0; i < reordered.length; i++) {
      const t = reordered[i];
      if (t) await patchTicket(t.id, { orderIndex: (i + 1) * ORDER_STEP });
    }
    return;
  }
  await patchTicket(c.draggedId, { orderIndex: newIndex });
}

const { draggingId: carryDragId, dropEdgeFor: carryDropEdgeFor, start: carryStart } =
  usePointerReorder({ resolveAt: carryResolveAt, commit: carryCommitFn });
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

// Demos: done / review チケット (架空サムネなし、正直なカード表示)
const demos = computed(() =>
  sprintTickets.value.filter((t) => t.status === 'done' || t.status === 'review').slice(0, 4),
);

// highlights / risks は live チケットから生成 (架空 ID を出さない)
const highlights = computed(() => done.value.slice(0, 3).map((t) => ({ id: t.id, text: t.title })));
const risks = computed(() => carry.value.slice(0, 2).map((t) => ({ id: t.id, text: t.title })));

// ステークホルダーフィードバック → バックログ起票
const feedbackText = ref('');
const feedbackImpact = ref<ValueImpact>('medium');
const feedbackSubmitting = ref(false);
const feedbackConfirm = ref(false);

async function submitFeedback() {
  const title = feedbackText.value.trim();
  if (!title) return;
  feedbackSubmitting.value = true;
  feedbackConfirm.value = false;
  await createTicket({ title, status: 'backlog', type: 'story', valueImpact: feedbackImpact.value });
  feedbackText.value = '';
  feedbackImpact.value = 'medium';
  feedbackSubmitting.value = false;
  feedbackConfirm.value = true;
  setTimeout(() => { feedbackConfirm.value = false; }, 2500);
}
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
      </div>
      <p style="font-family: var(--sans); font-size: 11px; color: var(--ink-3); margin: 4px 0 10px">
        preview URL は Reviewer Agent (Phase 3-A) が自動生成予定。
      </p>
      <div v-if="demos.length > 0" style="border: 1px solid var(--line-1); margin-top: 2px">
        <div v-for="t in demos" :key="t.id" class="demo-row" @click="emit('select', t.id)">
          <span class="demo-row-id">{{ t.id }}</span>
          <span class="demo-row-ttl">{{ t.title }}</span>
          <StatusDot :status="t.status" />
          <Avatar :user="t.assigneeId" />
        </div>
      </div>
      <p v-else style="font-family: var(--sans); font-size: 13px; color: var(--ink-2); padding: 12px 0">
        デモ対象 (done / review) のチケットがまだありません。
      </p>

      <div style="margin-top: 24px">
        <h2 style="margin: 0 0 8px; font-size: 14px; font-weight: 500">Carry-over candidates</h2>
        <div style="border: 1px solid var(--line-1)">
          <BulkActionBar
            v-if="sel.count.value > 0"
            :count="sel.count.value"
            :members="members"
            :sprints="sprints"
            :busy="sel.isBusy.value"
            @set-status="(s) => sel.applyToSelected({ status: s })"
            @set-assignee="(a) => sel.applyToSelected({ assigneeId: a })"
            @set-priority="(p) => sel.applyToSelected({ priority: p })"
            @set-value-impact="(v) => sel.applyToSelected({ valueImpact: v })"
            @set-sprint="(sp) => sel.applyToSelected({ sprintId: sp })"
            @remove="sel.removeSelected"
            @clear="sel.clear"
            @select-all="() => sel.selectMany(carry.map((t) => t.id))"
          />
          <TicketRow v-for="t in carry" :key="t.id" :t="t" :selected="selectedId === t.id"
                     drag-handle reorderable
                     selectable :bulk-selected="sel.isSelected(t.id)"
                     :drop-edge="carryDropEdgeFor(t.id)" :dragging="carryDragId === t.id"
                     @click="emit('select', t.id)"
                     @toggle-select="sel.toggle(t.id)"
                     @handle-down="(e) => carryStart('carry', t.id, e)">
            <template #extra>
              <StatusDot :status="t.status" />
            </template>
          </TicketRow>
          <p v-if="carry.length === 0" style="padding: 12px 16px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
            未完了チケットはありません。
          </p>
        </div>
      </div>
      <!-- ステークホルダーフィードバック → バックログ起票 -->
      <div style="margin-top: 28px">
        <h2 style="margin: 0 0 6px; font-size: 14px; font-weight: 500">ステークホルダーフィードバック</h2>
        <p style="font-family: var(--sans); font-size: 12px; color: var(--ink-2); margin: 0 0 12px">
          フィードバックをバックログに追加して次スプリントの計画に活かします。
        </p>
        <div class="feedback-form">
          <textarea
            v-model="feedbackText"
            class="feedback-input"
            rows="2"
            placeholder="例: ダッシュボードのフィルタが分かりにくい"
            data-testid="review-feedback-input"
            @keydown.enter.meta.prevent="submitFeedback"
          />
          <div class="feedback-controls">
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-family: var(--mono); font-size: 10px; color: var(--ink-3); letter-spacing: 0.04em; text-transform: uppercase">VALUE</span>
              <select
                v-model="feedbackImpact"
                class="feedback-select"
                data-testid="review-feedback-impact"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <span style="flex: 1" />
            <span v-if="feedbackConfirm" style="font-family: var(--mono); font-size: 11px; color: var(--ok)">追加しました</span>
            <button
              class="h-btn"
              :disabled="feedbackSubmitting || !feedbackText.trim()"
              style="background: var(--accent); color: #FBF8F2"
              data-testid="review-feedback-submit"
              @click="submitFeedback"
            >
              バックログに追加
            </button>
          </div>
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
        <button class="h-btn" style="background: var(--accent); color: #FBF8F2; font-family: var(--mono); letter-spacing: 0.08em" @click="emit('goRetro')">
          GO TO RETRO →
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.demo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: var(--hairline) solid var(--line-1);
  cursor: pointer;
  transition: background 0.12s ease;
}
.demo-row:last-child { border-bottom: none; }
.demo-row:hover { background: var(--bg-2); }
.demo-row-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.08em;
  flex-shrink: 0;
  min-width: 80px;
}
.demo-row-ttl {
  font-size: 13px;
  color: var(--ink-0);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feedback-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--bg-1);
}
.feedback-input {
  width: 100%;
  resize: vertical;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans);
  font-size: 13px;
  padding: 8px 10px;
  color: var(--ink-0);
  box-sizing: border-box;
}
.feedback-input:focus {
  outline: none;
  border-color: var(--accent);
}
.feedback-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.feedback-select {
  padding: 4px 8px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-1);
}
.feedback-select:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
