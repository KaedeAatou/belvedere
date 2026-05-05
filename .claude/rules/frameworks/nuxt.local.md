# Nuxt 3 — Project-specific patterns

## Project-specific patterns

- `components: [{ path: '~/components', pathPrefix: false }]` - サブディレクトリ prefix 無効化 (`components/screens/BacklogScreen.vue` を `<BacklogScreen />` で参照)
- `build.transpile: ['@belvedere/shared', '@belvedere/seed', '@belvedere/repo']` - workspace パッケージを Nitro バンドルに含める (`.js` 拡張子なし import を解決するため必須)
- `nitro: { preset: 'node-server' }` - Cloud Run デプロイ用、`node .output/server/index.mjs` で起動
- `compatibilityDate: '2026-05-01'` - Nuxt 互換日付固定
- `app.head.link` で Google Fonts を読み込み - Noto Sans JP / Mohave / Albert Sans (Hoshino タイポグラフィ)
- `assets/css/styles.css` + `assets/css/screens.css` - design tokens (CSS variables) と画面別スタイル、両方 `nuxt.config.ts` の `css: [...]` 経由で読み込み
- `tsconfig.json` は `{ "extends": "./.nuxt/tsconfig.json" }` のみ - Nuxt 自動生成の typeconfig を継承
- `pnpm typecheck` 内で `nuxt prepare && vue-tsc --noEmit` - typecheck 前に `.nuxt/` 再生成
- `apps/web/.nuxt/` / `apps/web/.output/` - 生成物 (gitignore 対象)
- `pnpm --filter @belvedere/web dev` で `:3000` 起動 / SSR enabled
- 内部 import は `~/components/...` / `~/composables/...` (`~` alias は project root)

## Layout caveats

- 1度に複数の `nuxt dev` を起動すると `acquireDevLock` で 2nd は失敗 → `pkill -f nuxt` 後に再起動
- `.vue` 編集後の typecheck 自動 hook は **無し** (`ts-typecheck.sh` は `.ts/.tsx` のみ)。手動で `pnpm typecheck` を流すか hook を拡張

## Design Handoff workflow (claude.ai Designer → Nuxt)

UI は **claude.ai Designer** → **Anthropic Design API Handoff** で受領する確立されたフロー (2026-05-03 確立):

1. claude.ai 側で Artifact メニューの **"Handoff to Claude Code..."** を押す
2. ターミナルに `Fetch this design file ... https://api.anthropic.com/v1/design/h/<id>?open_file=<file>.html` 形式の指示が出る → そのまま Claude Code に渡す
3. WebFetch で URL を取得 → **gzip バイナリ (~200KB)** が落ちる → 解凍すると README + chat 履歴 (デザイン意図) + standalone HTML + 11 個前後の **React JSX/CSS** ソースが入っている
4. Designer 出力は **React JSX** だが Nuxt 採用のため **Vue 3 SFC に変換**: `<script setup lang="ts">` + scoped CSS / Tailwind 不使用 / props は `defineProps<{...}>()` で型付け
5. ファイル振り分け: `apps/web/assets/css/{styles,screens}.css` (Designer の CSS そのまま) / `apps/web/components/primitives/<Name>.vue` (Icon / Avatar / FlagPill 等) / `apps/web/components/screens/<Name>Screen.vue` (5画面) / `apps/web/composables/use<Domain>.ts` (TS 化された demo data)
6. **claude.ai 共有リンク `claude.ai/design/p/...` は WebFetch で 403** (認証 Cookie 必須)。Handoff URL (`api.anthropic.com/v1/design/h/...`) のみ取得可能
