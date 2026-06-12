// Daily ボード 回帰 e2e (Wave 3 / 2026-06-12)。
// チケット消失バグ b9de315 のガード: ドラッグ後にカードが消えないことを確認する。
//
// 方針:
//   - 件数ベース assert 禁止 (並行 2 run が同一 Workspace を共有するため)
//   - 作成したチケットは必ず try/finally で削除する (自己清掃)
//   - dragTo フォールバックは DailyPage.dragCardToCol が内包している

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';
import { DailyPage } from '../pages/DailyPage';

test.describe('Daily ボード', () => {
  test('Daily カード d&d: TODO → DOING でカードが消えないこと (b9de315 回帰ガード)', async ({ authedPage }) => {
    const backlog = new BacklogPage(authedPage);
    const sheet = new DetailSheetPage(authedPage);
    const daily = new DailyPage(authedPage);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `[E2E] daily-move-${suffix}`;
    let ticketId = '';

    // === step 1: Backlog でチケット作成 ===
    await backlog.open();
    await backlog.createTicket({ title, type: 'task' });
    await expect
      .poll(() => backlog.hasTicketWithTitle(title), { timeout: 10_000 })
      .toBe(true);

    try {
      // === step 2: DetailSheet でスプリント + status を設定 ===
      await backlog.openTicketByTitle(title);
      await expect(sheet.sheet).toBeVisible({ timeout: 10_000 });
      ticketId = await sheet.getTicketId();

      // sprint を active sprint へ移動 + status を todo に
      await sheet.editBtn.click();
      await expect(authedPage.getByTestId('sheet-edit-sprint')).toBeVisible({ timeout: 5_000 });
      // Sprint セレクトに選択肢が少なくとも 1 件あれば先頭を選ぶ
      const sprintSelect = authedPage.getByTestId('sheet-edit-sprint');
      const options = sprintSelect.locator('option');
      const optCount = await options.count();
      if (optCount > 0) {
        const firstValue = await options.first().getAttribute('value');
        if (firstValue) await sprintSelect.selectOption(firstValue);
      }
      // status を todo に設定
      await authedPage.getByTestId('sheet-edit-status').selectOption('todo');
      await sheet.saveBtn.click();
      await expect(sheet.sheet).toBeVisible({ timeout: 10_000 });

      // === step 3: Daily へ遷移 → TODO 列にカードが見えること ===
      // シートを閉じてから Daily を開く
      await authedPage.keyboard.press('Escape');
      await sheet.sheet.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);

      await daily.open();

      // daily-card-{id} が TODO 列に存在すること
      const cardLocator = daily.card(ticketId);
      await expect
        .poll(async () => {
          const box = await cardLocator.boundingBox();
          return box !== null;
        }, { timeout: 15_000, intervals: [500, 500, 1000] })
        .toBe(true);

      // === step 4: DOING 列へ d&d → カードが消えないこと (バグ回帰ガード) ===
      await daily.dragCardToCol(ticketId, 'in-progress');

      // poll で in-progress 列にカードが存在し続けることを確認
      await expect
        .poll(
          async () => {
            const col = daily.col('in-progress');
            const card = col.getByTestId(`daily-card-${ticketId}`);
            return await card.count();
          },
          { timeout: 10_000, intervals: [500, 500, 1000] },
        )
        .toBeGreaterThan(0);
    } finally {
      // === step 5: 終了処理 — DetailSheet から削除 ===
      // Backlog に戻ってチケットを開いて削除
      await backlog.open();
      // タイトルで探す (ID で探す手段が現在の BacklogPage にないため)
      if (await backlog.hasTicketWithTitle(title)) {
        await backlog.openTicketByTitle(title);
        if (await sheet.sheet.isVisible()) {
          await sheet.deleteTwice();
          await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
          // 削除後にリストから消えていること
          await expect
            .poll(() => backlog.hasTicketWithTitle(title), { timeout: 10_000 })
            .toBe(false);
        }
      }
    }
  });
});
