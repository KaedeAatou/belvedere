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

    // 2–4. dispatchEvent で HTML5 DragEvent シーケンスを .trow 要素に送る。
    // **`drop` はあえて発火しない**。実ブラウザはネストした draggable で native drop を
    // 高頻度に取りこぼすため、本番は確定を `dragend` に寄せている。テストも drop を撃たず
    // dragstart → dragover → dragend だけにして、本番と同じ「drop 無しで確定」経路を検証する。
    // (drop を撃つと本番が drop 依存に退行しても気づけない盲点になる)
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

  /**
   * クロス区画 d&d: 指定タイトルの行を別区画 (section-current / section-next / section-backlog)
   * へドラッグして落とす。SprintSectionedList の onSectionDragOver / onSectionDrop 経路を検証する。
   *
   * reorderDragBefore と同じ dispatchEvent 方式 (Playwright の mouse 移動では HTML5
   * DragEvent が発火しないため)。ドロップは区画 div 本体に対して行う — 行に落とす経路
   * (onReorderDrop の across 分岐) と異なり、区画が空でも成立する。
   */
  async dragRowToSection(dragTitle: string, sectionTestId: 'section-current' | 'section-next' | 'section-backlog'): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle);
    const handle = dragRow.locator('.trow-drag-grab');

    // handle に mouse.down で fromHandle = true (armDrag)
    await handle.hover();
    await this.page.mouse.down();

    const handleBox = await handle.boundingBox();
    if (!handleBox) {
      await this.page.mouse.up();
      throw new Error('dragRowToSection: handle の bounding box が取得できません');
    }

    await this.page.evaluate(
      ({ handleX, handleY, sectionTestId }) => {
        const handleEl = document.elementFromPoint(handleX, handleY) as HTMLElement | null;
        const dragRowEl = handleEl?.closest('[data-testid="live-ticket"]') as HTMLElement | null;
        const sectionEl = document.querySelector(`[data-testid="${sectionTestId}"]`) as HTMLElement | null;
        if (!dragRowEl || !sectionEl) return;

        const rect = sectionEl.getBoundingClientRect();
        // 区画ヘッダ付近 (上端 + 8px) に落とす — 行の上ではなく区画 div 本体の drop を踏む。
        const clientX = rect.x + rect.width / 2;
        const clientY = rect.y + 8;

        const dt = new DataTransfer();
        // drop は撃たない (本番が dragend 確定。実ブラウザの drop 取りこぼしを再現)。
        dragRowEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        sectionEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt }));
        dragRowEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      {
        handleX: handleBox.x + handleBox.width / 2,
        handleY: handleBox.y + handleBox.height / 2,
        sectionTestId,
      },
    );

    await this.page.mouse.up();
  }

  /** 指定区画内に指定タイトルの行が見えるか (クロス区画移動の検証用)。 */
  sectionRowByTitle(sectionTestId: 'section-current' | 'section-next' | 'section-backlog', title: string): Locator {
    return this.page.getByTestId(sectionTestId).getByTestId('live-ticket').filter({ hasText: title });
  }
}
