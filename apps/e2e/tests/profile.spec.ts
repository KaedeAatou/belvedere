// Stage 1 1 シナリオ: login → /settings/profile → 表示名取得 + Whoami (2026-06-10)。
//
// 期待動作:
// 1. robot user で signInWithCustomToken
// 2. / にいる状態
// 3. /settings/profile に直接遷移
// 4. プロフィール領域に email / role / workspaceId が表示される
// 5. Debug セクションの「/api/whoami を呼ぶ」ボタン押下 → role: 'owner' が含まれる JSON が表示される
//
// Stage 1 では Page Object Model を使わず、test 内に locator を直書き。
// Stage 2 で SettingsProfilePage に切り出す予定 (POM 化)。

import { test, expect } from '../fixtures/auth.fixture';

test('settings/profile が表示され、Whoami debug で owner role が確認できる', async ({ authedPage }) => {
  await authedPage.goto('/settings/profile', { waitUntil: 'networkidle' });

  // プロフィール領域が表示される
  await expect(authedPage.getByText('プロフィール')).toBeVisible({ timeout: 15_000 });

  // email が表示される (具体値は CI / ローカルで違うが、@ を含む文字列があれば良い)
  const emailVisible = await authedPage.locator('text=/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/').first().isVisible();
  expect(emailVisible).toBe(true);

  // role バッジに 'owner' が含まれる (Phase 1-B 動作 + email allowlist bootstrap の証拠)
  await expect(authedPage.locator('.role-badge')).toContainText('owner', { ignoreCase: true });

  // Workspace 表示
  await expect(authedPage.getByText('ws-belvedere')).toBeVisible();

  // Debug セクションが見える
  await expect(authedPage.getByText('Phase 1-B 動作検証')).toBeVisible();

  // 「/api/whoami を呼ぶ」ボタンを押下
  await authedPage.getByRole('button', { name: /whoami/i }).click();

  // 結果に role: "owner" が表示されることを確認
  await expect(authedPage.locator('.whoami-result')).toContainText('"role"', { timeout: 10_000 });
  await expect(authedPage.locator('.whoami-result')).toContainText('"owner"');
  await expect(authedPage.locator('.whoami-result')).toContainText('"workspaceId"');
  await expect(authedPage.locator('.whoami-result')).toContainText('"ws-belvedere"');
});

test('右上 UserMenu のドロップダウンに owner バッジと email が表示される', async ({ authedPage }) => {
  await authedPage.goto('/', { waitUntil: 'networkidle' });

  // 右上のアバターボタンをクリック
  await authedPage.locator('.avatar-btn').click();

  // dropdown に owner バッジが見える
  await expect(authedPage.locator('.dropdown')).toBeVisible({ timeout: 5_000 });
  await expect(authedPage.locator('.badge-role')).toContainText('owner', { ignoreCase: true });
  await expect(authedPage.locator('.badge-ws')).toContainText('ws-belvedere');

  // 「アカウント設定」リンクが見える
  await expect(authedPage.getByRole('button', { name: /アカウント設定/ })).toBeVisible();
});
