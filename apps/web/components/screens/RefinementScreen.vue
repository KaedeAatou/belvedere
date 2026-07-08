<script setup lang="ts">
// Backlog Refinement 画面 (floor 03 / Wave 1 で 3 区画共通ビューに統一)。
// ルール別グルーピング / 優先順タブは廃止し、CURRENT / NEXT / BACKLOG の 3 区画で表示する。
// finding ピルは TicketRow が行内に描く。STORY_SP_MISSING のストーリーは行右の「ポーカー開始」で見積もりへ。
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  startPoker: [id: string];
}>();

const { fetchFindings, findingsFor } = useFindings();
const { members } = useMembers();
const { sprints, currentLabel, nextLabel } = useSprints();
onMounted(() => { fetchFindings('refinement'); });

// 全チケットを 3 区画へ振り分ける (フィルタなし)。
const allTickets = computed(() => props.tickets);
const { current, next, backlog } = useSprintSections(allTickets);

// SP 未見積もりの story / bug か (ポーカー開始ボタンの表示条件)。bug も見積もり対象 (F-20 / 2026-07-08)。
function needsPoker(t: Ticket): boolean {
  return findingsFor(t.id).some((f) => f.ruleId === 'STORY_SP_MISSING' || f.ruleId === 'BUG_SP_MISSING');
}

// 区画跨ぎ d&d 移動 (sprintId 変更) は SprintSectionedList.onDragEnd → reorderTickets が直接担う
// (旧 @move-to-section emit 経路は撤去済)。
</script>

<template>
  <div data-testid="refinement-body" style="flex: 1; display: flex; flex-direction: column; overflow: hidden">
    <SprintSectionedList
      :current="current" :next="next" :backlog="backlog"
      :selected-id="selectedId"
      :members="members" :sprints="sprints"
      :current-label="currentLabel" :next-label="nextLabel"
      :allowed-types="['incident', 'bug']"
      split-mode="child-story"
      @select="(id) => emit('select', id)"
    >
      <template #row-extra="{ ticket }">
        <button v-if="needsPoker(ticket)"
                class="poker-btn"
                :data-testid="`ref-start-poker-${ticket.id}`"
                @click.stop="emit('startPoker', ticket.id)">
          ポーカー開始
        </button>
      </template>
    </SprintSectionedList>
  </div>
</template>

<style scoped>
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
