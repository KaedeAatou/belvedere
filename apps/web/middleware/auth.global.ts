// 全ルートに適用される認証ガード (Nuxt の global middleware)。
// 未認証 → /login にリダイレクト。/login 自体は除外。
//
// SSR 中は Firebase Auth が動作しないので、server side では認証チェックを skip し
// クライアント側でハイドレーション後に判定する。
// (Firebase の onAuthStateChanged は async なので isInitialized が true になるまで待つ)
//
// 注意: このガードは「ナビゲーション時」にしか走らない。未ログインの直アクセス (URL 直打ち /
// ハードロード) では、この 1 回の判定時点でまだ isInitialized=false のことが多く、その後
// isInitialized が true に変わっても再判定されない (= 未認証シェルが表示され続ける)。
// その穴は plugins/auth-redirect.client.ts (isInitialized の変化を監視) が塞ぐ。

export default defineNuxtRouteMiddleware((to) => {
  // server side では何もしない (client side hydration 後に判定)
  if (import.meta.server) return;

  const { isAuthenticated, isInitialized } = useAuth();

  if (shouldRedirectToLogin(to.path, isInitialized.value, isAuthenticated.value)) {
    return navigateTo('/login');
  }
});
