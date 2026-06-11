<script setup lang="ts">
import type { ScreenId } from '~/composables/useUiMeta';
import { CEREMONIES } from '~/composables/useUiMeta';

const props = defineProps<{
  screen: ScreenId;
  railTab: 'backlog' | 'events';
}>();
const emit = defineEmits<{ 'update:screen': [s: ScreenId] }>();

const showEvents = computed(() => props.railTab === 'events');
</script>

<template>
  <aside class="shell-rail">
    <!-- Events tab → ceremonies -->
    <div v-if="showEvents" class="rail-cer">
      <div v-for="s in CEREMONIES" :key="s.id"
           :class="['rail-cer-item', screen === s.id && 'active']"
           :data-testid="`rail-${s.id}`"
           @click="emit('update:screen', s.id)">
        <span class="num">{{ s.floor }}</span>
        <span class="lbl">
          <span class="l1">{{ s.label }}</span>
          <span class="l2">{{ s.sub }}</span>
        </span>
      </div>
    </div>

    <!-- Backlog tab -->
    <div v-else class="rail-cer" style="padding-top: 8px">
      <div class="rail-cer-item active" style="cursor: default" data-testid="rail-backlog">
        <span class="num" style="font-size: 14px">BL</span>
        <span class="lbl">
          <span class="l1">Backlog</span>
          <span class="l2">Product backlog</span>
        </span>
      </div>
    </div>

    <div class="rail-artifacts">
      <div class="rail-art-h">Artifacts</div>
      <div class="rail-art-item"><Icon name="roadmap" /><span>Roadmap</span></div>
      <div class="rail-art-item"><Icon name="branch" /><span>Dependencies</span></div>
      <div class="rail-art-item"><Icon name="flag" /><span>Sprint Goal</span></div>
    </div>

    <div class="rail-foot">
      <button class="rail-fbtn"><Icon name="plus" /></button>
    </div>
  </aside>
</template>
