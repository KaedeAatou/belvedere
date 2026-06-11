// Retro 積み上げ e2e — Try カードを Action items にドラッグして積み上げ (2026-06-11)。
//
// 方針: **テキスト存在ベース** で assert する (件数ベースは使わない)。
//   - deploy-web / deploy-api の 2 つの workflow_run から e2e が並行起動し、同一
//     Workspace の積み上げを同時に触るため、件数の厳密比較 (+1 / 元に戻る) は破綻する
//   - 「dragged テキストのアイテムが存在する」→「全削除後に存在しない」だけを検証する
//   - 事前に同テキストの残骸 (過去の失敗 run の取り残し) を全削除する = 自己清掃
//
// dragTo フォールバック:
//   Playwright の dragTo が HTML5 d&d イベントを発火しない場合に備え、
//   RetroPage.dragTryCardToStack が dispatchEvent フォールバックを内包している。

import { test, expect } from '../fixtures/auth.fixture';
import { RetroPage } from '../pages/RetroPage';

test.describe('Retro 積み上げ', () => {
  test('retro-stack 表示 assert', async ({ authedPage }) => {
    const retro = new RetroPage(authedPage);
    await retro.open();
    await expect(retro.stack).toBeVisible();
  });

  test('Try カードを積み上げにドラッグ → 追加確認 → .rm で削除 → 消えること', async ({ authedPage }) => {
    const retro = new RetroPage(authedPage);
    await retro.open();

    // Try 列に draggable カードが無い場合は skip
    const tryCount = await retro.tryCards.count();
    if (tryCount === 0) {
      test.skip(true, 'Try 列に draggable カードが存在しない — skip');
      return;
    }

    const card = retro.tryCards.first();
    const cardText = (await card.locator('.text').first().textContent())?.trim() ?? '';
    if (!cardText) {
      test.skip(true, 'Try カードのテキストが空 — skip');
      return;
    }

    // ---- 事前清掃: 過去 run の残骸 (同テキスト) を全削除して開始状態を揃える ----
    await retro.removeAllFromStack(cardText);

    // ---- ドラッグ → 同テキストのアイテムが出現すること ----
    await retro.dragTryCardToStack(card);
    await expect
      .poll(async () => retro.stackItems.filter({ hasText: cardText }).count(), {
        timeout: 10_000,
        intervals: [500, 500, 1000],
      })
      .toBeGreaterThan(0);

    // ---- クリーンアップ: 全削除して消えること (後続 run に残骸を残さない) ----
    await retro.removeAllFromStack(cardText);
    await expect
      .poll(async () => retro.stackItems.filter({ hasText: cardText }).count(), {
        timeout: 10_000,
        intervals: [500, 500, 1000],
      })
      .toBe(0);
  });
});
