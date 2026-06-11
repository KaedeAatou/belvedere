<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{
  t: Ticket;
  selected?: boolean;
  dragHandle?: boolean;
}>();
defineEmits<{ click: [] }>();

// ルールエンジン findings (T5-3 / C 案)。severity 悪い順。行内は最大 2 個 + 超過は +n に丸める。
const { findingsFor } = useFindings();
const findings = computed(() => findingsFor(props.t.id));
const shown = computed(() => findings.value.slice(0, 2));
const overflow = computed(() => Math.max(0, findings.value.length - 2));
const overflowTitle = computed(() => findings.value.slice(2).map((f) => f.message).join('\n'));
</script>

<template>
  <div :class="['trow', selected && 'selected']" @click="$emit('click')">
    <span v-if="dragHandle" class="trow-drag"><Icon name="drag" /></span>
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
