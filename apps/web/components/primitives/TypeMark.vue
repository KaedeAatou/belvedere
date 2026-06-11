<script setup lang="ts">
import type { TicketType } from '@belvedere/shared';

const props = defineProps<{ type?: TicketType }>();

// type 未設定 (種別なし) は '·' のグレー表示。T5-1 で incident 色 + 視覚強化予定。
const ch = computed(() =>
  props.type ? ({ story: 'S', task: 'T', spike: '?', bug: 'B', incident: '!' }[props.type] ?? '·') : '·',
);
</script>

<template>
  <span :class="['ttype', type ?? 'none']">{{ ch }}</span>
</template>
