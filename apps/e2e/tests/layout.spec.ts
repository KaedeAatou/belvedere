// 行レイアウト回帰ガード (2026-06-13)。
//
// 背景: TicketRow は .trow の固定 grid (9 列) で 1 行 48px に収める設計だが、#extra スロットに
// 複数要素 (分割ボタン / ポーカー / StatusDot) を裸で置くと grid を溢れて Avatar が 2 行目に
// 折り返し、行の下に Avatar の円がはみ出すバグが出た。スクリーンショットは撮っていたが
// 「誰も見ない」ため流出した。レンダリング後の行高を assert して、この種の grid 溢れ・
// 折り返しを CI で機械的に捕まえる。
//
// 検出原理: 折り返しが起きると .trow の実 height が行高 (48px) の約 2 倍に膨らむ。
// 全 .trow の実測 height が許容上限を超えていないことを確認する。

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { RefinementPage } from '../pages/RefinementPage';

// .trow は height:48px。padding/border込みでも 56px 程度。折り返すと 90px 超になる。
const ROW_MAX_HEIGHT = 64;

/** 画面内の全 .trow について、折り返し (height 膨張) が無いことを assert する。 */
async function assertNoRowWrap(page: import('@playwright/test').Page, label: string): Promise<void> {
  const heights = await page.locator('.trow').evaluateAll((rows) =>
    rows.map((r) => (r as HTMLElement).getBoundingClientRect().height),
  );
  expect(heights.length, `${label}: .trow が 1 行も無い (描画されていない)`).toBeGreaterThan(0);
  const wrapped = heights.filter((h) => h > ROW_MAX_HEIGHT);
  expect(
    wrapped.length,
    `${label}: ${wrapped.length}/${heights.length} 行が折り返している (height=${wrapped.map((h) => Math.round(h)).join(',')}px > ${ROW_MAX_HEIGHT})。#extra の grid 溢れを疑う`,
  ).toBe(0);
}

test('Refinement: 行が折り返さない (#extra に分割/ポーカー/StatusDot を載せても 1 行)', async ({ authedPage }) => {
  const refine = new RefinementPage(authedPage);
  await refine.open();
  await expect(refine.body.locator('.trow').first()).toBeVisible({ timeout: 15_000 });
  await assertNoRowWrap(authedPage, 'Refinement');
});

test('Backlog: 行が折り返さない', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();
  await expect(backlog.liveTickets.first()).toBeVisible({ timeout: 15_000 });
  await assertNoRowWrap(authedPage, 'Backlog');
});
