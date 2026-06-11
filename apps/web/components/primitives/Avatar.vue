<script setup lang="ts">
const props = defineProps<{ user?: string | null }>();
const { memberInitial } = useMembers();
const initials = computed(() => (props.user ? memberInitial(props.user) : null));
</script>

<template>
  <span v-if="!user" class="av ghost">·</span>
  <span v-else class="av">{{ initials }}</span>
</template>
