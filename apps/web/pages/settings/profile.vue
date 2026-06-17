<script setup lang="ts">
// /settings/profile — アカウント詳細 (Phase 1-C / 2026-06-11)。
// 表示名のみ編集可。役割 / メール / Workspace / Firebase UID は read-only。
// 末尾に debug セクション (Whoami 確認、Phase 1-B 動作検証用、後でフラグで隠す)。

const { me, isLoading, error, fetchMe, updateDisplayName } = useMe();
const { workspaces, currentId, fetch: fetchWorkspaces, create: createWorkspace, syncCurrentFromStorage } = useWorkspaces();
const { members, fetchMembers, isPendingInvite, invite, cancelInvite } = useMembers();

const editName = ref('');
const saveSuccess = ref(false);

// 管理操作 (招待 / 取消) は owner/sm のみ。me.role で判定。
const canManage = computed(() => me.value?.role === 'owner' || me.value?.role === 'sm');

// ===== Workspace 新規作成 =====
const wsName = ref('');
const wsGoal = ref('');
const wsBusy = ref(false);
const wsError = ref<string | null>(null);

async function submitCreateWorkspace(): Promise<void> {
  if (!wsName.value.trim()) { wsError.value = 'Workspace 名を入力してください。'; return; }
  wsBusy.value = true; wsError.value = null;
  try {
    const created = await createWorkspace(wsName.value.trim(), wsGoal.value.trim() || undefined);
    if (!created) wsError.value = 'Workspace の作成に失敗しました。';
    // create 成功時は location.reload() が走るので以降の処理は基本到達しない。
  } catch (e) {
    wsError.value = errText(e);
  } finally {
    wsBusy.value = false;
  }
}

// ===== メンバー招待 =====
const inviteEmail = ref('');
const inviteRole = ref<'sm' | 'po' | 'dev' | 'guest'>('dev');
const inviteBusy = ref(false);
const inviteError = ref<string | null>(null);
const inviteSuccess = ref(false);

async function submitInvite(): Promise<void> {
  if (!inviteEmail.value.trim()) { inviteError.value = 'メールアドレスを入力してください。'; return; }
  inviteBusy.value = true; inviteError.value = null; inviteSuccess.value = false;
  try {
    await invite(inviteEmail.value.trim(), inviteRole.value);
    inviteSuccess.value = true;
    inviteEmail.value = '';
    setTimeout(() => { inviteSuccess.value = false; }, 2500);
  } catch (e) {
    inviteError.value = errText(e);
  } finally {
    inviteBusy.value = false;
  }
}

async function revokeInvite(userId: string): Promise<void> {
  inviteError.value = null;
  try {
    await cancelInvite(userId);
  } catch (e) {
    inviteError.value = errText(e);
  }
}

// ===== API キー (per-user / MCP・programmatic) =====
const {
  keys: apiKeys,
  error: apiKeysError,
  newToken: newApiKey,
  fetchKeys: fetchApiKeys,
  createKey,
  revokeKey: revokeApiKey,
  dismissNewToken,
} = useApiKeys();
const keyName = ref('');
const keyBusy = ref(false);
const keyCopied = ref(false);

async function submitCreateKey(): Promise<void> {
  if (!keyName.value.trim()) return;
  keyBusy.value = true;
  try {
    const ok = await createKey(keyName.value.trim());
    if (ok) keyName.value = '';
  } finally {
    keyBusy.value = false;
  }
}

async function copyApiKey(): Promise<void> {
  if (!newApiKey.value) return;
  try {
    await navigator.clipboard.writeText(newApiKey.value);
    keyCopied.value = true;
    setTimeout(() => { keyCopied.value = false; }, 2000);
  } catch {
    /* clipboard 非対応環境は無視 (手動コピー可) */
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP');
}

function errText(e: unknown): string {
  const err = e as { data?: { error?: string }; message?: string };
  return err.data?.error ?? err.message ?? 'unknown error';
}

onMounted(async () => {
  syncCurrentFromStorage();
  if (!me.value) await fetchMe();
  editName.value = me.value?.displayName ?? '';
  await Promise.all([fetchWorkspaces(), fetchMembers(), fetchApiKeys()]);
});

watch(me, (m) => {
  if (m && !editName.value) editName.value = m.displayName;
});

async function save(): Promise<void> {
  saveSuccess.value = false;
  await updateDisplayName(editName.value);
  if (!error.value) {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2500);
  }
}

</script>

<template>
  <div class="profile-page">
    <header class="page-header">
      <NuxtLink to="/" class="back-link">← Belvedere に戻る</NuxtLink>
      <h1 class="page-title">アカウント設定</h1>
    </header>

    <section class="card">
      <h2 class="section-title">プロフィール</h2>

      <div v-if="isLoading && !me" class="loading">読み込み中…</div>

      <div v-else-if="me" class="fields">
        <div class="field">
          <label class="label">メール</label>
          <div class="value readonly">{{ me.email }}</div>
        </div>

        <div class="field">
          <label class="label">役割</label>
          <div class="value readonly">
            <span class="role-badge">{{ me.role }}</span>
          </div>
        </div>

        <div class="field">
          <label class="label">Workspace</label>
          <div class="value readonly">{{ me.workspaceId }}</div>
        </div>

        <div class="field editable">
          <label for="displayName" class="label">表示名</label>
          <div class="edit-row">
            <input
              id="displayName"
              v-model="editName"
              type="text"
              class="text-input"
              maxlength="80"
              :disabled="isLoading"
            />
            <button
              class="save-btn"
              :disabled="isLoading || editName.length === 0 || editName === me.displayName"
              @click="save"
            >
              {{ isLoading ? '保存中…' : '保存' }}
            </button>
          </div>
          <p v-if="saveSuccess" class="msg success">保存しました ✓</p>
          <p v-if="error" class="msg error">{{ error }}</p>
        </div>
      </div>

      <div v-else class="error">プロフィール取得失敗: {{ error ?? 'unknown' }}</div>
    </section>

    <!-- ===== Workspace 管理 (Phase 1-E 前倒し / 2026-06-12) ===== -->
    <section class="card">
      <h2 class="section-title">Workspace</h2>

      <!-- 所属 Workspace 一覧 -->
      <div class="field">
        <label class="label">所属 Workspace</label>
        <div class="ws-list">
          <div v-for="w in workspaces" :key="w.id"
               :class="['ws-row', w.id === currentId && 'ws-row--current']">
            <span class="ws-row-name">{{ w.name }}</span>
            <span v-if="w.id === currentId" class="ws-current-badge" style="margin-left: auto">表示中</span>
            <span class="ws-row-role">{{ w.role }}</span>
          </div>
          <p v-if="workspaces.length === 0" class="muted">所属 Workspace がありません。下のフォームで作成してください。</p>
        </div>
      </div>

      <!-- 新規作成フォーム -->
      <div class="field editable" style="margin-top: 20px">
        <label class="label" for="wsName">新規 Workspace を作成</label>
        <input id="wsName" v-model="wsName" type="text" class="text-input"
               data-testid="ws-create-name" maxlength="80" placeholder="例: C社" :disabled="wsBusy" />
        <input v-model="wsGoal" type="text" class="text-input" style="margin-top: 8px"
               maxlength="280" placeholder="プロダクトゴール (任意)" :disabled="wsBusy" />
        <div class="edit-row" style="margin-top: 8px">
          <button class="save-btn" data-testid="ws-create-submit"
                  :disabled="wsBusy || wsName.trim().length === 0" @click="submitCreateWorkspace">
            {{ wsBusy ? '作成中…' : 'Workspace を作成して切替' }}
          </button>
        </div>
        <p v-if="wsError" class="msg error" data-testid="ws-create-error">{{ wsError }}</p>
      </div>
    </section>

    <!-- ===== メンバー管理 ===== -->
    <section class="card">
      <h2 class="section-title">メンバー</h2>

      <div class="member-list">
        <div v-for="m in members" :key="m.userId"
             :data-testid="`member-row-${m.userId}`" class="member-row">
          <span class="member-name">{{ m.displayName }}</span>
          <span class="member-email">{{ m.email }}</span>
          <span v-if="isPendingInvite(m)" class="pending-badge" data-testid="member-pending">招待中</span>
          <span class="member-role-badge" style="margin-left: auto">{{ m.role }}</span>
          <button v-if="canManage && isPendingInvite(m)" class="revoke-btn"
                  :data-testid="`invite-revoke-${m.userId}`" @click="revokeInvite(m.userId)">取消</button>
        </div>
        <p v-if="members.length === 0" class="muted">メンバーがいません。</p>
      </div>

      <!-- 招待フォーム (owner/sm のみ) -->
      <div v-if="canManage" class="field editable" style="margin-top: 20px">
        <label class="label" for="inviteEmail">メンバーを招待</label>
        <div class="edit-row">
          <input id="inviteEmail" v-model="inviteEmail" type="email" class="text-input"
                 data-testid="invite-email" placeholder="invitee@example.com" :disabled="inviteBusy" />
          <select v-model="inviteRole" class="text-input role-select" data-testid="invite-role" :disabled="inviteBusy">
            <option value="sm">sm</option>
            <option value="po">po</option>
            <option value="dev">dev</option>
            <option value="guest">guest</option>
          </select>
          <button class="save-btn" data-testid="invite-submit"
                  :disabled="inviteBusy || inviteEmail.trim().length === 0" @click="submitInvite">
            {{ inviteBusy ? '送信中…' : '招待' }}
          </button>
        </div>
        <p v-if="inviteSuccess" class="msg success">招待しました ✓ (相手の初回ログインで自動加入します)</p>
        <p v-if="inviteError" class="msg error" data-testid="invite-error">{{ inviteError }}</p>
      </div>
    </section>

    <!-- ===== API キー (per-user / MCP・programmatic アクセス) ===== -->
    <section class="card">
      <h2 class="section-title">API キー (MCP / programmatic)</h2>
      <p class="muted" style="margin-bottom: 16px">
        CI・スクリプト・個人の MCP から<strong>あなた本人として</strong> API を叩くためのキー。
        発行時に平文を<strong>1 回だけ</strong>表示します (再表示不可・保存はハッシュのみ)。
        MCP では <code>BELVEDERE_MCP_TOKEN</code> にこのキーを設定します。
      </p>

      <!-- 発行直後のキー (今だけ表示) -->
      <div v-if="newApiKey" class="token-reveal" data-testid="api-key-reveal">
        <p class="label">新しいキー — 今だけ表示されます。今すぐコピーしてください</p>
        <code class="token-value">{{ newApiKey }}</code>
        <div class="edit-row" style="margin-top: 10px">
          <button class="save-btn" data-testid="api-key-copy" @click="copyApiKey">
            {{ keyCopied ? 'コピーしました ✓' : 'コピー' }}
          </button>
          <button class="revoke-btn" @click="dismissNewToken">閉じる</button>
        </div>
      </div>

      <!-- キー一覧 -->
      <div class="member-list">
        <div v-for="k in apiKeys" :key="k.id" :data-testid="`api-key-row-${k.id}`" class="member-row">
          <span class="member-name">{{ k.name }}</span>
          <code class="member-email">{{ k.tokenPrefix }}…</code>
          <span class="muted">
            {{ fmtDate(k.createdAt) }}{{ k.lastUsedAt ? ` / 最終 ${fmtDate(k.lastUsedAt)}` : ' / 未使用' }}
          </span>
          <button class="revoke-btn" style="margin-left: auto"
                  :data-testid="`api-key-revoke-${k.id}`" @click="revokeApiKey(k.id)">失効</button>
        </div>
        <p v-if="apiKeys.length === 0" class="muted">キーがありません。下で発行できます。</p>
      </div>

      <!-- 発行フォーム -->
      <div class="field editable" style="margin-top: 20px">
        <label class="label" for="keyName">キーを発行</label>
        <div class="edit-row">
          <input id="keyName" v-model="keyName" type="text" class="text-input"
                 data-testid="api-key-name" maxlength="80" placeholder="例: mcp-local" :disabled="keyBusy" />
          <button class="save-btn" data-testid="api-key-create"
                  :disabled="keyBusy || keyName.trim().length === 0" @click="submitCreateKey">
            {{ keyBusy ? '発行中…' : '発行' }}
          </button>
        </div>
        <p v-if="apiKeysError" class="msg error" data-testid="api-key-error">{{ apiKeysError }}</p>
      </div>
    </section>

  </div>
</template>

<style scoped>
/* body は 5 階アプリ用に overflow:hidden + height:100% なので、設定ページは
   自前でスクロール領域にしないと縦に長い内容 (4 カード) が切れて到達できない。
   ページ自体を 100vh のスクロールコンテナにし、中身は 720px で中央寄せする。 */
.profile-page {
  height: 100vh;
  overflow-y: auto;
  padding: 48px 32px;
  font-family: var(--sans);
}
.profile-page > * {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.page-header {
  margin-bottom: 32px;
}

.back-link {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-2);
  text-decoration: none;
  letter-spacing: 0.04em;
}

.back-link:hover {
  color: var(--accent);
}

.page-title {
  font-family: var(--display);
  font-size: 32px;
  font-weight: 600;
  color: var(--ink-0);
  margin: 8px 0 0;
  letter-spacing: 0.01em;
}

.card {
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  padding: 32px;
  margin-bottom: 24px;
}

.section-title {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-2);
  margin: 0 0 24px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.value {
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink-0);
}

.value.readonly {
  color: var(--ink-1);
  padding: 8px 0;
}

.value.mono {
  font-family: var(--mono);
  font-size: 12px;
  word-break: break-all;
}

/* .role-badge は既存 e2e (profile.spec) が一意 locator として参照するため
   プロフィール節の 1 箇所だけで使う。WS/メンバー一覧は別クラス名にする。 */
.role-badge, .ws-current-badge, .member-role-badge {
  display: inline-block;
  background: var(--accent-bg);
  color: var(--accent);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.edit-row {
  display: flex;
  gap: 8px;
}

.text-input {
  flex: 1;
  padding: 10px 12px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink-0);
}

.text-input:focus {
  outline: none;
  border-color: var(--accent);
}

.save-btn {
  padding: 10px 20px;
  background: var(--ink-0);
  color: var(--bg-0);
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.save-btn:hover:not(:disabled) {
  background: var(--ink-1);
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.msg {
  font-family: var(--sans);
  font-size: 12px;
  margin: 4px 0 0;
}

.msg.success { color: var(--ok); }
.msg.error { color: var(--err); }

.loading, .error {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
}


/* ===== Workspace / メンバー管理 ===== */
.muted {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
  margin: 8px 0 0;
}

.ws-list, .member-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ws-row, .member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: var(--hairline) solid var(--line-1);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans);
  font-size: 13px;
}

.ws-row--current {
  border-color: var(--accent);
}

.ws-row-name, .member-name {
  font-weight: 500;
  color: var(--ink-0);
}

.ws-row-role, .member-row .member-role-badge {
  flex-shrink: 0;
}

.member-email {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
}

.pending-badge {
  font-family: var(--mono);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--bg-3);
  color: var(--ink-2);
  letter-spacing: 0.02em;
}

.revoke-btn {
  padding: 4px 10px;
  background: transparent;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 12px;
  color: var(--err);
  cursor: pointer;
}

.revoke-btn:hover {
  border-color: var(--err);
}

.role-select {
  flex: 0 0 auto;
  width: 90px;
}

/* ===== API キー: 発行直後の「今だけ表示」バナー ===== */
.token-reveal {
  border: var(--hairline) solid var(--accent);
  border-radius: var(--radius);
  background: var(--accent-bg);
  padding: 16px;
  margin-bottom: 20px;
}

.token-value {
  display: block;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-0);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink-0);
  word-break: break-all;
  user-select: all;
}

.member-row code.member-email {
  flex-shrink: 0;
}
</style>
