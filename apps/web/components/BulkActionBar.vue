<script setup lang="ts">
// 複数チケット一括操作ツールバー (「3点リーダ」バー)。
// 各一覧画面の上部に count>0 のとき sticky で出す。kebab (縦3点) を押すと
// ステータス / 担当者 / 優先度 / valueImpact / スプリント変更 + 削除のメニューが開く。
//
// 親が選択ロジック (useTicketSelection) を保持し、本コンポーネントは表示と
// イベント発火に専念する (emit を applyToSelected / removeSelected に配線)。
import type { Member, Sprint, Status, Priority, ValueImpact } from '@belvedere/shared';

const props = defineProps<{
  count: number;
  members: Member[];
  sprints: Sprint[];
  busy: boolean;
}>();

const emit = defineEmits<{
  setStatus: [s: Status];
  setAssignee: [a: string];
  setPriority: [p: Priority];
  setValueImpact: [v: ValueImpact];
  setSprint: [sp: string | null];
  remove: [];
  clear: [];
  selectAll: [];
}>();

const STATUSES: Status[] = ['backlog', 'todo', 'in-progress', 'review', 'done'];
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
const VALUE_IMPACTS: ValueImpact[] = ['low', 'medium', 'high'];

// kebab メニューの開閉。サブメニュー (値リスト) は CSS :hover で右横にフライアウト
// 表示するため、どの属性を開いているかを保持する state は不要 (openSub/sub を廃止)。
const menuOpen = ref(false);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}
function closeMenu(): void {
  menuOpen.value = false;
}

// 各属性の確定 (選択 → 一括適用 → メニューを閉じる)。
function pickStatus(s: Status): void { emit('setStatus', s); closeMenu(); }
function pickAssignee(a: string): void { emit('setAssignee', a); closeMenu(); }
function pickPriority(p: Priority): void { emit('setPriority', p); closeMenu(); }
function pickValueImpact(v: ValueImpact): void { emit('setValueImpact', v); closeMenu(); }
function pickSprint(sp: string | null): void { emit('setSprint', sp); closeMenu(); }

function confirmRemove(): void {
  closeMenu();
  if (window.confirm(`${props.count} 件のチケットを削除します。よろしいですか?`)) {
    emit('remove');
  }
}
</script>

<template>
  <div class="bulk-bar" data-testid="bulk-bar">
    <span class="bulk-count" data-testid="bulk-count">{{ count }} 件選択</span>
    <button class="bulk-link" data-testid="bulk-select-all" @click="emit('selectAll')">全選択</button>
    <button class="bulk-link" data-testid="bulk-clear" @click="emit('clear')">選択解除</button>

    <span class="bulk-spacer" />

    <div class="bulk-kebab-wrap">
      <button
        class="bulk-kebab"
        data-testid="bulk-kebab"
        :disabled="busy"
        :aria-expanded="menuOpen"
        title="一括操作"
        @click.stop="toggleMenu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      <div v-if="menuOpen" class="bulk-menu" data-testid="bulk-menu" @click.stop>
        <!-- ステータス変更 (親項目を hover で値リストを左横にフライアウト) -->
        <div class="bulk-item-wrap">
          <button class="bulk-item" data-testid="bulk-set-status">
            <span>ステータス変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div class="bulk-flyout">
            <button v-for="s in STATUSES" :key="s" class="bulk-subitem"
                    :data-testid="`bulk-status-${s}`" @click="pickStatus(s)">{{ s }}</button>
          </div>
        </div>

        <!-- 担当者変更 -->
        <div class="bulk-item-wrap">
          <button class="bulk-item" data-testid="bulk-set-assignee">
            <span>担当者変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div class="bulk-flyout">
            <button v-for="m in members" :key="m.userId" class="bulk-subitem"
                    :data-testid="`bulk-assignee-${m.userId}`" @click="pickAssignee(m.userId)">
              {{ m.displayName }}
            </button>
            <p v-if="members.length === 0" class="bulk-empty">メンバーなし</p>
          </div>
        </div>

        <!-- 優先度変更 -->
        <div class="bulk-item-wrap">
          <button class="bulk-item" data-testid="bulk-set-priority">
            <span>優先度変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div class="bulk-flyout">
            <button v-for="p in PRIORITIES" :key="p" class="bulk-subitem"
                    :data-testid="`bulk-priority-${p}`" @click="pickPriority(p)">{{ p }}</button>
          </div>
        </div>

        <!-- valueImpact 変更 -->
        <div class="bulk-item-wrap">
          <button class="bulk-item" data-testid="bulk-set-value-impact">
            <span>valueImpact 変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div class="bulk-flyout">
            <button v-for="v in VALUE_IMPACTS" :key="v" class="bulk-subitem"
                    :data-testid="`bulk-value-impact-${v}`" @click="pickValueImpact(v)">{{ v }}</button>
          </div>
        </div>

        <!-- スプリント移動 (BACKLOG = sprintId 解除 / 既存スプリントへ set) -->
        <div class="bulk-item-wrap">
          <button class="bulk-item" data-testid="bulk-set-sprint">
            <span>スプリント移動</span><Icon name="caretRight" :size="12" />
          </button>
          <div class="bulk-flyout">
            <button class="bulk-subitem" data-testid="bulk-sprint-backlog" @click="pickSprint(null)">
              BACKLOG (未割当)
            </button>
            <button v-for="sp in sprints" :key="sp.id" class="bulk-subitem"
                    :data-testid="`bulk-sprint-${sp.id}`" @click="pickSprint(sp.id)">{{ sp.name?.trim() || `S${sp.number}` }}</button>
            <p v-if="sprints.length === 0" class="bulk-empty">スプリントなし</p>
          </div>
        </div>

        <div class="bulk-divider" />

        <!-- 削除 (確認ダイアログ経由 / サブメニュー無しの単独アクション) -->
        <button class="bulk-item bulk-item--danger" data-testid="bulk-delete" @click="confirmRemove">
          {{ count }} 件を削除
        </button>
      </div>
    </div>

    <!-- メニュー外クリックで閉じる -->
    <div v-if="menuOpen" class="bulk-backdrop" data-testid="bulk-backdrop" @click="closeMenu" />
  </div>
</template>

<style scoped>
.bulk-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  /* 高さを固定し、区画見出しの sticky top オフセット (screens.css の has-bulk-bar) と一致させる。
     両方 top:0 の sticky だと CURRENT SPRINT 見出しと重なって文字がかぶる (WC-21)。 */
  height: 45px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  /* 不透明背景 (WC-21): --accent-bg は rgba(...0.08) で半透明のため、sticky バーの下を
     スクロールするチケット行が透けて「文字がかぶる」。不透明な bg-0 の上に accent 8% を
     重ねて、色味を保ったまま完全不透明にする。 */
  background: linear-gradient(var(--accent-bg), var(--accent-bg)), var(--bg-0);
  border-bottom: var(--hairline) solid var(--accent-dim, var(--line-2));
  font-family: var(--sans);
}
.bulk-count {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.04em;
}
.bulk-link {
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
}
.bulk-link:hover { color: var(--ink-0); }
.bulk-spacer { flex: 1; }

.bulk-kebab-wrap { position: relative; }
.bulk-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-1);
  color: var(--ink-1);
  cursor: pointer;
}
.bulk-kebab:hover:not(:disabled) { background: var(--bg-2); color: var(--ink-0); }
.bulk-kebab:disabled { opacity: 0.5; cursor: not-allowed; }

.bulk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.bulk-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 200px;
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(8, 8, 8, 0.14);
  padding: 4px;
}
.bulk-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-0);
  cursor: pointer;
  text-align: left;
}
.bulk-item:hover { background: var(--bg-2); }
.bulk-item--danger { color: var(--err); }
.bulk-item--danger:hover { background: var(--accent-bg, #fff3ee); }
.bulk-divider {
  height: var(--hairline);
  background: var(--line-1);
  margin: 4px 6px;
}
/* 親項目 + フライアウトを 1 つの relative ラッパで囲む。ラッパ全体を hover
   判定領域にすることで、マウスが親→flyout へ移動する間に消えないようにする。 */
.bulk-item-wrap {
  position: relative;
}
/* 値リストは親メニュー (right:0 で右寄せ) からはみ出さないよう左横に出す。
   親と flyout の隙間 (4px) は透明な右パディングで橋渡しし、マウスが移動する
   間も hover ターゲットが途切れないようにする (連続領域を保つ)。 */
.bulk-flyout {
  position: absolute;
  top: 0;
  right: 100%;
  z-index: 60;
  display: none;
  flex-direction: column;
  min-width: 140px;
  padding: 4px;
  padding-right: 8px;
  background: var(--bg-1);
  background-clip: padding-box;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(8, 8, 8, 0.14);
}
.bulk-item-wrap:hover > .bulk-flyout,
.bulk-flyout:hover {
  display: flex;
}
/* hover 中の親項目を視覚的にハイライト (flyout 表示中の現在地を示す)。 */
.bulk-item-wrap:hover > .bulk-item {
  background: var(--bg-2);
}
.bulk-subitem {
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-1);
  cursor: pointer;
  text-align: left;
}
.bulk-subitem:hover { background: var(--bg-2); color: var(--ink-0); }
.bulk-empty {
  padding: 6px 10px;
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}
</style>
