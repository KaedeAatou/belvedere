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
    // 積み上げは onMounted の fetch で非同期に埋まる。コンテナ表示だけでは
    // 「読込前の 0 件」を初期値と誤認するため、アイテムか空状態のどちらかが
    // 出るまで待って「読込完了」を保証する。
    await expect(this.stackItems.first().or(this.page.locator('.stack-empty'))).toBeVisible({ timeout: 15_000 });
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
   * Try カードを積み上げエリアへ実マウスでドラッグする (合成イベント禁止)。
   *
   * d&d は vue-draggable-plus (SortableJS) の clone group。Try 列 (pull:'clone') から
   * 積み上げ (.stack-list / put:true) へカーソルが「侵入」する過程の mousemove で検知される
   * ため、合成 DragEvent では駆動できない。ドラッグは handle=".retro-drag-grab" (「積み上げへ」
   * ヒント) 限定なので、ノート本体ではなくハンドルを掴み、多ステップで .stack-list へ落とす。
   * (BacklogPage.dragRowToSection / DailyPage.dragCardToCol と同じ実マウス方式。)
   */
  async dragTryCardToStack(card: Locator): Promise<void> {
    const handle = card.locator('.retro-drag-grab');
    const listEl = this.page.locator('.stack-list');

    await handle.scrollIntoViewIfNeeded();
    const hb = await handle.boundingBox();
    await listEl.scrollIntoViewIfNeeded();
    const lb = await listEl.boundingBox();
    if (!hb || !lb) {
      throw new Error('dragTryCardToStack: bounding box が取得できません');
    }
    const fx = hb.x + hb.width / 2;
    const fy = hb.y + hb.height / 2;
    const tx = lb.x + lb.width / 2;
    const ty = lb.y + Math.max(8, lb.height - 8); // 積み上げリスト内側下部 (アイテム末尾 or 空ゾーン)

    await this.page.mouse.move(fx, fy);
    await this.page.mouse.down();
    await this.page.mouse.move(fx, fy + 8, { steps: 4 }); // 動かし始め (drag 起動)
    await this.page.mouse.move(tx, ty, { steps: 35 });    // 積み上げへ侵入 (多ステップで検知させる)
    await this.page.mouse.move(tx, ty, { steps: 5 });     // 着地を安定
    await this.page.mouse.up();
  }

  /**
   * 指定テキストに一致する積み上げアイテムを全件削除する。
   * クリーンアップ + 過去の失敗 run が残した残骸の自己清掃を兼ねる。
   * 0 件なら何もしない (並行 run が先に消した場合も許容)。
   */
  async removeAllFromStack(text: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      const items = this.stackItems.filter({ hasText: text });
      const n = await items.count();
      if (n === 0) return;
      await items.first().locator('.rm').click();
      // DELETE → refetch の反映で件数が減るまで待つ
      await expect.poll(async () => items.count(), { timeout: 8_000 }).toBeLessThan(n);
    }
  }
}
