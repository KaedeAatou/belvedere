// Retro 積み上げ e2e — Try カードを Action items にドラッグして積み上げ (2026-06-11)。
//
// 方針: 自己クリーンアップ。追加に成功したアイテムは必ず .rm クリックで削除し、
// 後続 run に影響を残さない。
//
// skip 条件:
//   - Try 列の draggable カードが 0 件 (KPT データなし)
//   - ドラッグ対象テキストが既に積み上げに存在する (重複ガードで増えないため flaky 回避)
//     → この場合は「増えないこと」を assert してパスする
//
// dragTo フォールバック:
//   Playwright の dragTo が HTML5 d&d イベントを発火しない場合に備え、
//   RetroPage.dragTryCardToStack が dispatchEvent フォールバックを内包している。
//   Vue の @dragover.prevent / @drop ハンドラを経由するため
//   dragover (cancelable=true) で preventDefault が呼ばれ drop が発火する。

import { test, expect } from '../fixtures/auth.fixture';
import { RetroPage } from '../pages/RetroPage';

test.describe('Retro 積み上げ', () => {
  test('retro-stack 表示 assert', async ({ authedPage }) => {
    const retro = new RetroPage(authedPage);
    await retro.open();
    await expect(retro.stack).toBeVisible();
  });

  test('Try カードを積み上げにドラッグ → +1 確認 → .rm で削除 → 元の件数に戻ること', async ({ authedPage }) => {
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

    // 重複チェック: 既に同テキストが積み上げに存在する場合は「増えないこと」を assert して終了
    const alreadyStacked = await retro.isAlreadyStacked(cardText);
    if (alreadyStacked) {
      const before = await retro.stackCount();
      await retro.dragTryCardToStack(card);
      // onStackDrop の重複ガードにより件数が変化しないこと
      await authedPage.waitForTimeout(1200); // Vue の async 処理を待つ
      const after = await retro.stackCount();
      expect(after, '重複ガードが機能せず件数が増えた').toBe(before);
      return;
    }

    // ---- 通常フロー: ドラッグ → +1 → クリーンアップ ----
    const beforeCount = await retro.stackCount();

    await retro.dragTryCardToStack(card);

    // Vue の Firestore 書き込み + useRetroTries の反映を待つ
    await expect
      .poll(async () => retro.stackCount(), { timeout: 10_000, intervals: [500, 500, 1000] })
      .toBeGreaterThan(beforeCount);

    const afterAddCount = await retro.stackCount();
    expect(afterAddCount).toBe(beforeCount + 1);

    // 追加されたアイテムに Try と同じテキストが含まれること
    const added = retro.stackItems.filter({ hasText: cardText }).first();
    await expect(added).toBeVisible({ timeout: 5_000 });
    await expect(added).toContainText(cardText);

    // ===== クリーンアップ: .rm で削除 =====
    // 追加に成功した場合は必ず削除して件数を元に戻す
    await retro.removeFromStack(cardText);

    await expect
      .poll(async () => retro.stackCount(), { timeout: 10_000, intervals: [500, 500, 1000] })
      .toBe(beforeCount);
  });
});
