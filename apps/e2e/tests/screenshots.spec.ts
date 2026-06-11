// 全画面スクリーンショット巡回 (T0 / §V スクリーンショット自己検証プロトコル)。
//
// 目的: 実装モデルが「自分の目 (Read で PNG を見る)」で画面崩れを判定するための撮影器。
// CI の playwright-results-<run_id> artifact に test-results/screens/*.png が含まれる。
//
// 動作: authedPage で / を開き、左レールの各階 (rail-<screenId>) を順にクリックして
// 各画面を fullPage 撮影する。assert は「画面ごとに最低 1 要素が visible」程度の軽いものに留め、
// 本命は PNG (撮影を assert より先に行い、内容が薄くても必ず画像を残す)。
//
// 注意: このテストは read-only (チケットを作成しない)。seed / 本番データを汚さない。

import { test, expect } from '../fixtures/auth.fixture';

// rail-backlog は railTab='backlog' (デフォルト) で、儀式は Events タブで表示される。
const CEREMONIES = ['planning', 'daily', 'refinement', 'review', 'retro'] as const;

test('全画面スクリーンショット巡回', async ({ authedPage }) => {
  const page = authedPage;

  // --- Backlog (初期画面 / railTab=backlog) ---
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('rail-backlog')).toBeVisible({ timeout: 15_000 });
  // 実データ (live セクション) の描画を少し待つ
  await page.waitForTimeout(1500);
  await page.screenshot({ fullPage: true, path: 'test-results/screens/backlog.png' });
  await expect(page.locator('.shell-main')).toBeVisible();

  // --- Events タブに切替えて儀式レールを表示 ---
  await page.getByRole('button', { name: 'Events', exact: true }).click();

  for (const id of CEREMONIES) {
    const railItem = page.getByTestId(`rail-${id}`);
    // refinement は T9 で追加されるまで存在しない。存在する画面だけ撮る (T0→T9 の段階差を吸収)。
    if ((await railItem.count()) === 0) continue;
    await railItem.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ fullPage: true, path: `test-results/screens/${id}.png` });
    await expect(page.locator('.shell-main')).toBeVisible();
  }

  // --- Settings / Profile ---
  await page.goto('/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ fullPage: true, path: 'test-results/screens/settings.png' });
});
