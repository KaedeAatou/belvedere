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

  typescript: {
    strict: true,
    typeCheck: false,
  },

  // workspace パッケージを Nitro バンドルに含める (.js extension なし問題回避)
  build: {
    transpile: ['@kazaguruma/shared', '@kazaguruma/seed', '@kazaguruma/repo'],
  },

  // components/ サブディレクトリの prefix を無効化
  // (例: components/screens/BacklogScreen.vue → <BacklogScreen /> で参照可能)
  components: [
    { path: '~/components', pathPrefix: false },
  ],

  // Belvedere デザイントークン (styles.css) + 画面別 CSS (screens.css)
  css: ['~/assets/css/styles.css', '~/assets/css/screens.css'],

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
