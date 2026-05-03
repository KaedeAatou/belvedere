<script setup lang="ts">
import { TEAM } from '~/composables/useDemoData';
const props = defineProps<{ user?: string | null }>();
const initials = computed(() => {
  if (!props.user) return null;
  return TEAM.find((t) => t.id === props.user)?.initials ?? '?';
});
</script>

<template>
  <span v-if="!user" class="av ghost">·</span>
  <span v-else class="av">{{ initials }}</span>
</template>
