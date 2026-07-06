<script setup lang="ts">
// Belvedere ログイン画面 (Phase 1-B / 2026-06-10)
// Google でログイン + メール/パスワード (ハッカソン審査員用デモアカウント / 2026-06-23)。
// auth.global.ts middleware の対象外 (path === '/login' で skip される)。

definePageMeta({ layout: false });

const { signInWithGoogle, signInWithEmailPassword, isAuthenticated, isInitialized } = useAuth();
const router = useRouter();
const errorMessage = ref<string | null>(null);
const isLoading = ref(false);

const email = ref('');
const password = ref('');

// ハッカソン審査員向け: ワンクリックで共有デモアカウントにログインする。
// 資格情報は公開して良い使い捨てデモ用 (個人アカウントではない)。README を読まなくても
// ログイン画面で完結するように、画面に明示 + ボタンで自動入力+送信する。
const DEMO_EMAIL = 'demo@belvedere.demo';
const DEMO_PASSWORD = 'BelvedereDemo2026!';

async function loginAsDemo(): Promise<void> {
  email.value = DEMO_EMAIL;
  password.value = DEMO_PASSWORD;
  await loginWithEmail();
}

// 既にログイン済なら自動で / にリダイレクト (B→ログインボタン→/login の URL 直叩き等)
watch([isAuthenticated, isInitialized], ([authed, ready]) => {
  if (ready && authed) {
    router.push('/');
  }
}, { immediate: true });

function describeAuthError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case 'auth/popup-closed-by-user':
      return 'ログインをキャンセルしました。';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'メールアドレスまたはパスワードが違います。';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待って再試行してください。';
    default:
      return `ログインに失敗しました: ${err.message ?? '不明なエラー'}`;
  }
}

async function loginWithGoogle(): Promise<void> {
  errorMessage.value = null;
  isLoading.value = true;
  try {
    await signInWithGoogle();
    // onAuthStateChanged → watch でリダイレクトが走るので、ここでは push しない
  } catch (e) {
    errorMessage.value = describeAuthError(e);
  } finally {
    isLoading.value = false;
  }
}

async function loginWithEmail(): Promise<void> {
  errorMessage.value = null;
  if (!email.value || !password.value) {
    errorMessage.value = 'メールアドレスとパスワードを入力してください。';
    return;
  }
  isLoading.value = true;
  try {
    await signInWithEmailPassword(email.value.trim(), password.value);
    // onAuthStateChanged → watch でリダイレクトが走るので、ここでは push しない
  } catch (e) {
    errorMessage.value = describeAuthError(e);
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

      <div class="demo-callout">
        <p class="demo-label">審査員の方へ</p>
        <button
          class="demo-button"
          :disabled="isLoading"
          @click="loginAsDemo"
        >
          <span v-if="isLoading">サインイン中…</span>
          <span v-else>デモアカウントでログイン</span>
        </button>
        <p class="demo-creds">
          <code>demo@belvedere.demo</code> / <code>BelvedereDemo2026!</code>
        </p>
      </div>

      <div class="divider"><span>その他のログイン</span></div>

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

      <div class="divider"><span>または</span></div>

      <form class="email-form" @submit.prevent="loginWithEmail">
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="メールアドレス"
          class="text-input"
          :disabled="isLoading"
        />
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="パスワード"
          class="text-input"
          :disabled="isLoading"
        />
        <button type="submit" class="email-button" :disabled="isLoading">
          メール / パスワードでログイン
        </button>
      </form>

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

.demo-callout {
  border: var(--hairline) solid var(--accent);
  border-radius: var(--radius);
  padding: 18px 16px 14px;
  margin-bottom: 24px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.demo-label {
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin: 0 0 10px;
  letter-spacing: 0.04em;
}

.demo-button {
  width: 100%;
  padding: 14px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.demo-button:hover:not(:disabled) {
  opacity: 0.9;
}

.demo-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.demo-creds {
  margin: 10px 0 0;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  line-height: 1.6;
}

.demo-creds code {
  background: var(--bg-0);
  padding: 1px 5px;
  border-radius: 4px;
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

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  color: var(--ink-3);
  font-family: var(--sans);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: var(--hairline);
  background: var(--line-2);
}

.email-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.text-input {
  width: 100%;
  padding: 13px 14px;
  background: var(--bg-0);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink-0);
  box-sizing: border-box;
}

.text-input:focus {
  outline: none;
  border-color: var(--accent);
}

.text-input:disabled {
  opacity: 0.6;
}

.email-button {
  width: 100%;
  padding: 14px 20px;
  background: transparent;
  color: var(--ink-0);
  border: var(--hairline) solid var(--ink-0);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.email-button:hover:not(:disabled) {
  background: var(--ink-0);
  color: var(--bg-0);
}

.email-button:disabled {
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
