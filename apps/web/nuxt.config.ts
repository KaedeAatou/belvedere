// Belvedere — Nuxt 3 設定
// UI: Hoshino クリーム + 暖オレンジ + Mohave 巨大英字 (Claude Design 2026-05-03 確定)

export default defineNuxtConfig({
  compatibilityDate: '2026-05-01',
  devtools: { enabled: true },
  ssr: true,

  // Cloud Run デプロイ用
  nitro: {
    preset: 'node-server',
  },

  // 認証必須ページの SSR を無効化する (2026-07-07)。
  // Firebase Auth はクライアントでしか動かないため、SSR は認証状態を知らないままこの
  // 2 画面をそのまま HTML に描画してブラウザへ送ってしまい、未認証ユーザーの直アクセスでも
  // 「一瞬、中身が見える」状態が生まれていた (middleware/plugin のリダイレクトは JS 実行後
  // にしか効かないため)。ssr:false でクライアントのみの描画にし、認証チェックが先に走って
  // から初めて中身が組み立てられるようにする (login はそもそも保護対象外なので対象外)。
  routeRules: {
    '/': { ssr: false },
    '/settings/profile': { ssr: false },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  // workspace パッケージを Nitro バンドルに含める (.js extension なし問題回避)
  // @belvedere/repo は web から参照しないため除外 (Firestore SDK + grpc 50MB+ の transitive
  // 流入を防止)。将来 web から repo を使う場合 (Phase 1-C 以降) は再度追加する。
  build: {
    transpile: ['@belvedere/shared', '@belvedere/seed'],
  },

  // components/ サブディレクトリの prefix を無効化
  // (例: components/screens/BacklogScreen.vue → <BacklogScreen /> で参照可能)
  components: [
    { path: '~/components', pathPrefix: false },
  ],

  // Belvedere デザイントークン (styles.css) + 画面別 CSS (screens.css)
  css: ['~/assets/css/styles.css', '~/assets/css/screens.css'],

  // Phase 1-B (2026-06-10): Firebase Auth + API クライアント設定
  // - public は SSR / クライアント両方から見える (Firebase config は public で機密ではない)
  // - apiBaseUrl は dev / prod で切替 (環境変数 NUXT_PUBLIC_API_BASE_URL)
  runtimeConfig: {
    public: {
      firebaseApiKey: 'AIzaSyCwtYyHcGwuspL_TWyw6qN6PHxvuLGW3AA',
      firebaseAuthDomain: 'belvedere-dev-atrium.firebaseapp.com',
      firebaseProjectId: 'belvedere-dev-atrium',
      firebaseAppId: '1:876087923874:web:898d399e0f1d74e39f73fb',
      apiBaseUrl: 'https://belvedere-api-dev-cpszmcqmuq-an.a.run.app',
      // ④ feature flag。既定 ON = AI パネル送信を Orchestrator (単一窓口=協議統括) 経由にし、
      // マルチエージェント協議をデモの既定挙動にする (P7 / 2026-07-07)。
      // kill-switch: env NUXT_PUBLIC_USE_ORCHESTRATOR_WINDOW=false でリビルド不要に無効化できる。
      useOrchestratorWindow: true,
      // P6 ストリーミング (SSE)。既定 ON。Cloud Run がバッファリングしても run イベントは最後に届くので
      // 「一括表示」に degrade するだけ (壊れない)。最初のイベント前に失敗したら非ストリームへ自動 fallback。
      // kill-switch: env NUXT_PUBLIC_USE_STREAMING_CHAT=false でリビルド不要に無効化できる。
      useStreamingChat: true,
    },
  },

  app: {
    head: {
      title: 'Belvedere — Spiral PM',
      htmlAttrs: { lang: 'ja' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=1440' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=Mohave:wght@400;500;600;700&family=Albert+Sans:wght@400;500;600&display=swap',
        },
      ],
    },
  },
});
