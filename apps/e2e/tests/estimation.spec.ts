// 見積もりポーカー + finding ピル e2e (T8 / 2026-06-11)。
// 主動線 = Refinement の「ポーカー開始」(T9) → DetailSheet の見積もりパネル (T7)。
// robot は owner なので privileged 操作 (開始/開示/採用) が可能。

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { RefinementPage } from '../pages/RefinementPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';

test('ポーカー happy path: SP無し story 作成 → Refinement で開始 → vote → reveal → adopt', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  const refine = new RefinementPage(authedPage);
  const sheet = new DetailSheetPage(authedPage);

  await backlog.open();
  const title = `[E2E] ポーカー ${Date.now()}`;
  // 種別 story / SP は入力しない → STORY_SP_MISSING になる
  await backlog.createTicket({ title, type: 'story' });

  // Refinement → 「SP未見積もり」グループにこのストーリーが現れる
  await refine.open();
  await expect(refine.row(title).first()).toBeVisible({ timeout: 15_000 });

  // ポーカー開始 → DetailSheet が voting 状態で開く
  await refine.startPoker(title);
  await expect(sheet.estimationPanel).toBeVisible({ timeout: 15_000 });
  await expect(sheet.estVote(5)).toBeVisible();

  // 投票 → 開示 → 採用
  await sheet.estVote(5).click();
  await sheet.estReveal().click();
  await sheet.estAdopt(5).click();

  // 採用済 (SP 5) を assert
  await expect(sheet.estimationPanel).toContainText('採用済');
  await expect(sheet.estimationPanel).toContainText('5');
});

test('finding ピル: seed WC-108 に「種別なし」ピル (TYPE_MISSING / C案)', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();
  const badge = backlog.rowById('WC-108').getByTestId('finding-badge').filter({ hasText: '種別なし' });
  await expect(badge.first()).toBeVisible({ timeout: 15_000 });
});
