// 全ルートに適用される認証ガード (Nuxt の global middleware)。
// 未認証 → /login にリダイレクト。/login 自体は除外。
//
// SSR 中は Firebase Auth が動作しないので、server side では認証チェックを skip し
// クライアント側でハイドレーション後に判定する。
// (Firebase の onAuthStateChanged は async なので isInitialized が true になるまで待つ)

export default defineNuxtRouteMiddleware((to) => {
  // /login は認証不要
  if (to.path === '/login') return;

  // server side では何もしない (client side hydration 後に判定)
  if (import.meta.server) return;

  const { isAuthenticated, isInitialized } = useAuth();

  // onAuthStateChanged が 1 度走るまでは判定保留 (リロード直後の誤リダイレクト防止)
  if (!isInitialized.value) return;

  if (!isAuthenticated.value) {
    return navigateTo('/login');
  }
});
