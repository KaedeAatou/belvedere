<script setup lang="ts">
// WC-24: Backlog で Epic を d&d 並び替えして優先度を可視化する (順序=優先度、上ほど高)。
// 編集 (rationale/successMetric 等) は Home の Epics セクション本籍のまま。ここは並び替え + 一覧に徹する。
import { VueDraggable } from 'vue-draggable-plus';
import type { Epic } from '@belvedere/shared';

defineProps<{ canEdit: boolean }>();
const { epics, reorderEpics } = useEpics();

// VueDraggable は可変配列を要求するので orderIndex 昇順のローカルミラーを保つ。
// epics 変化 (fetch / reorder 後) で再同期する (SprintSectionedList と同じミラー方式)。
const orderedEpics = ref<Epic[]>([]);
watch(
  epics,
  (list) => {
    orderedEpics.value = [...list].sort(
      (a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER),
    );
  },
  { immediate: true },
);

async function onDragEnd(): Promise<void> {
  await reorderEpics(orderedEpics.value.map((e) => e.id));
}
</script>

<template>
  <section class="epic-reorder" data-testid="backlog-epics">
    <div class="epic-reorder-head">
      <h3 class="epic-reorder-title">Epic 優先順位</h3>
      <span class="epic-reorder-hint" title="ドラッグで並び替え。上にあるほど優先度が高い Epic です">
        {{ orderedEpics.length }} epics{{ canEdit ? ' · ドラッグで並び替え' : '' }}
      </span>
    </div>
    <p v-if="orderedEpics.length === 0" class="epic-reorder-empty" data-testid="backlog-epics-empty">
      Epic がまだありません。Story 作成時に親 Epic を追加できます。
    </p>
    <VueDraggable
      v-else
      v-model="orderedEpics"
      :disabled="!canEdit"
      handle=".epic-drag"
      :animation="150"
      :force-fallback="true"
      class="epic-reorder-list"
      @end="onDragEnd"
    >
      <div
        v-for="e in orderedEpics"
        :key="e.id"
        class="epic-reorder-row"
        :data-testid="`backlog-epic-${e.id}`"
      >
        <span v-if="canEdit" class="epic-drag" title="ドラッグして並び替え">⠿</span>
        <span class="epic-reorder-id">{{ e.id }}</span>
        <span class="epic-reorder-name">{{ e.name }}</span>
        <span v-if="e.valueImpact" class="epic-reorder-vi" :data-vi="e.valueImpact">{{ e.valueImpact }}</span>
      </div>
    </VueDraggable>
  </section>
</template>

<style scoped>
.epic-reorder { padding: 12px 16px; border-bottom: 1px solid var(--line, #eadfd5); }
.epic-reorder-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.epic-reorder-title { font-size: 13px; font-weight: 700; color: var(--ink-1); margin: 0; }
.epic-reorder-hint { font-size: 11px; color: var(--ink-3); }
.epic-reorder-empty { font-size: 12px; color: var(--ink-3); margin: 4px 0; }
.epic-reorder-list { display: flex; flex-direction: column; gap: 4px; }
.epic-reorder-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; background: var(--bg-1, #f7efe6); font-size: 13px;
}
.epic-drag { cursor: grab; color: var(--ink-3); user-select: none; }
.epic-reorder-id { font-family: var(--mono); font-size: 11px; color: var(--ink-2); flex-shrink: 0; min-width: 84px; }
.epic-reorder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-1); }
.epic-reorder-vi {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
}
.epic-reorder-vi[data-vi="high"] { background: #ffe0d0; color: var(--accent); }
.epic-reorder-vi[data-vi="medium"] { background: #fff0d8; color: #b8791f; }
.epic-reorder-vi[data-vi="low"] { background: var(--bg-2, #efe7dd); color: var(--ink-3); }
</style>
