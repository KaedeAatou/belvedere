<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  t: Ticket;
  selected?: boolean;
  dragHandle?: boolean;
  /**
   * 手動並び替えを有効化する (ハンドル .trow-drag-grab を表示)。デフォルト false。
   * BacklogScreen / PlanningScreen / RefinementScreen / ReviewScreen で true を渡す。
   * 実際のドラッグは親の SortableJS (vue-draggable-plus) が handle=".trow-drag-grab" で掴む。
   */
  reorderable?: boolean;
  /** ドロップ位置インジケータ: 'before' = 行上端ライン / 'after' = 行下端ライン / null = 非表示。 */
  dropEdge?: 'before' | 'after' | null;
  /** ドラッグ中の行 (薄く表示)。 */
  dragging?: boolean;
  /**
   * 複数選択 (一括変更/削除) を有効化する。デフォルト false。
   * true のとき一番左にチェックボックス列を追加し、bulkSelected で選択状態を反映する。
   * 行クリック (詳細を開く) とは独立 — チェックボックスは @click.stop で競合させない。
   */
  selectable?: boolean;
  /** 一括選択チェックボックスの ON/OFF (selectable 時のみ意味を持つ)。 */
  bulkSelected?: boolean;
}>();
defineEmits<{
  click: [];
  toggleSelect: [];
}>();

// ルールエンジン findings (T5-3 / C 案)。severity 悪い順。行内は最大 2 個 + 超過は +n に丸める。
const { findingsFor } = useFindings();
const findings = computed(() => findingsFor(props.t.id));
const shown = computed(() => findings.value.slice(0, 2));
const overflow = computed(() => Math.max(0, findings.value.length - 2));
const overflowTitle = computed(() => findings.value.slice(2).map((f) => f.message).join('\n'));

// 並び替え/区画移動は親 (SprintSectionedList / ReviewScreen) の SortableJS が
// handle=".trow-drag-grab" を掴んで行う。TicketRow はハンドルの見た目と data-ticket-id を提供するだけ。
</script>

<template>
  <div
    :class="['trow', selectable && 'selectable', selected && 'selected', dragging && 'dragging', dropEdge === 'before' && 'drop-before', dropEdge === 'after' && 'drop-after']"
    :data-ticket-id="t.id"
    @click="$emit('click')"
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
      style="touch-action: none; user-select: none"
      draggable="false"
      @click.stop
    ><Icon name="drag" /></span>
    <span v-else />
    <TypeMark :type="t.type" />
    <span class="trow-id t-mono">{{ t.id }}</span>
    <span class="trow-title">
      <!-- タイトルは専用 span で省略 (…)。長いタイトルでも下の .trow-flags を押し出さない
           (WC-d019fd94: 長いタイトルで警告ピルが見切れる不具合の修正)。 -->
      <span class="trow-title-text">{{ t.title }}</span>
      <span v-if="findings.length > 0" class="trow-flags">
        <FindingPill v-for="f in shown" :key="f.ruleId" :finding="f" />
        <span v-if="overflow > 0" class="finding-badge sev-more" :title="overflowTitle">+{{ overflow }}</span>
      </span>
    </span>
    <!-- #extra は要素数が画面ごとに変わる (分割/ポーカー/StatusDot 等) ため、
         単一の grid アイテムに包む。裸で置くと .trow の 9 列 grid を溢れて
         Avatar が 2 行目に折り返し、行の下に円がはみ出す (2026-06-13 修正)。 -->
    <span class="trow-extra"><slot name="extra" /></span>
    <span class="trow-labels">
      <span v-for="l in (t.labels ?? []).slice(0, 2)" :key="l" class="t-cap-tight" style="margin-right: 8px">
        {{ l }}
      </span>
    </span>
    <StoryPoints :value="t.estimatePt ?? null" :critical="t.estimatePt == null" />
    <Avatar :user="t.assigneeId" />
  </div>
</template>
