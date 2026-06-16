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
   * カードを指定ステータス列へ実マウスでドラッグする (合成イベント禁止)。
   *
   * DailyScreen の d&d は SortableJS (vue-draggable-plus / forceFallback)。リスト間移動は
   * カーソルが移動先列へ「侵入」する過程の mousemove で検知されるため、合成 DragEvent では
   * 駆動できない。ドラッグは handle=".daily-grab" 限定なので、カード本体ではなくハンドルを掴み、
   * Playwright 実マウスで多ステップ移動して移動先列 (data-status=列) の内側下部へ落とす。
   * (BacklogPage.dragRowToSection と同じ実マウス方式。)
   */
  async dragCardToCol(cardId: string, targetStatus: 'todo' | 'in-progress' | 'review' | 'done'): Promise<void> {
    const handle = this.card(cardId).locator('.daily-grab');
    const colEl = this.col(targetStatus);

    await handle.scrollIntoViewIfNeeded();
    const hb = await handle.boundingBox();
    await colEl.scrollIntoViewIfNeeded();
    const lb = await colEl.boundingBox();
    if (!hb || !lb) {
      throw new Error(`dragCardToCol: bounding box が取得できません (card=${cardId}, col=${targetStatus})`);
    }
    const fx = hb.x + hb.width / 2;
    const fy = hb.y + hb.height / 2;
    const tx = lb.x + lb.width / 2;
    const ty = lb.y + Math.max(8, lb.height - 8); // 列の内側下部 (カード末尾 or 空ゾーン)

    await this.page.mouse.move(fx, fy);
    await this.page.mouse.down();
    await this.page.mouse.move(fx, fy + 8, { steps: 4 }); // 動かし始め (drag 起動)
    await this.page.mouse.move(tx, ty, { steps: 35 });    // 移動先列へ侵入 (多ステップで検知させる)
    await this.page.mouse.move(tx, ty, { steps: 5 });     // 着地を安定
    await this.page.mouse.up();
  }
}
