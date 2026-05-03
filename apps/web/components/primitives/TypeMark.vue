<script setup lang="ts">
import type { TicketType } from '~/composables/useDemoData';
const props = defineProps<{ type: TicketType }>();
const ch = computed(() => ({ story: 'S', bug: 'B', task: 'T', spike: '?' }[props.type] ?? '·'));
</script>

<template>
  <span :class="['ttype', type]">{{ ch }}</span>
</template>
