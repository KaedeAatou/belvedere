// Backlog 画面 e2e (Stage 2 / 2026-06-11)。
// Phase 1-C で実装した「Live (実 API)」セクション + 新規作成ダイアログを検証。
//
// 失敗時は auto-ticket で Belvedere 自身にチケット起票 → ドッグフード閉ループ。

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';

test('Backlog の Live セクションが表示される', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();
  await expect(backlog.liveSection).toBeVisible();
});

test('新規チケット作成 → ダイアログ → 作成 → Live セクションに反映', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();

  const before = await backlog.liveCount();
  const uniqueTitle = `[E2E] テストチケット ${Date.now()}`;

  await backlog.createTicket({ title: uniqueTitle, priority: 'high' });

  // Live セクションに新規行が増える
  await expect.poll(async () => backlog.liveCount(), { timeout: 10_000 }).toBeGreaterThan(before);
  expect(await backlog.hasTicketWithTitle(uniqueTitle)).toBe(true);
});

test('空タイトルで作成 → エラー表示でダイアログ閉じない', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();

  await backlog.newTicketBtn.click();
  await expect(backlog.createDialog).toBeVisible();

  // タイトル空のまま作成押下
  await backlog.submitCreate.click();

  // エラー表示 (UI 側 validation でダイアログ開いたまま)
  await expect(backlog.createError).toBeVisible();
  await expect(backlog.createDialog).toBeVisible();
});
