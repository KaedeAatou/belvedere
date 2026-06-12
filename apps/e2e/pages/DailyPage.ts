// Daily ボード (floor 02) 用 Page Object (Wave 3 / 2026-06-12)。
// data-testid は DailyScreen.vue の daily-col-{status} / daily-card-{id} に対応する。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DailyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Events タブ → Daily レール (floor 02) を開く。 */
  async open(): Promise<void> {
    await this.goto('/');
    await this.page.getByRole('button', { name: 'Events', exact: true }).click();
    await this.page.getByTestId('rail-daily').click();
    await expect(this.col('todo')).toBeVisible({ timeout: 15_000 });
  }

  /** 指定ステータス列のドロップゾーン (daily-col-{status})。 */
  col(status: 'todo' | 'in-progress' | 'review' | 'done'): Locator {
    return this.page.getByTestId(`daily-col-${status}`);
  }

  /** 指定 ID のカード (daily-card-{id})。 */
  card(id: string): Locator {
    return this.page.getByTestId(`daily-card-${id}`);
  }

  /**
   * カードを指定ステータス列へドラッグする。
   * DailyScreen の d&d は HTML5 DragEvent (dragstart → dragover → drop) 方式。
   * Playwright の dragTo が失敗する場合に備え dispatchEvent フォールバックを持つ。
   */
  async dragCardToCol(cardId: string, targetStatus: 'todo' | 'in-progress' | 'review' | 'done'): Promise<void> {
    const cardEl = this.card(cardId);
    const colEl = this.col(targetStatus);

    try {
      await cardEl.dragTo(colEl, { timeout: 5_000 });
    } catch {
      // フォールバック: HTML5 DragEvent を手動 dispatch
      const cardBox = await cardEl.boundingBox();
      const colBox = await colEl.boundingBox();
      if (!cardBox || !colBox) {
        throw new Error(`dragCardToCol: bounding box が取得できません (card=${cardId}, col=${targetStatus})`);
      }
      const fromX = cardBox.x + cardBox.width / 2;
      const fromY = cardBox.y + cardBox.height / 2;
      const toX = colBox.x + colBox.width / 2;
      const toY = colBox.y + colBox.height / 2;

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
}
