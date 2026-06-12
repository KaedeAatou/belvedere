// 見積もりポーカー + finding ピル e2e (T8 / 2026-06-11)。
// 主動線 = Refinement の「ポーカー開始」(T9) → DetailSheet の見積もりパネル (T7)。
// robot は owner なので privileged 操作 (開始/開示/採用) が可能。
//
// teardown 規律: 各テストで作成した [E2E] チケットは try/finally で必ず削除する。

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

  try {
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
  } finally {
    // DetailSheet が開いていればそこから削除、なければ Backlog から探して削除
    if (await sheet.sheet.isVisible()) {
      await sheet.deleteTwice();
      await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    } else {
      await backlog.open();
      if (await backlog.hasTicketWithTitle(title)) {
        await backlog.openTicketByTitle(title);
        if (await sheet.sheet.isVisible()) {
          await sheet.deleteTwice();
          await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
        }
      }
    }
  }
});

test('finding ピル: seed WC-108 に「種別なし」ピル (TYPE_MISSING / C案)', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();
  const badge = backlog.rowById('WC-108').getByTestId('finding-badge').filter({ hasText: '種別なし' });
  await expect(badge.first()).toBeVisible({ timeout: 15_000 });
});
