<script setup lang="ts">
import type { Sprint, Ticket } from '@belvedere/shared';

// スプリント履歴ビュー。完了済スプリント (status==='completed') を新しい順に一覧し、
// 各スプリントの実績 (velocity / 完了チケット数 / 期間 / Sprint Goal) を振り返る。
// backlog から完了済スプリントのチケットを除外した (Commit 2) 受け皿として、当時のチケットも辿れる。
const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { completedSprints, sprintLabel } = useSprints();

// 選択スプリント (一時 UI 状態なので Screen ローカル ref で十分)。
const openSprintId = ref<string | null>(null);
function toggleSprint(id: string): void {
  openSprintId.value = openSprintId.value === id ? null : id;
}

// 選択スプリントの配下チケット (read-only 表示)。
const openTickets = computed<Ticket[]>(() =>
  openSprintId.value ? props.tickets.filter((t) => t.sprintId === openSprintId.value) : [],
);

/** 当該スプリントで done になったチケット数。 */
function doneCount(sprintId: string): number {
  return props.tickets.filter((t) => t.sprintId === sprintId && t.status === 'done').length;
}

/** 期間表示 (ISO の日付部分のみ)。未設定は em dash。 */
function period(s: Sprint): string {
  const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—');
  return `${day(s.startsAt)} 〜 ${day(s.endsAt)}`;
}
</script>

<template>
  <div class="sprint-history">
    <div class="t-cap" style="margin-bottom: 4px">SPRINT HISTORY</div>
    <p style="font-family: var(--sans); font-size: 12px; color: var(--ink-3); margin: 0 0 16px">
      完了したスプリントの実績を振り返れます。スプリントを選ぶと当時のチケットを確認できます。
    </p>

    <p v-if="completedSprints.length === 0" data-testid="sh-empty"
       style="font-family: var(--sans); font-size: 13px; color: var(--ink-2); padding: 12px 0">
      完了したスプリントはまだありません。
    </p>

    <div v-else class="sh-list">
      <div v-for="s in completedSprints" :key="s.id"
           :class="['sh-card', openSprintId === s.id && 'open']"
           :data-testid="`sh-sprint-${s.id}`"
           role="button" tabindex="0"
           @click="toggleSprint(s.id)"
           @keydown.enter.space.prevent="toggleSprint(s.id)">
        <div class="sh-head">
          <span class="sh-name">{{ sprintLabel(s, '', `Sprint ${s.number}`) }}</span>
          <span class="sh-num">#{{ s.number }}</span>
          <span class="sh-period">{{ period(s) }}</span>
        </div>
        <div class="sh-goal">{{ s.goal }}</div>
        <div class="sh-meta">
          <span class="sh-stat"><b>{{ s.velocity ?? '—' }}</b> velocity</span>
          <span class="sh-stat"><b>{{ doneCount(s.id) }}</b> 完了</span>
        </div>

        <!-- 選択時: 当時のチケット (read-only 列挙)。行クリックで DetailSheet を開く。 -->
        <div v-if="openSprintId === s.id" class="sh-tickets" @click.stop>
          <TicketRow v-for="t in openTickets" :key="t.id" :t="t"
                     :selected="selectedId === t.id"
                     @click="emit('select', t.id)">
            <template #extra>
              <StatusDot :status="t.status" />
            </template>
          </TicketRow>
          <p v-if="openTickets.length === 0" class="sh-tickets-empty">
            このスプリントに紐づくチケットがありません。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sprint-history {
  padding: 20px 24px;
  overflow-y: auto;
}
.sh-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 780px;
}
.sh-card {
  border: 1px solid var(--line-1);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.sh-card:hover { background: var(--bg-2); }
.sh-card.open { border-color: var(--accent); }
.sh-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.sh-name {
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--ink-0);
}
.sh-num {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}
.sh-period {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
}
.sh-goal {
  font-family: var(--sans);
  font-size: 12.5px;
  color: var(--ink-1);
  margin-top: 6px;
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}
.sh-meta {
  display: flex;
  gap: 18px;
  margin-top: 10px;
  font-family: var(--sans);
  font-size: 11.5px;
  color: var(--ink-2);
}
.sh-stat b {
  color: var(--ink-0);
  font-weight: 600;
}
.sh-tickets {
  margin-top: 12px;
  border-top: var(--hairline) solid var(--line-1);
  padding-top: 8px;
  cursor: default;
}
.sh-tickets-empty {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-3);
  padding: 8px 0;
}
</style>
