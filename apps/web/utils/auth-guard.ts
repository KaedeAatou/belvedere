// 認証ガードの判定 (純粋関数 / middleware と plugin の単一ソース)。
//
// バグ経緯 (2026-07-07): auth.global middleware は「Firebase 初期化前は判定保留で素通し」するが、
// route middleware はナビゲーション時にしか走らない。未ログインの直アクセス (ハードロード / URL 直打ち)
// では、初期化完了後に誰も再判定せず、アプリシェル ((no name) 表示) が出続けていた。
// 判定をこの純粋関数に集約し、middleware (ナビゲーション時) と auth-redirect plugin
// (初期化完了時) の両方から使う。

/**
 * /login へリダイレクトすべきか。
 * - /login 自身は対象外
 * - Firebase 初期化前 (isInitialized=false) は判定保留 (リロード直後の誤リダイレクト防止)
 * - 初期化済みで未認証なら true
 */
export function shouldRedirectToLogin(path: string, isInitialized: boolean, isAuthenticated: boolean): boolean {
  if (path === '/login') return false;
  if (!isInitialized) return false;
  return !isAuthenticated;
}
