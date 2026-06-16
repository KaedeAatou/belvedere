<script setup lang="ts">
import type { Ticket, TicketType, Status } from '@belvedere/shared';

const props = defineProps<{
  tickets: Ticket[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { activeSprint, nextPlanned, sprints } = useSprints();
const { findingsFor } = useFindings();
const { members } = useMembers();

// 作成ダイアログは SprintSectionedList が保持する。toolbar の New issue から ref で開く。
const sectionedList = ref<{ openCreate: () => void } | null>(null);

// ===== フィルタ状態 =====
const showFilterPopover = ref(false);
const filterStatuses = ref<Status[]>([]);
const filterAssignees = ref<string[]>([]);
const filterTypes = ref<TicketType[]>([]);
const showFlaggedOnly = ref(false);

const ALL_STATUSES: Status[] = ['backlog', 'todo', 'in-progress', 'review', 'done'];
const ALL_TYPES: TicketType[] = ['story', 'task', 'spike', 'bug', 'incident'];

const filterCount = computed(() =>
  filterStatuses.value.length + filterAssignees.value.length + filterTypes.value.length,
);

function toggleStatus(s: Status): void {
  const idx = filterStatuses.value.indexOf(s);
  if (idx === -1) filterStatuses.value = [...filterStatuses.value, s];
  else filterStatuses.value = filterStatuses.value.filter((x) => x !== s);
}
function toggleAssignee(id: string): void {
  const idx = filterAssignees.value.indexOf(id);
  if (idx === -1) filterAssignees.value = [...filterAssignees.value, id];
  else filterAssignees.value = filterAssignees.value.filter((x) => x !== id);
}
function toggleType(t: TicketType): void {
  const idx = filterTypes.value.indexOf(t);
  if (idx === -1) filterTypes.value = [...filterTypes.value, t];
  else filterTypes.value = filterTypes.value.filter((x) => x !== t);
}
function clearFilters(): void {
  filterStatuses.value = [];
  filterAssignees.value = [];
  filterTypes.value = [];
}

/** チケット 1 件がすべてのフィルタ条件を満たすか。 */
function matchesFilter(t: Ticket): boolean {
  if (filterStatuses.value.length > 0 && !filterStatuses.value.includes(t.status)) return false;
  if (filterAssignees.value.length > 0 && !filterAssignees.value.includes(t.assigneeId ?? '')) return false;
  if (filterTypes.value.length > 0 && (t.type === undefined || !filterTypes.value.includes(t.type))) return false;
  if (showFlaggedOnly.value && findingsFor(t.id).length === 0) return false;
  return true;
}

// フィルタ適用後のチケットを 3 区画 (CURRENT / NEXT / BACKLOG) に振り分ける。
const filteredTickets = computed(() => props.tickets.filter(matchesFilter));
const { current, next, backlog } = useSprintSections(filteredTickets);

// stat-row 用の集計 (フィルタ前の全体)。
const noSP = computed(() => props.tickets.filter((t) => findingsFor(t.id).some((f) => f.ruleId === 'STORY_SP_MISSING')).length);
const noAcc = computed(() => props.tickets.filter((t) => findingsFor(t.id).some((f) => f.ruleId === 'STORY_DOD_MISSING')).length);
const totalSP = computed(() => props.tickets.reduce((n, t) => n + (t.estimatePt ?? 0), 0));

const currentLabel = computed(() => (activeSprint.value ? `Sprint ${activeSprint.value.number}` : 'Current Sprint'));
const nextLabel = computed(() => (nextPlanned.value ? `Sprint ${nextPlanned.value.number} (planned)` : 'Next Sprint'));

// 区画跨ぎ d&d 移動 (sprintId 変更) は SprintSectionedList.onDragEnd → reorderTickets が直接担う
// (旧 @move-to-section emit 経路は撤去済)。本画面はフィルタ中だけ並び替えを止める責務を持つ。

// D-13 + U-2: kbd C で作成ダイアログを開く / ESC で閉じるは child 側に委譲しないが、
// 開く操作だけはここで担う (toolbar とショートカット)。
onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'c' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      sectionedList.value?.openCreate();
    }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});
</script>

<template>
  <div class="screen-head">
    <div class="stat-row">
      <div class="stat"><div class="label">Total</div><div class="v t-num">{{ tickets.length }}</div><div class="delta">issues</div></div>
      <div class="stat"><div class="label">No SP</div><div class="v t-num accent">{{ noSP }}</div><div class="delta">unestimated</div></div>
      <div class="stat"><div class="label">No AC</div><div class="v t-num accent">{{ noAcc }}</div><div class="delta">unverifiable</div></div>
      <div class="stat"><div class="label">Σ Points</div><div class="v t-num">{{ totalSP }}</div><div class="delta">SP</div></div>
    </div>
  </div>

  <div class="backlog-toolbar">
    <!-- Filter ポップオーバー -->
    <div class="filter-wrap">
      <button
        :class="['h-btn', filterCount > 0 && 'active']"
        data-testid="filter-btn"
        @click="showFilterPopover = !showFilterPopover"
      >
        <Icon name="filter" /> Filter
        <span v-if="filterCount > 0" class="filter-badge">{{ filterCount }}</span>
      </button>
      <div v-if="showFilterPopover" class="filter-popover" data-testid="filter-popover">
        <div class="fp-head">
          <span class="fp-title">フィルタ</span>
          <button v-if="filterCount > 0" class="fp-clear" @click="clearFilters">クリア</button>
        </div>
        <!-- ステータス -->
        <div class="fp-section">
          <div class="fp-label">ステータス</div>
          <label v-for="s in ALL_STATUSES" :key="s" class="fp-check">
            <input type="checkbox" :checked="filterStatuses.includes(s)" @change="toggleStatus(s)" />
            {{ s }}
          </label>
        </div>
        <!-- 担当者 -->
        <div class="fp-section">
          <div class="fp-label">担当者</div>
          <label v-for="m in members" :key="m.userId" class="fp-check">
            <input type="checkbox" :checked="filterAssignees.includes(m.userId)" @change="toggleAssignee(m.userId)" />
            {{ m.displayName }}
          </label>
          <p v-if="members.length === 0" class="fp-empty">メンバーなし</p>
        </div>
        <!-- 種別 -->
        <div class="fp-section">
          <div class="fp-label">種別</div>
          <label v-for="tp in ALL_TYPES" :key="tp" class="fp-check">
            <input type="checkbox" :checked="filterTypes.includes(tp)" @change="toggleType(tp)" />
            {{ tp }}
          </label>
        </div>
      </div>
    </div>
    <!-- AI: flagged only トグル -->
    <button
      :class="['h-btn', showFlaggedOnly && 'active accent']"
      data-testid="flagged-only-btn"
      @click="showFlaggedOnly = !showFlaggedOnly"
    >
      <Icon name="sparkle" /> AI: Show only flagged
    </button>
    <span class="spacer" />
    <button class="h-btn" data-testid="new-ticket-btn" @click="sectionedList?.openCreate()"><Icon name="plus" /> New issue <span class="kbd">C</span></button>
  </div>

  <!-- フィルタポップオーバーの外クリック閉じ -->
  <div v-if="showFilterPopover" class="filter-backdrop" @click="showFilterPopover = false" />

  <SprintSectionedList
    ref="sectionedList"
    :current="current" :next="next" :backlog="backlog"
    :selected-id="selectedId"
    :members="members" :sprints="sprints"
    :current-label="currentLabel" :next-label="nextLabel"
    :allowed-types="['story', 'incident', 'bug']"
    hide-section-create
    :reorder-disabled="filterCount > 0 || showFlaggedOnly"
    @select="(id) => emit('select', id)"
  />
</template>

<style scoped>
/* ===== フィルタポップオーバー ===== */
.filter-wrap {
  position: relative;
}
.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  color: #FFFBF6;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  margin-left: 2px;
  flex-shrink: 0;
}
.h-btn.active {
  background: var(--bg-2);
  color: var(--ink-0);
}
.h-btn.active.accent {
  color: var(--accent);
}
.filter-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
}
.filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(8, 8, 8, 0.12);
  min-width: 200px;
  max-width: 280px;
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.fp-title {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.fp-clear {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 0;
}
.fp-section {
  padding: 8px 12px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.fp-section:last-child {
  border-bottom: none;
}
.fp-label {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: 6px;
}
.fp-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-1);
  cursor: pointer;
}
.fp-check input[type='checkbox'] {
  accent-color: var(--accent);
  cursor: pointer;
}
.fp-empty {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-3);
  margin: 0;
  padding: 4px 0;
}
</style>
