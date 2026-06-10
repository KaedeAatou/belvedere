// /settings/profile e2e (Stage 2 / 2026-06-11)。
// Stage 1 の直書き locator を Page Object Model に移行 (拡張性確保)。

import { test, expect } from '../fixtures/auth.fixture';
import { SettingsProfilePage } from '../pages/SettingsProfilePage';

test('settings/profile で email/role/workspace 表示 + Whoami debug で owner role 確認', async ({ authedPage }) => {
  const profile = new SettingsProfilePage(authedPage);
  await profile.open();

  await expect(profile.roleBadge).toContainText('owner', { ignoreCase: true });
  await expect(authedPage.getByText('ws-belvedere')).toBeVisible();

  await profile.clickWhoami();
  expect(await profile.whoamiContainsRole('owner')).toBe(true);
});

test('右上 UserMenu ドロップダウンに owner バッジ + email 表示', async ({ authedPage }) => {
  await authedPage.goto('/', { waitUntil: 'networkidle' });

  await authedPage.locator('.avatar-btn').click();
  await expect(authedPage.locator('.dropdown')).toBeVisible({ timeout: 5_000 });
  await expect(authedPage.locator('.badge-role')).toContainText('owner', { ignoreCase: true });
  await expect(authedPage.locator('.badge-ws')).toContainText('ws-belvedere');

  await expect(authedPage.getByRole('button', { name: /アカウント設定/ })).toBeVisible();
});
