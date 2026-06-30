<script setup lang="ts">
// 認証付き画像表示 (WC-a8f0be16)。<img src> は Bearer を送れないので、id から blob を fetch して
// object URL で表示する。useImages がキャッシュするので同一画像の再 fetch は起きない。
const props = defineProps<{ id: string }>();
const { objectUrl } = useImages();
const src = ref<string | null>(null);
const failed = ref(false);

async function load(id: string): Promise<void> {
  failed.value = false;
  src.value = await objectUrl(id);
  if (!src.value) failed.value = true;
}
onMounted(() => load(props.id));
watch(() => props.id, (id) => load(id));
</script>

<template>
  <img v-if="src" :src="src" class="api-image" data-testid="api-image" alt="添付画像" />
  <span v-else-if="failed" class="api-image-msg">[画像を表示できません]</span>
  <span v-else class="api-image-msg">[画像読み込み中…]</span>
</template>

<style scoped>
.api-image { max-width: 100%; border-radius: var(--radius); border: var(--hairline) solid var(--line-2); margin: 6px 0; display: block; }
.api-image-msg { font-size: 12px; color: var(--ink-3); font-family: var(--mono); }
</style>
