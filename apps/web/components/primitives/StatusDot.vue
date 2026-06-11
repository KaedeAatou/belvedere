<script setup lang="ts">
import type { Status } from '@belvedere/shared';

const props = defineProps<{ status: Status }>();

const STATUS_MAP: Record<Status, { color: string; label: string }> = {
  backlog:       { color: 'var(--ink-4)', label: 'BACKLOG' },
  todo:          { color: 'var(--ink-3)', label: 'TODO' },
  'in-progress': { color: 'var(--accent)', label: 'DOING' },
  review:        { color: 'var(--info)', label: 'REVIEW' },
  done:          { color: 'var(--ok)', label: 'DONE' },
};
const m = computed(() => STATUS_MAP[props.status]);
</script>

<template>
  <span class="chip t-mono" style="color: var(--ink-1)">
    <span :style="{ width: '6px', height: '6px', background: m.color, display: 'inline-block' }" />
    {{ m.label }}
  </span>
</template>
