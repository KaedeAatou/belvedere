// apps/web の component 単体テスト基盤 (T1b / 2026-06-18)。
//
// なぜ environment:'nuxt' か: 対象コンポーネントは Nuxt の auto-import (computed/ref などの Vue
// マクロ + useFindings/useTickets 等の composable + 子コンポーネント) に依存して mount される。
// happy-dom 単体ではこれらが解決できず ReferenceError になる。@nuxt/test-utils の nuxt 環境が
// 実 Nuxt コンテキストで auto-import を解決するため、これが正しい層 (testing.md の component unit)。
//
// ここは「配線」(drag→API 引数 / dirty→保存 enable / prop→描画) だけを薄く検証する。
// 見た目 CSS は対象外 (スクショ目視 / 実機)、ロジックは shared/tools の純粋関数 unit が担う。

import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
  },
});
