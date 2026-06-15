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
   *
   * pointer ベース実装 (usePointerReorder) では PointerEvent を使う。
   * 問題: Playwright の mouse.move() は viewport 内にクランプされる。
   * セクション (section-current) が viewport 外（スクロール上部）にある場合、
   * mouse.move(toX, toY) の toY が 0 にクランプされ、且つセクションが完全に
   * 上にスクロールされていると 0 もセクション内に入らず hoverSection が null になる。
   * 解決: page.evaluate で PointerEvent を直接 dispatch し viewport 制約を回避する。
   *   - pointerdown はハンドル要素に dispatch (scrollIntoViewIfNeeded 後に elementFromPoint で取得)
   *   - pointermove/pointerup は document に dispatch (clientX/Y はセクション実座標、viewport外でも可)
   * resolveAt は getBoundingClientRect と比較するため、viewport 外座標でも正しく検出できる。
   */
  async dragRowToSection(dragTitle: string, sectionTestId: 'section-current' | 'section-next' | 'section-backlog'): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const handle = dragRow.locator('.trow-drag-grab');
    const sectionEl = this.page.getByTestId(sectionTestId);

    // ハンドルを viewport に入れてから座標を取得
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await handle.boundingBox();
    // sectionBox はスクロール後でも取得 (viewport 外の負の Y になりうる)
    const sectionBox = await sectionEl.boundingBox();
    if (!handleBox || !sectionBox) {
      throw new Error('dragRowToSection: bounding box が取得できません');
    }

    const hX = handleBox.x + handleBox.width / 2;
    const hY = handleBox.y + handleBox.height / 2;
    const sX = sectionBox.x + sectionBox.width / 2;
    const sY = sectionBox.y + sectionBox.height / 2; // セクション中央 (viewport 外でも OK)

    await this.page.evaluate(({ hX, hY, sX, sY }) => {
      // 1. ハンドル要素に pointerdown を dispatch → onHandleDown → start()
      const handleEl = document.elementFromPoint(hX, hY) as HTMLElement | null;
      const dragHandle = handleEl?.closest('.trow-drag-grab') as HTMLElement | null;
      if (!dragHandle) return;
      dragHandle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: hX, clientY: hY, button: 0, buttons: 1,
      }));
      // 2. document に pointermove を dispatch (セクションの実座標、viewport 外でも受け取れる)
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, clientX: sX, clientY: sY, buttons: 1,
      }));
      // 3. document に pointerup を dispatch → onUp → commitReorder (moveToSection)
      document.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, clientX: sX, clientY: sY, button: 0,
      }));
    }, { hX, hY, sX, sY });
  }

  /** 指定区画内に指定タイトルの行が見えるか (クロス区画移動の検証用)。 */
  sectionRowByTitle(sectionTestId: 'section-current' | 'section-next' | 'section-backlog', title: string): Locator {
    return this.page.getByTestId(sectionTestId).getByTestId('live-ticket').filter({ hasText: title });
  }
}
