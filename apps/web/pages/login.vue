<script setup lang="ts">
// Belvedere ログイン画面 (Phase 1-B / 2026-06-10)
// Google でログインボタン 1 つ + 招待制の説明文。
// auth.global.ts middleware の対象外 (path === '/login' で skip される)。

definePageMeta({ layout: false });

const { signInWithGoogle, isAuthenticated, isInitialized } = useAuth();
const router = useRouter();
const errorMessage = ref<string | null>(null);
const isLoading = ref(false);

// 既にログイン済なら自動で / にリダイレクト (B→ログインボタン→/login の URL 直叩き等)
watch([isAuthenticated, isInitialized], ([authed, ready]) => {
  if (ready && authed) {
    router.push('/');
  }
}, { immediate: true });

async function loginWithGoogle(): Promise<void> {
  errorMessage.value = null;
  isLoading.value = true;
  try {
    await signInWithGoogle();
    // onAuthStateChanged → watch でリダイレクトが走るので、ここでは push しない
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/popup-closed-by-user') {
      errorMessage.value = 'ログインをキャンセルしました。';
    } else {
      errorMessage.value = `ログインに失敗しました: ${err.message ?? '不明なエラー'}`;
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="brand">BELVEDERE</h1>
      <p class="brand-sub">Spiral Project Management</p>

      <button
        class="google-button"
        :disabled="isLoading"
        @click="loginWithGoogle"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
        <span v-if="isLoading">サインイン中…</span>
        <span v-else>Google でログイン</span>
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <p class="hint">招待制 — Workspace owner にメンバ追加を依頼してください</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--bg-0);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  padding: 56px 48px;
  width: 100%;
  max-width: 420px;
  text-align: center;
}

.brand {
  font-family: var(--display);
  font-size: 56px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-0);
  margin: 0;
  line-height: 1;
}

.brand-sub {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink-2);
  margin: 12px 0 48px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.google-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 14px 20px;
  background: var(--ink-0);
  color: var(--bg-0);
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.google-button:hover:not(:disabled) {
  background: var(--ink-1);
}

.google-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: var(--err);
  font-size: 13px;
  margin-top: 16px;
  font-family: var(--sans);
}

.hint {
  margin-top: 36px;
  font-size: 12px;
  color: var(--ink-3);
  font-family: var(--sans);
  line-height: 1.5;
}
</style>
