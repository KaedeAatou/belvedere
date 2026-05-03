<script setup lang="ts">
import type { DemoTicket } from '~/composables/useDemoData';
import { TEAM, FLAG_DEFS } from '~/composables/useDemoData';

const props = defineProps<{ ticket: DemoTicket }>();
const emit = defineEmits<{ close: [] }>();

const flags = computed(() => props.ticket.flags ?? []);
const ownerName = computed(() => TEAM.find((t) => t.id === props.ticket.assignee)?.name ?? 'Unassigned');
</script>

<template>
  <div class="sheet-mask" @click="emit('close')" />
  <div class="sheet" @click.stop>
    <div class="sheet-head">
      <TypeMark :type="ticket.type" />
      <span class="t-mono" style="font-size: 11px; color: var(--ink-2)">{{ ticket.id }}</span>
      <StatusDot :status="ticket.status" />
      <StoryPoints :value="ticket.sp" :critical="ticket.sp == null" />
      <span style="flex: 1" />
      <button class="ibtn"><Icon name="link" /></button>
      <button class="ibtn" @click="emit('close')"><Icon name="x" /></button>
    </div>

    <div class="sheet-body">
      <h2>{{ ticket.title }}</h2>
      <div style="display: flex; gap: 10px; align-items: center; margin: 12px 0 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
        <Avatar :user="ticket.assignee" />
        <span>{{ ownerName }}</span>
        <span style="color: var(--ink-4)">·</span>
        <span>Updated {{ ticket.lastUpdate ?? '—' }}</span>
        <template v-if="ticket.sprint">
          <span style="color: var(--ink-4)">·</span>
          <span>{{ ticket.sprint }}</span>
        </template>
      </div>

      <!-- User story -->
      <div class="field">
        <div class="l">USER STORY</div>
        <div v-if="ticket.actor" style="font-size: 13.5px; line-height: 1.6">
          <span style="color: var(--ink-2)">〜として　</span>
          <span style="color: var(--ink-0)">{{ ticket.actor }}</span><br />
          <span style="color: var(--ink-2)">〜したい　</span>
          <span style="color: var(--ink-0)">{{ ticket.title }}</span><br />
          <span style="color: var(--ink-2)">〜のために　</span>
          <span style="color: var(--ink-0)">{{ ticket.goal ?? '—' }}</span>
        </div>
        <div v-else
             style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
          <span style="color: var(--accent); font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em">主語なし　</span>
          ユーザーストーリーが定義されていません。AIが下書きを提案できます。
        </div>
      </div>

      <!-- Acceptance -->
      <div class="field">
        <div class="l">ACCEPTANCE CRITERIA</div>
        <div v-if="ticket.acceptance && ticket.acceptance.length > 0" class="ac-list">
          <div v-for="(a, i) in ticket.acceptance" :key="i" class="ac">
            <span class="check" />
            <span>{{ a }}</span>
          </div>
        </div>
        <div v-else
             style="font-size: 12.5px; color: var(--ink-2); font-style: italic; border: 1px dashed var(--accent-dim); padding: 10px 12px; background: var(--accent-bg)">
          受け入れ条件が未定義です。
        </div>
      </div>

      <!-- AI Integrity -->
      <div v-if="flags.length > 0" class="field">
        <div class="l" style="color: var(--accent)">AI INTEGRITY · {{ flags.length }} ISSUE{{ flags.length > 1 ? 'S' : '' }}</div>
        <div class="flag-stack">
          <template v-for="f in flags" :key="f">
            <div v-if="FLAG_DEFS[f]" :class="['flag-card', FLAG_DEFS[f]?.sev === 'err' && 'err']">
              <span :style="{ color: FLAG_DEFS[f]?.sev === 'err' ? 'var(--accent)' : 'var(--ink-2)' }"><Icon name="warn" /></span>
              <div>
                <div class="lab">{{ FLAG_DEFS[f]?.label }}</div>
                <div class="desc">{{ FLAG_DEFS[f]?.desc }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div v-else class="field">
        <div class="l" style="color: var(--ok)">AI INTEGRITY · CLEAN</div>
        <div style="font-size: 12px; color: var(--ink-2); border: 1px solid var(--line-2); padding: 8px 10px">
          <span style="color: var(--ok)"><Icon name="check" /></span>
          <span style="margin-left: 8px">形骸化リスクは検出されていません。</span>
        </div>
      </div>

      <div class="field">
        <div class="l">LABELS</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <span v-for="l in (ticket.labels ?? [])" :key="l" class="chip">{{ l }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
