<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';

const props = defineProps<{
  t: DemoTicket;
  selected?: boolean;
  dragHandle?: boolean;
}>();
defineEmits<{ click: [] }>();
const flags = computed(() => props.t.flags ?? []);
</script>

<template>
  <div :class="['trow', selected && 'selected']" @click="$emit('click')">
    <span v-if="dragHandle" class="trow-drag"><Icon name="drag" /></span>
    <span v-else />
    <TypeMark :type="t.type" />
    <span class="trow-id t-mono">{{ t.id }}</span>
    <span class="trow-title">
      {{ t.title }}
      <span v-if="flags.length > 0" class="trow-flags">
        <FlagPill v-for="f in flags.slice(0, 3)" :key="f" :flag="f" mini />
        <span v-if="flags.length > 3" class="t-cap-tight">+{{ flags.length - 3 }}</span>
      </span>
    </span>
    <slot name="extra" />
    <span class="trow-labels">
      <span v-for="l in (t.labels ?? []).slice(0, 2)" :key="l" class="t-cap-tight" style="margin-right: 8px">
        {{ l }}
      </span>
    </span>
    <StoryPoints :value="t.sp" :critical="t.sp == null" />
    <Avatar :user="t.assignee" />
  </div>
</template>
