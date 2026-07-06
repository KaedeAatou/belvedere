<script setup lang="ts">
const props = defineProps<{ value: number | null; critical?: boolean }>();
</script>

<template>
  <span v-if="value == null" class="chip amber" title="Story Point (相対見積もり) が未設定です">
    <span style="font-family: var(--mono)">—</span>
  </span>
  <span v-else :class="['chip', critical && 'amber solid']" title="Story Point (SP) = チケットの相対見積もり">
    <span class="t-num" style="font-weight: 500">{{ value }}</span>
    <span style="color: var(--ink-3)">SP</span>
  </span>
</template>
