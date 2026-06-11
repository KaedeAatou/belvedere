// Retro 画面 (floor 05) 用 Page Object (2026-06-11)。
// KPT ボードのドラッグ操作 + Action items 積み上げ (retro-stack) をまとめる。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RetroPage extends BasePage {
  /** Action items 積み上げエリア */
  readonly stack: Locator;
  /** 積み上げ内の各アイテム */
  readonly stackItems: Locator;
  /** Try 列の draggable カード (inStack = false のもの含む全 Try カード) */
  readonly tryCards: Locator;

  constructor(page: Page) {
    super(page);
    this.stack = page.getByTestId('retro-stack');
    this.stackItems = page.getByTestId('retro-stack-item');
    // Try 列 draggable カード (RetroScreen では `c.key === 'try'` の retro-note に draggable クラスが付く)
    this.tryCards = page.locator('.retro-note.draggable');
  }

  /** Events タブ → Retro レール (floor 05) を開く。 */
  async open(): Promise<void> {
    await this.goto('/');
    await this.page.getByRole('button', { name: 'Events', exact: true }).click();
    await this.page.getByTestId('rail-retro').click();
    await expect(this.stack).toBeVisible({ timeout: 15_000 });
  }

  /** 積み上げの現在の件数 */
  async stackCount(): Promise<number> {
    return await this.stackItems.count();
  }

  /**
   * 指定テキストが積み上げに既に存在するか確認する。
   * (重複ガード: onStackDrop が stack.value.some(s => s.text === t.text) で弾く)
   */
  async isAlreadyStacked(text: string): Promise<boolean> {
    const count = await this.stackItems.filter({ hasText: text }).count();
    return count > 0;
  }

  /**
   * Try カードを積み上げエリアへドラッグする。
   * Playwright の dragTo は HTML5 d&d イベントを正しく発火しない場合があるため、
   * 失敗時のフォールバックとして dragstart / dragover / drop の dispatchEvent を使う。
   */
  async dragTryCardToStack(card: Locator): Promise<void> {
    // まず Playwright の dragTo を試みる
    try {
      await card.dragTo(this.stack, { timeout: 5_000 });
    } catch {
      // フォールバック: HTML5 DragEvent を手動 dispatch
      const cardBox = await card.boundingBox();
      const stackBox = await this.stack.boundingBox();
      if (!cardBox || !stackBox) {
        throw new Error('dragTryCardToStack: bounding box が取得できません');
      }
      const fromX = cardBox.x + cardBox.width / 2;
      const fromY = cardBox.y + cardBox.height / 2;
      const toX = stackBox.x + stackBox.width / 2;
      const toY = stackBox.y + stackBox.height / 2;

      await this.page.evaluate(
        ({ fromX, fromY, toX, toY }) => {
          const el = document.elementFromPoint(fromX, fromY) as HTMLElement | null;
          const target = document.elementFromPoint(toX, toY) as HTMLElement | null;
          if (!el || !target) return;

          const dt = new DataTransfer();
          el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          el.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        },
        { fromX, fromY, toX, toY },
      );
    }
  }

  /**
   * 積み上げに追加された最後のアイテムの削除ボタンをクリックして削除する。
   * クリーンアップ用: 追加に成功した場合は必ず呼んで元の件数に戻す。
   * @param text 削除対象テキスト (一致する最初のアイテムを削除)
   */
  async removeFromStack(text: string): Promise<void> {
    const item = this.stackItems.filter({ hasText: text }).first();
    await expect(item).toBeVisible({ timeout: 5_000 });
    await item.locator('.rm').click();
  }
}
