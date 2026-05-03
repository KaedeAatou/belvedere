<script setup lang="ts">
import type { Status } from '~/composables/useDemoData';

const props = defineProps<{ status: Status }>();

const STATUS_MAP: Record<Status, { color: string; label: string }> = {
  TODO:    { color: 'var(--ink-3)', label: 'TODO' },
  DOING:   { color: 'var(--accent)', label: 'DOING' },
  REVIEW:  { color: 'var(--info)', label: 'REVIEW' },
  DONE:    { color: 'var(--ok)', label: 'DONE' },
  BLOCKED: { color: 'var(--err)', label: 'BLOCKED' },
};
const m = computed(() => STATUS_MAP[props.status]);
</script>

<template>
  <span class="chip t-mono" style="color: var(--ink-1)">
    <span :style="{ width: '6px', height: '6px', background: m.color, display: 'inline-block' }" />
    {{ m.label }}
  </span>
</template>
