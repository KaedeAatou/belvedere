<script lang="ts">
// ===== F-29: メニュー / フライアウトの fixed 座標計算 (純粋関数) =====
//
// メニュー系は祖先 .screen-body { overflow: hidden } にクリップされるため、
// <Teleport to="body"> + position:fixed で描画する。座標はトリガー矩形から計算し、
// ビューポート下端では上方向へフリップ / 右端では左横へフリップする。
// ここは退化入力込みで直接 unit テストを持つ (test/BulkActionBar.test.ts)。

/** getBoundingClientRect 互換の最小矩形 (DOMRect をそのまま渡せる)。 */
export interface AnchorRect { top: number; left: number; right: number; bottom: number }
export interface BoxSize { width: number; height: number }

/**
 * kebab トリガー矩形からメニューの fixed 座標を計算する。
 * 右揃え (トリガー右端 = メニュー右端) を基本に、左右は viewport 内へクランプ。
 * 縦は「下に gap 空けて出す」を基本に、下端で収まらなければ上へフリップする。
 */
export function computeMenuPosition(
  trigger: AnchorRect,
  menu: BoxSize,
  viewport: BoxSize,
  gap = 6,
  margin = 8,
): { top: number; left: number } {
  let left = trigger.right - menu.width;
  left = Math.min(left, viewport.width - menu.width - margin);
  left = Math.max(left, margin);

  let top = trigger.bottom + gap;
  if (top + menu.height > viewport.height - margin) {
    const above = trigger.top - gap - menu.height;
    // 上にも収まらない退化 (極小ビューポート) では margin に張り付ける (負にしない)。
    top = above >= margin ? above : Math.max(margin, viewport.height - margin - menu.height);
  }
  return { top, left };
}

/**
 * 親項目 (bulk-item-wrap) の矩形からフライアウトの fixed 座標を計算する。
 * 右横 (left = item.right) を基本に、右端で収まらなければ左横へフリップ。
 * 縦は親項目と同じ top を基本に、下端で収まらなければ viewport 内へ上方向シフト
 * (シフト後もフライアウトは親項目の y 域を覆うため hover 連続性は保たれる)。
 */
export function computeFlyoutPosition(
  item: AnchorRect,
  flyout: BoxSize,
  viewport: BoxSize,
  margin = 8,
): { top: number; left: number } {
  let left = item.right;
  if (left + flyout.width > viewport.width - margin) {
    left = Math.max(margin, item.left - flyout.width);
  }
  let top = item.top;
  if (top + flyout.height > viewport.height - margin) {
    top = Math.max(margin, viewport.height - margin - flyout.height);
  }
  return { top, left };
}

/** 計算済み座標を inline style へ。計測前 (null) は visibility:hidden でチラつきを防ぐ。 */
export function toFixedStyle(pos: { top: number; left: number } | null): Record<string, string> {
  const style: Record<string, string> = { position: 'fixed' };
  if (pos) {
    style.top = `${pos.top}px`;
    style.left = `${pos.left}px`;
  } else {
    style.visibility = 'hidden';
  }
  return style;
}
</script>

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

// ===== kebab メニューの開閉 (F-29: Teleport + fixed) =====
// 祖先 .screen-body { overflow: hidden } がメニューをクリップし、ビューポート下端で
// サブメニューが見切れてクリック不能になるため、メニューは <Teleport to="body"> +
// position:fixed で描画し、座標は kebab 矩形から computeMenuPosition で計算する。
const menuOpen = ref(false);
const kebabEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
// 計測 (nextTick 後) まで null = visibility:hidden で初期フレームのチラつきを防ぐ。
const menuPos = ref<{ top: number; left: number } | null>(null);

const menuStyle = computed(() => toFixedStyle(menuPos.value));

function toggleMenu(): void {
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  menuOpen.value = true;
  menuPos.value = null;
  void nextTick().then(() => {
    if (!menuOpen.value) return;
    const trigger = kebabEl.value?.getBoundingClientRect();
    const menu = menuEl.value?.getBoundingClientRect();
    menuPos.value = computeMenuPosition(
      trigger ?? { top: 0, left: 0, right: 0, bottom: 0 },
      { width: menu?.width ?? 0, height: menu?.height ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  });
}

function closeMenu(): void {
  menuOpen.value = false;
  menuPos.value = null;
  openFlyout.value = null;
  flyoutPos.value = null;
  disarmRemove(); // メニューを閉じたら armed 削除も解除 (再オープン時は 1 回目から)
}

// ===== サブメニュー (フライアウト) の開閉 (F-29) =====
// 旧実装は CSS :hover + position:absolute で、fixed 化に伴い開閉と座標を JS で持つ。
// hover (mouseenter) で開き mouseleave で閉じる。クリックでも開く (自動化 / タッチ対応)。
// フライアウトは wrap の DOM 子のままなので、fixed で箱の外に出ても
// ポインタがフライアウト上にある間は wrap の mouseleave は発火しない (DOM 木基準)。
type FlyoutKey = 'status' | 'assignee' | 'priority' | 'valueImpact' | 'sprint';
const openFlyout = ref<FlyoutKey | null>(null);
const flyoutEl = ref<HTMLElement | null>(null);
const flyoutPos = ref<{ top: number; left: number } | null>(null);

const flyoutStyle = computed(() => toFixedStyle(flyoutPos.value));

function showFlyout(key: FlyoutKey, e: Event): void {
  // currentTarget は await 後に null になるため、矩形は同期で先に取る。
  // mouseenter は .bulk-item-wrap、click は .bulk-item だが両者の箱は一致する
  // (フライアウトは fixed = out of flow で wrap の箱に影響しない)。
  const anchor = e.currentTarget as HTMLElement | null;
  if (!anchor) return;
  const item = anchor.getBoundingClientRect();
  openFlyout.value = key;
  flyoutPos.value = null;
  void nextTick().then(() => {
    if (openFlyout.value !== key) return;
    const fly = flyoutEl.value?.getBoundingClientRect();
    flyoutPos.value = computeFlyoutPosition(
      item,
      { width: fly?.width ?? 0, height: fly?.height ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  });
}

function hideFlyout(key: FlyoutKey): void {
  if (openFlyout.value === key) {
    openFlyout.value = null;
    flyoutPos.value = null;
  }
}

// 各属性の確定 (選択 → 一括適用 → メニューを閉じる)。
function pickStatus(s: Status): void { emit('setStatus', s); closeMenu(); }
function pickAssignee(a: string): void { emit('setAssignee', a); closeMenu(); }
function pickPriority(p: Priority): void { emit('setPriority', p); closeMenu(); }
function pickValueImpact(v: ValueImpact): void { emit('setValueImpact', v); closeMenu(); }
function pickSprint(sp: string | null): void { emit('setSprint', sp); closeMenu(); }

// ===== 一括削除の 2 段階確認 (F-18) =====
// native window.confirm は (a) ブラウザ自動化 (e2e / MCP 実機検証) を完全にブロックし
// (b) アプリ内の確認 UI (DetailSheet の 2 段階削除) とスタイルが不統一なため使わない。
// 1 回目のクリックで armed 状態 (ボタン文言が「もう一度押して確定」に変化)、
// 2 回目で確定。数秒で自動解除し、メニューを閉じた時も解除する (誤爆防止)。
const removeArmed = ref(false);
let removeTimer: ReturnType<typeof setTimeout> | null = null;

function disarmRemove(): void {
  if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
  removeArmed.value = false;
}

function confirmRemove(): void {
  if (!removeArmed.value) {
    removeArmed.value = true;
    removeTimer = setTimeout(() => { removeArmed.value = false; removeTimer = null; }, 3000);
    return;
  }
  disarmRemove();
  closeMenu();
  emit('remove');
}

onUnmounted(() => { if (removeTimer) clearTimeout(removeTimer); });
</script>

<template>
  <div class="bulk-bar" data-testid="bulk-bar">
    <span class="bulk-count" data-testid="bulk-count">{{ count }} 件選択</span>
    <button class="bulk-link" data-testid="bulk-select-all" @click="emit('selectAll')">全選択</button>
    <button class="bulk-link" data-testid="bulk-clear" @click="emit('clear')">選択解除</button>

    <span class="bulk-spacer" />

    <button
      ref="kebabEl"
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

    <!-- F-29: メニューは body へ Teleport (祖先 .screen-body の overflow:hidden を回避)。 -->
    <Teleport to="body">
      <!-- メニュー外クリックで閉じる -->
      <div v-if="menuOpen" class="bulk-backdrop" data-testid="bulk-backdrop" @click="closeMenu" />

      <div v-if="menuOpen" ref="menuEl" class="bulk-menu" data-testid="bulk-menu" :style="menuStyle" @click.stop>
        <!-- ステータス変更 (hover / クリックで値リストを横にフライアウト) -->
        <div class="bulk-item-wrap" @mouseenter="showFlyout('status', $event)" @mouseleave="hideFlyout('status')">
          <button class="bulk-item" data-testid="bulk-set-status" :aria-expanded="openFlyout === 'status'"
                  @click="showFlyout('status', $event)">
            <span>ステータス変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div v-if="openFlyout === 'status'" ref="flyoutEl" class="bulk-flyout" data-testid="bulk-flyout" :style="flyoutStyle">
            <button v-for="s in STATUSES" :key="s" class="bulk-subitem"
                    :data-testid="`bulk-status-${s}`" @click="pickStatus(s)">{{ s }}</button>
          </div>
        </div>

        <!-- 担当者変更 -->
        <div class="bulk-item-wrap" @mouseenter="showFlyout('assignee', $event)" @mouseleave="hideFlyout('assignee')">
          <button class="bulk-item" data-testid="bulk-set-assignee" :aria-expanded="openFlyout === 'assignee'"
                  @click="showFlyout('assignee', $event)">
            <span>担当者変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div v-if="openFlyout === 'assignee'" ref="flyoutEl" class="bulk-flyout" data-testid="bulk-flyout" :style="flyoutStyle">
            <button v-for="m in members" :key="m.userId" class="bulk-subitem"
                    :data-testid="`bulk-assignee-${m.userId}`" @click="pickAssignee(m.userId)">
              {{ m.displayName }}
            </button>
            <p v-if="members.length === 0" class="bulk-empty">メンバーなし</p>
          </div>
        </div>

        <!-- 優先度変更 -->
        <div class="bulk-item-wrap" @mouseenter="showFlyout('priority', $event)" @mouseleave="hideFlyout('priority')">
          <button class="bulk-item" data-testid="bulk-set-priority" :aria-expanded="openFlyout === 'priority'"
                  @click="showFlyout('priority', $event)">
            <span>優先度変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div v-if="openFlyout === 'priority'" ref="flyoutEl" class="bulk-flyout" data-testid="bulk-flyout" :style="flyoutStyle">
            <button v-for="p in PRIORITIES" :key="p" class="bulk-subitem"
                    :data-testid="`bulk-priority-${p}`" @click="pickPriority(p)">{{ p }}</button>
          </div>
        </div>

        <!-- valueImpact 変更 -->
        <div class="bulk-item-wrap" @mouseenter="showFlyout('valueImpact', $event)" @mouseleave="hideFlyout('valueImpact')">
          <button class="bulk-item" data-testid="bulk-set-value-impact" :aria-expanded="openFlyout === 'valueImpact'"
                  @click="showFlyout('valueImpact', $event)">
            <span>valueImpact 変更</span><Icon name="caretRight" :size="12" />
          </button>
          <div v-if="openFlyout === 'valueImpact'" ref="flyoutEl" class="bulk-flyout" data-testid="bulk-flyout" :style="flyoutStyle">
            <button v-for="v in VALUE_IMPACTS" :key="v" class="bulk-subitem"
                    :data-testid="`bulk-value-impact-${v}`" @click="pickValueImpact(v)">{{ v }}</button>
          </div>
        </div>

        <!-- スプリント移動 (BACKLOG = sprintId 解除 / 既存スプリントへ set) -->
        <div class="bulk-item-wrap" @mouseenter="showFlyout('sprint', $event)" @mouseleave="hideFlyout('sprint')">
          <button class="bulk-item" data-testid="bulk-set-sprint" :aria-expanded="openFlyout === 'sprint'"
                  @click="showFlyout('sprint', $event)">
            <span>スプリント移動</span><Icon name="caretRight" :size="12" />
          </button>
          <div v-if="openFlyout === 'sprint'" ref="flyoutEl" class="bulk-flyout" data-testid="bulk-flyout" :style="flyoutStyle">
            <button class="bulk-subitem" data-testid="bulk-sprint-backlog" @click="pickSprint(null)">
              BACKLOG (未割当)
            </button>
            <button v-for="sp in sprints" :key="sp.id" class="bulk-subitem"
                    :data-testid="`bulk-sprint-${sp.id}`" @click="pickSprint(sp.id)">{{ sp.name?.trim() || `S${sp.number}` }}</button>
            <p v-if="sprints.length === 0" class="bulk-empty">スプリントなし</p>
          </div>
        </div>

        <div class="bulk-divider" />

        <!-- 削除 (2 段階確認 / F-18: 1 回目で armed、2 回目で確定。native confirm は使わない) -->
        <button
          class="bulk-item bulk-item--danger"
          :class="{ 'bulk-item--armed': removeArmed }"
          data-testid="bulk-delete"
          :data-armed="removeArmed ? 'true' : null"
          @click="confirmRemove"
        >
          {{ removeArmed ? `削除する (${count}件) — もう一度押して確定` : `${count} 件を削除` }}
        </button>
      </div>
    </Teleport>
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
/* F-29: body へ Teleport + fixed (top/left は computeMenuPosition の inline style)。
   絶対配置 (kebab 基準) だと祖先 .screen-body { overflow: hidden } にクリップされ、
   ビューポート下端でメニュー / サブメニューが見切れてクリック不能になる。 */
.bulk-menu {
  position: fixed;
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
/* armed 状態 (F-18): 反転強調で「もう一度押すと消える」ことを視覚的に伝える。 */
.bulk-item--armed,
.bulk-item--armed:hover { background: var(--err); color: #fff; font-weight: 600; }
.bulk-divider {
  height: var(--hairline);
  background: var(--line-1);
  margin: 4px 6px;
}
.bulk-item-wrap { position: relative; }
/* F-29: フライアウトも fixed (top/left は computeFlyoutPosition の inline style)。
   開閉は JS (mouseenter/mouseleave + クリック)。wrap の DOM 子のままなので、fixed で
   箱の外に出てもポインタがフライアウト上にある間は wrap の mouseleave は発火せず、
   親項目 → フライアウト間の hover 連続性が保たれる (座標は edge-to-edge で接する)。 */
.bulk-flyout {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 4px;
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(8, 8, 8, 0.14);
}
/* hover 中 / フライアウト表示中の親項目を視覚的にハイライト (現在地を示す)。
   フライアウトは wrap の DOM 子のため、fixed でもポインタが乗れば wrap は :hover になる。 */
.bulk-item-wrap:hover > .bulk-item,
.bulk-item[aria-expanded='true'] {
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
