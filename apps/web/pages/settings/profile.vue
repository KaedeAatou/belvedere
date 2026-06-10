<script setup lang="ts">
// /settings/profile — アカウント詳細 (Phase 1-C / 2026-06-11)。
// 表示名のみ編集可。役割 / メール / Workspace / Firebase UID は read-only。
// 末尾に debug セクション (Whoami 確認、Phase 1-B 動作検証用、後でフラグで隠す)。

const { user } = useAuth();
const { me, isLoading, error, fetchMe, updateDisplayName } = useMe();
const api = useApiClient();

const editName = ref('');
const saveSuccess = ref(false);

onMounted(async () => {
  if (!me.value) await fetchMe();
  editName.value = me.value?.displayName ?? '';
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

// Debug: Whoami 確認
const whoamiResult = ref<string>('');
const whoamiLoading = ref(false);
async function callWhoami(): Promise<void> {
  whoamiLoading.value = true;
  whoamiResult.value = '';
  try {
    const json = await api.get<unknown>('/api/whoami');
    whoamiResult.value = JSON.stringify(json, null, 2);
  } catch (e) {
    const err = e as { data?: unknown; message?: string };
    whoamiResult.value = JSON.stringify({ error: err.data ?? err.message ?? 'unknown' }, null, 2);
  } finally {
    whoamiLoading.value = false;
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

    <section class="card debug">
      <h2 class="section-title">🐛 Debug — Phase 1-B 動作検証</h2>
      <p class="debug-hint">本番リリース時に削除予定。/api/whoami を実際に呼んで認証経路が動いていることを確認。</p>
      <div class="field">
        <label class="label">Firebase UID</label>
        <div class="value readonly mono">{{ user?.uid ?? '(未取得)' }}</div>
      </div>
      <button class="debug-btn" :disabled="whoamiLoading" @click="callWhoami">
        {{ whoamiLoading ? '実行中…' : '/api/whoami を呼ぶ' }}
      </button>
      <pre v-if="whoamiResult" class="whoami-result">{{ whoamiResult }}</pre>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 32px;
  font-family: var(--sans);
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

.role-badge {
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

.card.debug {
  border-color: var(--line-1);
  background: var(--bg-0);
}

.debug-hint {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-3);
  margin: 0 0 16px;
  line-height: 1.5;
}

.debug-btn {
  padding: 8px 16px;
  background: var(--bg-2);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-1);
  cursor: pointer;
  margin-top: 8px;
}

.debug-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.whoami-result {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-2);
  border: var(--hairline) solid var(--line-1);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-1);
  overflow-x: auto;
  white-space: pre-wrap;
}
</style>
