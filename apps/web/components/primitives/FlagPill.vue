<script setup lang="ts">
import { FLAG_DEFS } from '~/composables/useUiMeta';
const props = defineProps<{ flag: string; mini?: boolean }>();
const def = computed(() => FLAG_DEFS[props.flag]);
const cls = computed(() => (def.value?.sev === 'err' ? 'chip amber' : 'chip'));
</script>

<template>
  <span v-if="def" :class="cls" :title="def.desc">
    <Icon name="warn" />
    <span v-if="!mini">{{ def.label }}</span>
  </span>
</template>
