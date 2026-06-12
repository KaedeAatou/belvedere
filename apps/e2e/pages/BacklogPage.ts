// Backlog 画面 (/ home) 用 Page Object (Stage 2 / 2026-06-11)。
// data-testid セレクタを優先 (画面構造変更に強い)。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class BacklogPage extends BasePage {
  readonly newTicketBtn: Locator;
  readonly createDialog: Locator;
  readonly newTicketTitle: Locator;
  readonly newTicketType: Locator;
  readonly newTicketPriority: Locator;
  readonly submitCreate: Locator;
  readonly liveSection: Locator;
  readonly liveTickets: Locator;
  readonly createError: Locator;

  constructor(page: Page) {
    super(page);
    this.newTicketBtn = page.getByTestId('new-ticket-btn');
    this.createDialog = page.getByTestId('create-dialog');
    this.newTicketTitle = page.getByTestId('new-ticket-title');
    this.newTicketType = page.getByTestId('new-ticket-type');
    this.newTicketPriority = page.getByTestId('new-ticket-priority');
    this.submitCreate = page.getByTestId('submit-create');
    this.liveSection = page.getByTestId('live-section');
    this.liveTickets = page.getByTestId('live-ticket');
    this.createError = page.getByTestId('create-error');
  }

  /**
   * Belvedere の "/" は Backlog 画面 (index.vue 経由)。
   * 初期 screen は backlog なので、navigation 直後に Live セクションが表示される想定。
   */
  async open(): Promise<void> {
    await this.goto('/');
    await expect(this.liveSection).toBeVisible({ timeout: 15_000 });
  }

  /** 現在の Live セクションのチケット件数 (一覧の <li> 数) */
  async liveCount(): Promise<number> {
    return await this.liveTickets.count();
  }

  /**
   * 新規作成ダイアログを開く → 入力 → 「作成」押下。
   * 成功時はダイアログが閉じ、Live セクションに新規行が追加される。
   */
  async createTicket(opts: {
    title: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    type?: 'story' | 'task' | 'spike' | 'bug' | 'incident';
  }): Promise<void> {
    await this.newTicketBtn.click();
    await expect(this.createDialog).toBeVisible();
    await this.newTicketTitle.fill(opts.title);
    if (opts.type) {
      await this.newTicketType.selectOption(opts.type);
    }
    if (opts.priority) {
      await this.newTicketPriority.selectOption(opts.priority);
    }
    await this.submitCreate.click();
    // 成功時はダイアログが消えて Live に反映される
    await expect(this.createDialog).toBeHidden({ timeout: 10_000 });
  }

  /** Live セクション内に指定タイトルのチケットが見えるか */
  async hasTicketWithTitle(title: string): Promise<boolean> {
    const matches = await this.page.getByTestId('live-ticket').filter({ hasText: title }).count();
    return matches > 0;
  }

  /** 指定タイトルのチケット行をクリックして DetailSheet を開く。 */
  async openTicketByTitle(title: string): Promise<void> {
    await this.liveTickets.filter({ hasText: title }).first().click();
  }

  /** 指定 ID の行 (finding ピル等の assert 用)。 */
  rowById(id: string): Locator {
    return this.page.locator('.trow').filter({ hasText: id });
  }

  /** バックログセクション内の指定タイトルの行 (並び替え用)。 */
  backlogRowByTitle(title: string): Locator {
    return this.page.getByTestId('live-ticket').filter({ hasText: title });
  }

  /**
   * バックログセクション内のすべての live-ticket タイトル文字列を順番に返す。
   * 並び替え後の DOM 順序確認に使う。
   */
  async backlogTitles(): Promise<string[]> {
    return await this.liveTickets.allTextContents();
  }

  /**
   * ハンドル限定 d&d でバックログ行を並び替える。
   * TicketRow の `reorderable` フラグは mousedown で dragArmed = true になるため、
   * まず handle に mousedown を送り、dragTo で row target の上端にドロップする。
   * dragTo が失敗する場合は dispatchEvent フォールバックを使う。
   */
  async reorderDragBefore(dragTitle: string, targetTitle: string): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const targetRow = this.backlogRowByTitle(targetTitle);
    const handle = dragRow.locator('.trow-drag-grab');

    // handle mousedown で dragArmed = true にする
    await handle.hover();
    await this.page.mouse.down();

    try {
      // target 行の上端 (before) にドロップ
      const targetBox = await targetRow.boundingBox();
      if (!targetBox) throw new Error('reorderDragBefore: target bounding box が取得できません');
      await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 2, { steps: 10 });
      await this.page.mouse.up();
    } catch {
      // フォールバック: dispatchEvent で HTML5 d&d
      await this.page.mouse.up(); // mousedown を解放
      const handleBox = await handle.boundingBox();
      const targetBox = await targetRow.boundingBox();
      if (!handleBox || !targetBox) {
        throw new Error('reorderDragBefore: bounding box が取得できません');
      }
      const fromX = handleBox.x + handleBox.width / 2;
      const fromY = handleBox.y + handleBox.height / 2;
      const toX = targetBox.x + targetBox.width / 2;
      const toY = targetBox.y + 2; // 上端

      await this.page.evaluate(
        ({ fromX, fromY, toX, toY }) => {
          const el = document.elementFromPoint(fromX, fromY) as HTMLElement | null;
          const target = document.elementFromPoint(toX, toY) as HTMLElement | null;
          if (!el || !target) return;
          const dt = new DataTransfer();
          // mousedown で armDrag → dragstart が有効になるよう mousedown を送る
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
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
