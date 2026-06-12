<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  t: Ticket;
  selected?: boolean;
  dragHandle?: boolean;
  /**
   * 手動並び替えを有効化する。デフォルト false。
   * BacklogScreen / PlanningScreen / RefinementScreen で true を渡し、drag* イベントを購読する。
   * true にすると draggable=true が DOM に付き、handle (dragHandle prop) 以外の
   * dragstart は onDragStart 内でキャンセルされる。
   */
  reorderable?: boolean;
  /** ドロップ位置インジケータ: 'before' = 行上端ライン / 'after' = 行下端ライン / null = 非表示。 */
  dropEdge?: 'before' | 'after' | null;
  /**
   * 複数選択 (一括変更/削除) を有効化する。デフォルト false。
   * true のとき一番左にチェックボックス列を追加し、bulkSelected で選択状態を反映する。
   * 行クリック (詳細を開く) とは独立 — チェックボックスは @click.stop で競合させない。
   */
  selectable?: boolean;
  /** 一括選択チェックボックスの ON/OFF (selectable 時のみ意味を持つ)。 */
  bulkSelected?: boolean;
}>();
const emit = defineEmits<{
  click: [];
  reorderStart: [];
  reorderOver: [evt: DragEvent];
  reorderDrop: [evt: DragEvent];
  reorderEnd: [];
  toggleSelect: [];
}>();

// ルールエンジン findings (T5-3 / C 案)。severity 悪い順。行内は最大 2 個 + 超過は +n に丸める。
const { findingsFor } = useFindings();
const findings = computed(() => findingsFor(props.t.id));
const shown = computed(() => findings.value.slice(0, 2));
const overflow = computed(() => Math.max(0, findings.value.length - 2));
const overflowTitle = computed(() => findings.value.slice(2).map((f) => f.message).join('\n'));

// handle 限定ドラッグ (定番パターン: 行は常に draggable=true、handle 以外での
// dragstart をキャンセルする)。
// ref ではなくプレーンな変数にする — 描画に使わないため reactive にする必要がない。
// dragArmed を ref にすると「mousedown → Vue 次 tick で draggable 反映 → ブラウザ判定」の
// タイミングズレが発生し、ハンドルを掴んでも drag が始まらないバグが再現する。
let fromHandle = false;
function armDrag(): void {
  if (props.reorderable) fromHandle = true;
}
function disarmDrag(): void {
  fromHandle = false;
}
function onDragStart(e: DragEvent): void {
  if (!props.reorderable) return;
  if (!fromHandle) {
    // handle 以外 (行本体・テキスト等) を掴んだときはドラッグをキャンセル。
    // クリック選択は dragstart ではなく click で処理されるため影響しない。
    e.preventDefault();
    return;
  }
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
  fromHandle = false;
  if (props.reorderable) emit('reorderEnd');
}
</script>

<template>
  <div
    :class="['trow', selectable && 'selectable', selected && 'selected', dropEdge === 'before' && 'drop-before', dropEdge === 'after' && 'drop-after']"
    :draggable="reorderable || undefined"
    @click="$emit('click')"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <span v-if="selectable" class="trow-check">
      <input
        type="checkbox"
        :checked="bulkSelected"
        data-testid="trow-check"
        @click.stop="$emit('toggleSelect')"
        @change.stop
      />
    </span>
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
