# Nuxt 3 Rules

## Principles

- File-based routing for top-level screens (`pages/<name>.vue` で URL 1 階層、複雑な state は `app.vue` か `pages/index.vue` 集約)
- Auto-import everything (`components/` / `composables/` / `utils/` は明示 import 不要)
- Workspace transpile for monorepo (`build.transpile: ['<workspace-pkg>']` で内部パッケージを Nitro バンドル、未指定だと dist build なしで解決失敗)
- Cloud Run via nitro node-server (`nitro.preset: 'node-server'` を仕込む、サーバ起動は `node .output/server/index.mjs`)
- Global CSS for design tokens (`assets/css/*.css` を `nuxt.config.ts` の `css: [...]` で読み込み、SFC scoped に再宣言しない)
