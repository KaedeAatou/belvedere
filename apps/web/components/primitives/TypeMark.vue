<script setup lang="ts">
import type { TicketType } from '@belvedere/shared';

const props = defineProps<{ type?: TicketType }>();

// type 未設定 (TYPE_MISSING) は破線グレーの「?」(.ttype.none)。spike の「?」は accent 色で区別。
// incident は塗りつぶし赤 (枠線だけの bug と区別)。
const ch = computed(() =>
  props.type ? ({ story: 'S', task: 'T', spike: '?', bug: 'B', incident: '!' }[props.type] ?? '?') : '?',
);
</script>

<template>
  <span :class="['ttype', type ?? 'none']" :title="type ?? '種別なし'">{{ ch }}</span>
</template>
