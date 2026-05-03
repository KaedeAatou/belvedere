<script setup lang="ts">
const props = defineProps<{ value: number | null; critical?: boolean }>();
</script>

<template>
  <span v-if="value == null" class="chip amber" title="SP未設定">
    <span style="font-family: var(--mono)">—</span>
  </span>
  <span v-else :class="['chip', critical && 'amber solid']">
    <span class="t-num" style="font-weight: 500">{{ value }}</span>
    <span style="color: var(--ink-3)">SP</span>
  </span>
</template>
