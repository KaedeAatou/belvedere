// 未ログイン直アクセスの取りこぼしを塞ぐ client plugin (2026-07-07)。
//
// auth.global middleware は初回ハードロード時に Firebase 初期化前 (isInitialized=false) で
// 素通しし、route middleware は以後のナビゲーションが起きるまで再実行されない。そのため未ログインの
// 直アクセス (URL 直打ち) で backlog シェルが (no name) のまま表示され続けていた
// (審査員が公開 URL を直接開く経路で必ず踏む)。
// ここで初期化完了 (isInitialized true) を監視し、その時点で未認証なら /login へ送る。

export default defineNuxtPlugin(() => {
  const { isAuthenticated, isInitialized } = useAuth();
  const route = useRoute();

  watch(
    isInitialized,
    (v) => {
      if (shouldRedirectToLogin(route.path, v, isAuthenticated.value)) {
        void navigateTo('/login');
      }
    },
    { immediate: true }, // plugin 実行時点で既に初期化済みだった場合もここで判定する
  );
});
