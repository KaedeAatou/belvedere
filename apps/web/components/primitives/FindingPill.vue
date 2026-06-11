<script setup lang="ts">
// finding ピル (T5-3 / C 案)。ルールエンジンの指摘を severity 色のラベル付きピルで表示。
// ホバー不要で読めるよう短ラベル (RULE_LABELS) を出し、全文は title 属性に入れる。
import type { TicketFinding } from '~/composables/useFindings';

const props = defineProps<{ finding: TicketFinding }>();

const sevClass = computed(
  () => ({ error: 'sev-err', warn: 'sev-warn', info: 'sev-info' })[props.finding.severity],
);
</script>

<template>
  <span class="finding-badge" :class="sevClass" :title="finding.message" data-testid="finding-badge">
    {{ findingLabel(finding) }}
  </span>
</template>
