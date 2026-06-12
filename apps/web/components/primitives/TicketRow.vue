<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  t: Ticket;
  selected?: boolean;
  dragHandle?: boolean;
  /**
   * 手動並び替え (バックログ d&d) を有効化する。デフォルト false。
   * 既存呼び出し (Planning / Review / Refinement) は未指定 = 無効のままで挙動不変。
   * BacklogScreen のみ true を渡し、drag* イベントを購読する。
   */
  reorderable?: boolean;
  /** ドロップ位置インジケータ: 'before' = 行上端ライン / 'after' = 行下端ライン / null = 非表示。 */
  dropEdge?: 'before' | 'after' | null;
}>();
const emit = defineEmits<{
  click: [];
  reorderStart: [];
  reorderOver: [evt: DragEvent];
  reorderDrop: [evt: DragEvent];
  reorderEnd: [];
}>();

// ルールエンジン findings (T5-3 / C 案)。severity 悪い順。行内は最大 2 個 + 超過は +n に丸める。
const { findingsFor } = useFindings();
const findings = computed(() => findingsFor(props.t.id));
const shown = computed(() => findings.value.slice(0, 2));
const overflow = computed(() => Math.max(0, findings.value.length - 2));
const overflowTitle = computed(() => findings.value.slice(2).map((f) => f.message).join('\n'));

// handle 限定ドラッグ: handle の mousedown でのみ行の draggable を有効化し、
// dragend / mouseup で解除する。これにより行本体のクリック (= 選択) は draggable に奪われない。
const dragArmed = ref(false);
function armDrag(): void {
  if (props.reorderable) dragArmed.value = true;
}
function disarmDrag(): void {
  dragArmed.value = false;
}
function onDragStart(): void {
  if (!props.reorderable) return;
  emit('reorderStart');
}
function onDragOver(e: DragEvent): void {
  if (!props.reorderable) return;
  e.preventDefault(); // drop を許可
  emit('reorderOver', e);
}
function onDrop(e: DragEvent): void {
  if (!props.reorderable) return;
  e.preventDefault();
  emit('reorderDrop', e);
}
function onDragEnd(): void {
  dragArmed.value = false;
  if (props.reorderable) emit('reorderEnd');
}
</script>

<template>
  <div
    :class="['trow', selected && 'selected', dropEdge === 'before' && 'drop-before', dropEdge === 'after' && 'drop-after']"
    :draggable="reorderable && dragArmed ? true : undefined"
    @click="$emit('click')"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <span
      v-if="dragHandle"
      class="trow-drag"
      :class="{ 'trow-drag-grab': reorderable }"
      @mousedown="armDrag"
      @mouseup="disarmDrag"
    ><Icon name="drag" /></span>
    <span v-else />
    <TypeMark :type="t.type" />
    <span class="trow-id t-mono">{{ t.id }}</span>
    <span class="trow-title">
      {{ t.title }}
      <span v-if="findings.length > 0" class="trow-flags">
        <FindingPill v-for="f in shown" :key="f.ruleId" :finding="f" />
        <span v-if="overflow > 0" class="finding-badge sev-more" :title="overflowTitle">+{{ overflow }}</span>
      </span>
    </span>
    <slot name="extra" />
    <span class="trow-labels">
      <span v-for="l in (t.labels ?? []).slice(0, 2)" :key="l" class="t-cap-tight" style="margin-right: 8px">
        {{ l }}
      </span>
    </span>
    <StoryPoints :value="t.estimatePt ?? null" :critical="t.estimatePt == null" />
    <Avatar :user="t.assigneeId" />
  </div>
</template>
