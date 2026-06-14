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
   *
   * 3 区画モデル (2026-06-13) で Backlog の起票種別は story / incident / bug に限定された
   * (task/spike は Planning の分割でのみ生成)。種別により入力欄が変わる:
   *   - story: 「誰が / 何をしたい / なぜ」の 3 欄 (title は asA+iWant から自動生成)。
   *            opts.title は iWant に入れるので、生成 title に部分一致で含まれる。
   *   - それ以外 (incident / bug): 従来どおり単一 title。
   * 種別で描画が切り替わるため、title 入力より先に種別を選択する。既定は bug (直接 title 入力可)。
   */
  async createTicket(opts: {
    title: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    type?: 'story' | 'task' | 'spike' | 'bug' | 'incident';
  }): Promise<void> {
    await this.newTicketBtn.click();
    await expect(this.createDialog).toBeVisible();
    const type = opts.type ?? 'bug';
    await this.newTicketType.selectOption(type);
    if (type === 'story') {
      await this.page.getByTestId('us-asa').fill('E2E 運営担当者');
      await this.page.getByTestId('us-iwant').fill(opts.title);
      await this.page.getByTestId('us-sothat').fill('E2E 検証で品質チェックを通すため');
    } else {
      await this.newTicketTitle.fill(opts.title);
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
   * pointer ベース実装 (usePointerReorder) に変わったため、Playwright 実マウス
   * (mouse.down → move → up) で直接テストできる。合成 DragEvent は不要。
   * pointerdown がハンドル要素に当たれば handleDown emit → usePointerReorder.start が走る。
   */
  async reorderDragBefore(dragTitle: string, targetTitle: string): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const targetRow = this.backlogRowByTitle(targetTitle);
    const handle = dragRow.locator('.trow-drag-grab');

    const handleBox = await handle.boundingBox();
    const targetBox = await targetRow.boundingBox();
    if (!handleBox || !targetBox) {
      throw new Error('reorderDragBefore: bounding box が取得できません');
    }

    const fromX = handleBox.x + handleBox.width / 2;
    const fromY = handleBox.y + handleBox.height / 2;
    // ターゲット行の上端 + 2px → usePointerReorder の resolveAt が 'before' と判定する
    const toX = targetBox.x + targetBox.width / 2;
    const toClientY = targetBox.y + 2;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    // 数ステップ移動してから pointerup (ブラウザがドラッグと認識するために最低限の移動が必要)
    await this.page.mouse.move(fromX, fromY + 5);
    await this.page.mouse.move(toX, toClientY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * クロス区画 d&d: 指定タイトルの行を別区画へドラッグして落とす。
   * pointer ベース実装 (usePointerReorder) に変わったため実マウスで直接テストできる。
   * ドロップ先は区画の中央付近 (既存行がない場所でも区画に data-section があるので OK)。
   */
  async dragRowToSection(dragTitle: string, sectionTestId: 'section-current' | 'section-next' | 'section-backlog'): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const handle = dragRow.locator('.trow-drag-grab');
    const sectionEl = this.page.getByTestId(sectionTestId);

    const handleBox = await handle.boundingBox();
    const sectionBox = await sectionEl.boundingBox();
    if (!handleBox || !sectionBox) {
      throw new Error('dragRowToSection: bounding box が取得できません');
    }

    const fromX = handleBox.x + handleBox.width / 2;
    const fromY = handleBox.y + handleBox.height / 2;
    const toX = sectionBox.x + sectionBox.width / 2;
    const toY = sectionBox.y + 12; // 区画ヘッダ下付近

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    await this.page.mouse.move(fromX, fromY + 5);
    await this.page.mouse.move(toX, toY, { steps: 15 });
    await this.page.mouse.up();
  }

  /** 指定区画内に指定タイトルの行が見えるか (クロス区画移動の検証用)。 */
  sectionRowByTitle(sectionTestId: 'section-current' | 'section-next' | 'section-backlog', title: string): Locator {
    return this.page.getByTestId(sectionTestId).getByTestId('live-ticket').filter({ hasText: title });
  }
}
