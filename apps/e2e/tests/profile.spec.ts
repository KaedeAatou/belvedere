// /settings/profile e2e (Stage 2 / 2026-06-11)。
// Stage 1 の直書き locator を Page Object Model に移行 (拡張性確保)。

import { test, expect } from '../fixtures/auth.fixture';
import { SettingsProfilePage } from '../pages/SettingsProfilePage';

test('/api/me が token 込みで 200 を返す (Backlog 動作と整合性確認)', async ({ authedPage, apiBaseUrl }) => {
  // Backlog test では /api/tickets が動いてるのに profile が失敗する場合に切り分け用
  await authedPage.goto('/', { waitUntil: 'networkidle' });
  const result = await authedPage.evaluate(async (base: string) => {
    const fb = (window as unknown as { __belvedereFirebase?: { auth?: { currentUser?: { getIdToken: () => Promise<string> } } } }).__belvedereFirebase;
    const token = await fb?.auth?.currentUser?.getIdToken();
    if (!token) return { status: -1, body: 'no token' };
    const r = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.text() };
  }, apiBaseUrl);
  console.log('[debug] /api/me:', result.status, result.body.slice(0, 200));
  expect(result.status, `body=${result.body}`).toBe(200);
});

test('settings/profile で email/role/workspace 表示 + /api/me で owner role 確認', async ({ authedPage, apiBaseUrl }) => {
  const profile = new SettingsProfilePage(authedPage);
  await profile.open();

  // 取得失敗時はエラー文言が出るのでそれを先に確認 (debug 容易性)
  const errorVisible = await authedPage.getByText(/プロフィール取得失敗/).isVisible().catch(() => false);
  if (errorVisible) {
    const errorText = await authedPage.getByText(/プロフィール取得失敗/).textContent();
    throw new Error(`profile fetch failed in UI: ${errorText}`);
  }

  await expect(profile.roleBadge).toContainText('owner', { ignoreCase: true });
  // Workspace 管理 UI 追加でページに複数の 'ws-belvedere' テキストが存在するため
  // プロフィール節 (.value.readonly) に絞る。
  await expect(authedPage.locator('.value.readonly', { hasText: 'ws-belvedere' }).first()).toBeVisible();

  // /api/me を直接叩いて role を確認 (DEBUG セクション削除に伴い whoami UI から移行)
  const result = await authedPage.evaluate(async (base: string) => {
    const fb = (window as unknown as { __belvedereFirebase?: { auth?: { currentUser?: { getIdToken: () => Promise<string> } } } }).__belvedereFirebase;
    const token = await fb?.auth?.currentUser?.getIdToken();
    if (!token) return { status: -1, body: 'no token' };
    const r = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.text() };
  }, apiBaseUrl);
  expect(result.status, `body=${result.body}`).toBe(200);
  expect(result.body).toContain('"owner"');
});

test('右上 UserMenu ドロップダウンに owner バッジ + email 表示', async ({ authedPage }) => {
  await authedPage.goto('/', { waitUntil: 'networkidle' });

  await authedPage.locator('.avatar-btn').click();
  await expect(authedPage.locator('.dropdown')).toBeVisible({ timeout: 5_000 });
  await expect(authedPage.locator('.badge-role')).toContainText('owner', { ignoreCase: true });
  await expect(authedPage.locator('.badge-ws')).toContainText('ws-belvedere');

  await expect(authedPage.getByRole('button', { name: /アカウント設定/ })).toBeVisible();
});
