<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';
import { compareTicketOrder } from '@belvedere/shared';
import { VueDraggable } from 'vue-draggable-plus';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  goRetro: [];
}>();

const { activeSprint, sprints, velocityHistory } = useSprints();
const { reorderTickets, patchTicket } = useTickets();
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

// 持ち越し候補の並び替え — SortableJS (vue-draggable-plus)。単一リストなので group 不要。
// carry は computed なので可変ミラーを v-model に渡し、onEnd で近傍から orderIndex を patch。
const carryList = ref<Ticket[]>([]);
watch(carry, (v) => { carryList.value = [...v]; }, { immediate: true });

async function onCarryEnd(evt: { item: HTMLElement }): Promise<void> {
  const id = evt.item?.getAttribute?.('data-ticket-id') ?? null;
  if (!id) return;
  if (!carryList.value.some((t) => t.id === id)) return;
  // carry (非 done / 新並び順) の後に done を続けて active sprint 区画を「全件」密再採番する。
  // carry だけ送ると done が旧 orderIndex のまま残り、他画面の CURRENT 区画 (done 含む) で
  // 新旧 orderIndex が混在し順序が崩れる (= 報告バグと同型) ため done も必ず含める。
  const orderedIds = [...carryList.value.map((t) => t.id), ...done.value.map((t) => t.id)];
  const res = await reorderTickets({ orderedIds });
  if (!res) carryList.value = [...carry.value]; // 失敗時はサーバ状態へ戻す
}
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

// ステークホルダーの指摘 → 対象チケット (完成 increment) の reviewNotes に追記。
// Review は完成チケットをデモして関係者が指摘する場なので、新規起票せず対象チケット自体に蓄積する。
// demo チケットごとに指摘入力欄を持つ (対象は demo-row = done/review チケット)。
const noteInput = ref<Record<string, string>>({});
// 二重送信防止は per-ticket。グローバルにすると 1 件送信中に他の demo 行の「指摘を追加」まで
// 無効化され、複数完成チケットへ並行に指摘を残せなくなるため、チケット id 単位で持つ。
const noteBusy = ref<Record<string, boolean>>({});

async function addReviewNote(t: Ticket): Promise<void> {
  const text = (noteInput.value[t.id] ?? '').trim();
  if (!text) return;
  if (noteBusy.value[t.id]) return; // 同一チケットの二重送信防止
  noteBusy.value[t.id] = true;
  try {
    // read→append: 対象チケットの現 reviewNotes を read → 新指摘を末尾に append → 全配列を PATCH。
    // 配列まるごと replace 契約なので、既存を消さないために必ず append した全配列を送る。
    const next = [...(t.reviewNotes ?? []), text];
    const updated = await patchTicket(t.id, { reviewNotes: next });
    if (updated) noteInput.value[t.id] = ''; // 成功時のみ入力クリア
  } finally {
    noteBusy.value[t.id] = false;
  }
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
        <div v-for="t in demos" :key="t.id" class="demo-cell" data-testid="review-demo-cell">
          <div class="demo-row" @click="emit('select', t.id)">
            <span class="demo-row-id">{{ t.id }}</span>
            <span class="demo-row-ttl">{{ t.title }}</span>
            <span v-if="t.reviewNotes && t.reviewNotes.length > 0" class="demo-note-count" data-testid="review-note-count">
              指摘 {{ t.reviewNotes.length }}
            </span>
            <StatusDot :status="t.status" />
            <Avatar :user="t.assigneeId" />
          </div>
          <!-- 既存指摘の一覧 (この完成 increment への関係者指摘)。空なら非表示。 -->
          <ul v-if="t.reviewNotes && t.reviewNotes.length > 0" class="demo-notes" data-testid="review-note-list">
            <li v-for="(n, i) in t.reviewNotes" :key="i">{{ n }}</li>
          </ul>
          <!-- 指摘追記 (read→append→PATCH)。新規起票しない。 -->
          <div class="demo-note-add">
            <textarea
              v-model="noteInput[t.id]"
              class="demo-note-input"
              rows="1"
              placeholder="このチケットへの指摘を残す (例: フィルタが分かりにくい)"
              data-testid="review-note-input"
              @keydown.enter.meta.prevent="addReviewNote(t)"
            />
            <button
              class="h-btn"
              :disabled="noteBusy[t.id] || !(noteInput[t.id] ?? '').trim()"
              style="background: var(--accent); color: #FBF8F2"
              data-testid="review-note-add"
              @click="addReviewNote(t)"
            >
              指摘を追加
            </button>
          </div>
        </div>
      </div>
      <p v-else style="font-family: var(--sans); font-size: 13px; color: var(--ink-2); padding: 12px 0">
        デモ対象 (done / review) のチケットがまだありません。
      </p>

      <div style="margin-top: 24px">
        <h2 style="margin: 0 0 8px; font-size: 14px; font-weight: 500">Carry-over candidates</h2>
        <div data-testid="carry-list" style="border: 1px solid var(--line-1)">
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
          <VueDraggable v-model="carryList" handle=".trow-drag-grab" :animation="150"
                        :force-fallback="true" class="dnd-list" @end="onCarryEnd">
            <TicketRow v-for="t in carryList" :key="t.id" :t="t" :selected="selectedId === t.id"
                       drag-handle reorderable
                       selectable :bulk-selected="sel.isSelected(t.id)"
                       @click="emit('select', t.id)"
                       @toggle-select="sel.toggle(t.id)">
              <template #extra>
                <StatusDot :status="t.status" />
              </template>
            </TicketRow>
          </VueDraggable>
          <p v-if="carryList.length === 0" style="padding: 12px 16px; font-family: var(--sans); font-size: 13px; color: var(--ink-2)">
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
/* demo セル: 行 + 既存指摘リスト + 指摘追記欄 をまとめる単位 */
.demo-cell {
  border-bottom: var(--hairline) solid var(--line-1);
}
.demo-cell:last-child { border-bottom: none; }
.demo-note-count {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.demo-notes {
  margin: 0;
  padding: 0 16px 8px 96px;
  list-style: none;
}
.demo-notes li {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-1);
  padding: 3px 0;
  border-left: 2px solid var(--accent);
  padding-left: 10px;
  margin-bottom: 4px;
}
.demo-note-add {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0 16px 12px 96px;
}
.demo-note-input {
  flex: 1;
  resize: vertical;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans);
  font-size: 13px;
  padding: 6px 10px;
  color: var(--ink-0);
  box-sizing: border-box;
}
.demo-note-input:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
