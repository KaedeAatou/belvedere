<script setup lang="ts">
import type { Ticket } from '@belvedere/shared';

const props = defineProps<{ ticket: Ticket }>();
const emit = defineEmits<{ close: [] }>();

const { memberName } = useMembers();
const { findingsFor } = useFindings();
const findings = computed(() => findingsFor(props.ticket.id));
const ownerName = computed(() => memberName(props.ticket.assigneeId));
</script>

<template>
  <div class="sheet-mask" @click="emit('close')" />
  <div class="sheet" @click.stop>
    <div class="sheet-head">
      <TypeMark :type="ticket.type" />
      <span class="t-mono" style="font-size: 11px; color: var(--ink-2)">{{ ticket.id }}</span>
      <StatusDot :status="ticket.status" />
      <StoryPoints :value="ticket.estimatePt ?? null" :critical="ticket.estimatePt == null" />
      <span style="flex: 1" />
      <button class="ibtn"><Icon name="link" /></button>
      <button class="ibtn" @click="emit('close')"><Icon name="x" /></button>
    </div>

    <div class="sheet-body">
      <h2>{{ ticket.title }}</h2>
      <div style="display: flex; gap: 10px; align-items: center; margin: 12px 0 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
        <Avatar :user="ticket.assigneeId" />
        <span>{{ ownerName }}</span>
        <span style="color: var(--ink-4)">·</span>
        <span>Updated {{ ticket.updatedAt?.slice(0, 10) ?? '—' }}</span>
        <template v-if="ticket.sprintId">
          <span style="color: var(--ink-4)">·</span>
          <span>{{ ticket.sprintId }}</span>
        </template>
      </div>

      <!-- Description -->
      <div class="field">
        <div class="l">DESCRIPTION</div>
        <div v-if="ticket.description" style="font-size: 13.5px; line-height: 1.6; white-space: pre-wrap">{{ ticket.description }}</div>
        <div v-else
             style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
          <span style="color: var(--accent); font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em">説明なし　</span>
          詳細・ユーザーストーリーが記述されていません。
        </div>
      </div>

      <!-- Acceptance -->
      <div class="field">
        <div class="l">ACCEPTANCE CRITERIA</div>
        <div v-if="ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0" class="ac-list">
          <div v-for="(a, i) in ticket.acceptanceCriteria" :key="i" class="ac">
            <span class="check" />
            <span>{{ a }}</span>
          </div>
        </div>
        <div v-else
             style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
          受け入れ条件が未定義です。
        </div>
      </div>

      <!-- AI Integrity (ルールエンジン findings) -->
      <div v-if="findings.length > 0" class="field">
        <div class="l" style="color: var(--accent)">AI INTEGRITY · {{ findings.length }} ISSUE{{ findings.length > 1 ? 'S' : '' }}</div>
        <div class="flag-stack">
          <div v-for="f in findings" :key="f.ruleId" :class="['flag-card', f.severity === 'error' && 'err']">
            <span :style="{ color: f.severity === 'error' ? 'var(--accent)' : 'var(--ink-2)' }"><Icon name="warn" /></span>
            <div>
              <div class="lab">{{ findingLabel(f) }}</div>
              <div class="desc">{{ f.message }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="field">
        <div class="l" style="color: var(--ok)">AI INTEGRITY · CLEAN</div>
        <div style="font-size: 12px; color: var(--ink-2); border: 1px solid var(--line-2); padding: 8px 10px">
          <span style="color: var(--ok)"><Icon name="check" /></span>
          <span style="margin-left: 8px">形骸化リスクは検出されていません。</span>
        </div>
      </div>

      <!-- 見積もりポーカー (story のみ / T7) -->
      <EstimationPanel v-if="ticket.type === 'story'" :key="ticket.id" :ticket="ticket" />

      <div class="field">
        <div class="l">LABELS</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <span v-for="l in (ticket.labels ?? [])" :key="l" class="chip">{{ l }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
