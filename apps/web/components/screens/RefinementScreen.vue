<script setup lang="ts">
// Backlog Refinement 画面 (T9)。Refinement Agent の検出結果を「会で上から潰すワークキュー」
// としてルール別に表示する。STORY_SP_MISSING のストーリーは「ポーカー開始」で T7 の見積もりへ。
import type { Ticket } from '@belvedere/shared';
import { compareTicketOrder } from '@belvedere/shared';
import type { FindingSeverity, TicketFinding } from '~/composables/useFindings';
import { RULE_LABELS } from '~/composables/useFindings';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  startPoker: [id: string];
}>();

const { patchTicket } = useTickets();
const { findingsByTicket, fetchFindings, isLoading } = useFindings();
onMounted(() => { fetchFindings('refinement'); });

function ticketById(id: string): Ticket | undefined {
  return props.tickets.find((t) => t.id === id);
}

const SEV_ORDER: Record<FindingSeverity, number> = { error: 0, warn: 1, info: 2 };

interface Group {
  ruleId: string;
  label: string;
  severity: FindingSeverity;
  findings: TicketFinding[];
}

// ルール別グループ (severity 悪い順)。ticket に解決できない aggregate finding は除外。
// グループ内チケットは compareTicketOrder (orderIndex 昇順 → priority → createdAt) でソート。
const groups = computed<Group[]>(() => {
  const map = new Map<string, Group>();
  for (const arr of Object.values(findingsByTicket.value)) {
    for (const f of arr) {
      if (!ticketById(f.ticketId)) continue;
      let g = map.get(f.ruleId);
      if (!g) {
        g = { ruleId: f.ruleId, label: RULE_LABELS[f.ruleId] ?? f.ruleId, severity: f.severity, findings: [] };
        map.set(f.ruleId, g);
      }
      g.findings.push(f);
    }
  }
  // findings 内のチケットを compareTicketOrder でソートする (並び替え結果を視覚に反映)。
  const result = [...map.values()].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  for (const g of result) {
    g.findings.sort((a, b) => {
      const ta = ticketById(a.ticketId);
      const tb = ticketById(b.ticketId);
      if (!ta || !tb) return 0;
      return compareTicketOrder(ta, tb);
    });
  }
  return result;
});

// ===== グループ内並び替え =====
// draggingGroupId: ドラッグ中の行が属するグループの ruleId。
// onReorderOver / onReorderDrop は同一グループ内の行にのみ適用する。
const draggingGroupId = ref<string | null>(null);

// グループ内のチケット配列 (compareTicketOrder 済み) を sorted として渡す。
// グループが変わると groups computed が再計算されるため、
// sortedForGroup は都度計算する (ドロップ時にも最新の順を参照する必要がある)。
function sortedTicketsForGroup(ruleId: string): Ticket[] {
  const g = groups.value.find((x) => x.ruleId === ruleId);
  if (!g) return [];
  return g.findings.map((f) => ticketById(f.ticketId)).filter((t): t is Ticket => t !== undefined);
}

// 全グループ共通の reorder composable インスタンス。
// sorted は「現在ドラッグ中のグループのチケット配列」を動的に参照する。
// draggingGroupId が null のときは空配列 (onReorderDrop が呼ばれないため問題なし)。
const _refSorted = computed<Ticket[]>(() => {
  if (!draggingGroupId.value) return [];
  return sortedTicketsForGroup(draggingGroupId.value);
});

const { dropEdgeFor, onReorderStart: _reorderStart, onReorderOver, onReorderDrop, onReorderEnd: _reorderEnd } =
  useTicketReorder({
    sorted: _refSorted,
    patch: (id, body) => patchTicket(id, body),
  });

function onReorderStart(id: string, ruleId: string): void {
  draggingGroupId.value = ruleId;
  _reorderStart(id);
}

function onReorderEnd(): void {
  draggingGroupId.value = null;
  _reorderEnd();
}

// 同一グループ内の行にのみ dragover / drop を転送する。
function onGroupReorderOver(id: string, ruleId: string, evt: DragEvent): void {
  if (draggingGroupId.value !== ruleId) return;
  onReorderOver(id, evt);
}

function onGroupReorderDrop(id: string, ruleId: string): void {
  if (draggingGroupId.value !== ruleId) return;
  void onReorderDrop(id);
}

const sevClass: Record<FindingSeverity, string> = { error: 'sev-err', warn: 'sev-warn', info: 'sev-info' };
</script>

<template>
  <div class="screen-body" data-testid="refinement-body">
    <p v-if="isLoading && groups.length === 0" class="refine-msg">読み込み中…</p>
    <p v-else-if="groups.length === 0" class="refine-msg" data-testid="refine-empty">
      指摘はありません — バックログは健全です。
    </p>

    <div v-for="g in groups" :key="g.ruleId" class="refine-group">
      <div class="refine-group-head">
        <span class="finding-badge" :class="sevClass[g.severity]">{{ g.label }}</span>
        <span class="refine-count">{{ g.findings.length }}</span>
      </div>
      <TicketRow v-for="f in g.findings" :key="`${g.ruleId}-${f.ticketId}`"
                 :t="ticketById(f.ticketId)!"
                 :selected="selectedId === f.ticketId"
                 drag-handle reorderable
                 :drop-edge="dropEdgeFor(f.ticketId)"
                 @click="emit('select', f.ticketId)"
                 @reorder-start="onReorderStart(f.ticketId, g.ruleId)"
                 @reorder-over="(e) => onGroupReorderOver(f.ticketId, g.ruleId, e)"
                 @reorder-drop="onGroupReorderDrop(f.ticketId, g.ruleId)"
                 @reorder-end="onReorderEnd">
        <template #extra>
          <button v-if="g.ruleId === 'STORY_SP_MISSING'"
                  class="poker-btn"
                  :data-testid="`ref-start-poker-${f.ticketId}`"
                  @click.stop="emit('startPoker', f.ticketId)">
            ポーカー開始
          </button>
        </template>
      </TicketRow>
    </div>
  </div>
</template>

<style scoped>
.refine-msg {
  padding: 16px 24px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
}
.refine-group {
  margin-bottom: 8px;
}
.refine-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px 8px;
}
.refine-count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
}
.poker-btn {
  padding: 4px 12px;
  background: var(--accent);
  color: #FBF8F2;
  border: none;
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
}
.poker-btn:hover {
  background: var(--accent-dim);
}
</style>
