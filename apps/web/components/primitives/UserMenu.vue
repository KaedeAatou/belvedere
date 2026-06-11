<script setup lang="ts">
// 右上ヘッダのユーザメニュー (Phase 1-C / 2026-06-11)。
// クリック → ドロップダウン展開 → 表示名 / メール / 役割 / Workspace / 設定リンク / ログアウト。
// /login と /settings/profile の遷移は NuxtLink を使う。

const { user, signOut } = useAuth();
const { me, fetchMe } = useMe();
const { workspaces, currentId, fetch: fetchWorkspaces, setCurrent, syncCurrentFromStorage } = useWorkspaces();
const router = useRouter();

const open = ref(false);
const menuRef = ref<HTMLElement | null>(null);

// 現在の Workspace 表示名 (一覧から currentId で引く。未取得時は currentId そのまま)。
const currentWorkspaceName = computed(() => {
  const w = workspaces.value.find((x) => x.id === currentId.value);
  return w?.name ?? currentId.value ?? me.value?.workspaceId ?? '';
});

function switchWorkspace(id: string): void {
  if (id === currentId.value) { open.value = false; return; }
  setCurrent(id); // localStorage 更新 + location.reload() で全 composable 再取得
}

// 表示用: me が取れていればそちらを優先、なければ Firebase user
const display = computed(() => ({
  name: me.value?.displayName ?? user.value?.displayName ?? user.value?.email ?? '',
  email: user.value?.email ?? '',
  role: me.value?.role ?? '',
  workspaceId: me.value?.workspaceId ?? '',
  photoURL: user.value?.photoURL ?? null,
}));

// 頭文字 (photoURL が無い時の fallback)
const initials = computed(() => {
  const src = (me.value?.displayName ?? user.value?.email ?? '?').trim();
  return src.charAt(0).toUpperCase();
});

// マウント時に /api/me を取得 (まだ取得していなければ)
// 注: useApiClient が waitAuthReady で auth 復元を待つので、user.value が
// 立つ前に呼んでも問題ない (await fetchMe の内部で待つ)。
// page navigation (hard reload) 直後は user.value が null のまま onMounted が
// 走るため、user.value チェックを入れると fetchMe が呼ばれず me が永遠に null になる。
onMounted(async () => {
  syncCurrentFromStorage();
  if (!me.value) await fetchMe();
  if (workspaces.value.length === 0) await fetchWorkspaces();
});

// 外側クリックで閉じる
function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

async function handleSignOut(): Promise<void> {
  open.value = false;
  await signOut();
  await router.push('/login');
}

function goSettings(): void {
  open.value = false;
  router.push('/settings/profile');
}
</script>

<template>
  <div ref="menuRef" class="user-menu">
    <button
      class="avatar-btn"
      :title="display.name"
      @click="open = !open"
    >
      <img v-if="display.photoURL" :src="display.photoURL" alt="" class="avatar-img" />
      <span v-else class="avatar-initials">{{ initials }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <div class="info">
        <div class="info-name">{{ display.name || '(no name)' }}</div>
        <div class="info-email">{{ display.email }}</div>
        <div class="info-meta">
          <span v-if="display.role" class="badge badge-role">{{ display.role }}</span>
          <span v-if="currentWorkspaceName" class="badge badge-ws">{{ currentWorkspaceName }}</span>
        </div>
      </div>
      <div class="divider"></div>

      <!-- Workspace 切替 -->
      <div class="ws-section" data-testid="ws-switcher">
        <div class="ws-cap">WORKSPACE</div>
        <button
          v-for="w in workspaces"
          :key="w.id"
          :class="['menu-item', 'ws-item', w.id === currentId && 'ws-item--active']"
          :data-testid="`ws-option-${w.id}`"
          @click="switchWorkspace(w.id)"
        >
          <span class="ws-check">{{ w.id === currentId ? '✓' : '' }}</span>
          <span class="ws-name">{{ w.name }}</span>
          <!-- .badge-role は既存 e2e が一意 locator 前提のため WS 一覧では別クラス名 -->
          <span class="badge badge-ws-role" style="margin-left: auto">{{ w.role }}</span>
        </button>
        <button class="menu-item ws-new" data-testid="ws-create-open" @click="goSettings">
          <Icon name="plus" />
          <span>新規 Workspace</span>
        </button>
      </div>

      <div class="divider"></div>
      <button class="menu-item" @click="goSettings">
        <Icon name="settings" />
        <span>アカウント設定</span>
      </button>
      <div class="divider"></div>
      <button class="menu-item danger" @click="handleSignOut">
        <span>ログアウト</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.avatar-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: var(--hairline) solid var(--line-2);
  background: var(--bg-2);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.15s;
}

.avatar-btn:hover {
  border-color: var(--accent);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-1);
}

.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 240px;
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(8, 8, 8, 0.08);
  padding: 8px;
  z-index: 100;
}

.info {
  padding: 8px 12px;
}

.info-name {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-0);
  margin-bottom: 2px;
}

.info-email {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  margin-bottom: 8px;
}

.info-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge {
  font-family: var(--mono);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.badge-role, .badge-ws-role {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
}

.badge-ws {
  background: var(--bg-3);
  color: var(--ink-2);
}

.divider {
  height: 1px;
  background: var(--line-1);
  margin: 6px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-1);
  text-align: left;
  cursor: pointer;
  border-radius: 2px;
}

.menu-item:hover {
  background: var(--bg-3);
}

.menu-item.danger {
  color: var(--err);
}

.menu-item.danger:hover {
  background: rgba(184, 90, 74, 0.08);
}

.ws-section {
  padding: 2px 0;
}

.ws-cap {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  padding: 4px 12px;
}

.ws-item {
  font-size: 13px;
}

.ws-item--active {
  color: var(--ink-0);
  font-weight: 600;
}

.ws-check {
  width: 14px;
  display: inline-flex;
  justify-content: center;
  color: var(--accent);
  font-weight: 700;
}

.ws-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-new {
  color: var(--accent);
}
</style>
