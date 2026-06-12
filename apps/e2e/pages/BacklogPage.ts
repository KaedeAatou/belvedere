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
   *
   * Playwright の mouse.down → move → up では HTML5 の dragstart/dragover/drop イベントが
   * 発火しない (ブラウザ制約)。BacklogScreen は dragover/drop を `.trow` 要素で受け、
   * evt.clientY で before/after を判定するため、dispatchEvent で直接 DragEvent を送る。
   *
   * 手順:
   *   1. handle に mouse.down — TicketRow の armDrag() を呼んで dragArmed = true にする
   *   2. ドラッグ行 (.trow) に dragstart を dispatch — reorderStart emit
   *   3. ターゲット行 (.trow) に dragover を dispatch (clientY = target 上端 + 2px → before 判定)
   *   4. ターゲット行 (.trow) に drop を dispatch (同じ clientY)
   *   5. ドラッグ行 (.trow) に dragend を dispatch — reorderEnd emit
   *   6. mouse.up でポインタ解放
   */
  async reorderDragBefore(dragTitle: string, targetTitle: string): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const targetRow = this.backlogRowByTitle(targetTitle);
    const handle = dragRow.locator('.trow-drag-grab');

    // 1. handle に mouse.down で dragArmed = true (armDrag)
    await handle.hover();
    await this.page.mouse.down();

    // bounding box を取得 (mouse.down 後でも安全に取得可能)
    const handleBox = await handle.boundingBox();
    const targetBox = await targetRow.boundingBox();
    if (!handleBox || !targetBox) {
      await this.page.mouse.up();
      throw new Error('reorderDragBefore: bounding box が取得できません');
    }

    // ターゲット行の上端 + 2px → BacklogScreen の onReorderOver が 'before' と判定する
    const toClientY = targetBox.y + 2;

    // 2–5. dispatchEvent で HTML5 DragEvent シーケンスを .trow 要素に送る
    // .trow は data-testid="live-ticket" と同一要素。
    // dragstart/dragover/drop のリスナは BacklogScreen → TicketRow の @dragstart/@dragover/@drop に付く。
    // dragover の clientY が行の getBoundingClientRect().top から上半分かどうかで before/after 判定。
    await this.page.evaluate(
      ({ handleX, handleY, toClientY }) => {
        // handle 上の任意の点から最も近い .trow 祖先を取る
        const handleEl = document.elementFromPoint(handleX, handleY) as HTMLElement | null;
        const dragRowEl = handleEl?.closest('[data-testid="live-ticket"]') as HTMLElement | null;
        if (!dragRowEl) return;

        // target 行: toClientY の座標にある live-ticket 要素
        const targetEl = document.elementFromPoint(handleX, toClientY) as HTMLElement | null;
        const targetRowEl = targetEl?.closest('[data-testid="live-ticket"]') as HTMLElement | null;
        if (!targetRowEl || targetRowEl === dragRowEl) return;

        const dt = new DataTransfer();
        dragRowEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        targetRowEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: toClientY, dataTransfer: dt }));
        targetRowEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: toClientY, dataTransfer: dt }));
        dragRowEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      {
        handleX: handleBox.x + handleBox.width / 2,
        handleY: handleBox.y + handleBox.height / 2,
        toClientY,
      },
    );

    // 6. ポインタ解放
    await this.page.mouse.up();
  }
}
