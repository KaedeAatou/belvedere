// Backlog 画面 (/ home) 用 Page Object (Stage 2 / 2026-06-11)。
// data-testid セレクタを優先 (画面構造変更に強い)。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class BacklogPage extends BasePage {
  readonly newTicketBtn: Locator;
  readonly createDialog: Locator;
  readonly newTicketTitle: Locator;
  readonly newTicketType: Locator;
  readonly newTicketEpic: Locator;
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
    this.newTicketEpic = page.getByTestId('us-epic');
    this.newTicketPriority = page.getByTestId('new-ticket-priority');
    this.submitCreate = page.getByTestId('submit-create');
    this.liveSection = page.getByTestId('live-section');
    this.liveTickets = page.getByTestId('live-ticket');
    this.createError = page.getByTestId('create-error');
  }

  /**
   * Belvedere の "/" は初期表示が Events home (2026-07-07〜: ログイン直後は概要ホームを見せる方針)。
   * Backlog タブへ明示的に切り替えてから Live セクションの表示を待つ。
   */
  async open(): Promise<void> {
    await this.goto('/');
    await this.page.getByRole('button', { name: 'Backlog', exact: true }).click();
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
    /** story 作成時の親 Epic id (案A: story は親 Epic 必須)。実在 Epic (例 EP-1) を渡す。 */
    epic?: string;
  }): Promise<void> {
    await this.newTicketBtn.click();
    await expect(this.createDialog).toBeVisible();
    const type = opts.type ?? 'bug';
    await this.newTicketType.selectOption(type);
    if (type === 'story') {
      await this.page.getByTestId('us-asa').fill('E2E 運営担当者');
      await this.page.getByTestId('us-iwant').fill(opts.title);
      await this.page.getByTestId('us-sothat').fill('E2E 検証で品質チェックを通すため');
      // story は親 Epic 必須 (案A)。指定があれば選ぶ。
      if (opts.epic) await this.newTicketEpic.selectOption(opts.epic);
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
   * ハンドル限定 d&d でバックログ行を実マウスで並び替える (合成イベント禁止)。
   *
   * vue-draggable-plus (SortableJS / force-fallback) の実ドラッグを **本物の trusted PointerEvent**
   * で踏む。Playwright 実マウス (mouse.down → move → up) は handle 掴み → fallback ドラッグ →
   * onDragEnd → reorderTickets(区画密再採番) の全経路を駆動するため、capture 欠如や native
   * テキスト選択への遷移といった「実機でしか出ないバグ」を CI で捕捉できる
   * (合成 PointerEvent dispatch ではこの経路を踏めず緑になり、過去のデグレを隠していた)。
   */
  async reorderDragBefore(dragTitle: string, targetTitle: string): Promise<void> {
    const dragRow = this.backlogRowByTitle(dragTitle).first();
    const targetRow = this.backlogRowByTitle(targetTitle).first();
    const handle = dragRow.locator('.trow-drag-grab');

    // 行が折り畳み/スクロール外でも掴めるよう、まず両行を viewport 内へ。
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await handle.boundingBox();
    await targetRow.scrollIntoViewIfNeeded();
    const targetBox = await targetRow.boundingBox();
    if (!handleBox || !targetBox) {
      throw new Error('reorderDragBefore: bounding box が取得できません');
    }

    const fromX = handleBox.x + handleBox.width / 2;
    const fromY = handleBox.y + handleBox.height / 2;
    // ターゲット行の上端 + 2px → SortableJS が drop 位置を 'before' (ターゲットの上) と判定する
    const toX = targetBox.x + targetBox.width / 2;
    const toClientY = targetBox.y + 2;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    // まず 6px 動かして DRAG_THRESHOLD(4px) を越えさせ start を本ドラッグへ昇格させる。
    await this.page.mouse.move(fromX, fromY + 6);
    // steps を刻んで onMove の連続追跡 (hoverSection / dropEdge 遷移) を本物で踏ませる。
    await this.page.mouse.move(toX, toClientY, { steps: 12 });
    await this.page.mouse.up();
  }

  /**
   * クロス区画 d&d: 指定タイトルの行のハンドルを別区画 (dnd-list) へ実マウスでドラッグして落とす。
   *
   * d&d は SortableJS (vue-draggable-plus / forceFallback)。SortableJS のリスト間移動は
   * カーソルが移動先リストへ「侵入」する過程の mousemove で検知されるため、合成 dispatch では
   * 駆動できない (合成は v-model を破壊し重複を生む)。Playwright 実マウスで多ステップ移動し、
   * 移動先 dnd-list (data-section=区画) の内側下部へ落とす (空区画/最下段でも確実に入る)。
   * 前提: 呼び出し側で全区画が同時に見える縦長 viewport にしておく (mouse.move の viewport クランプ回避)。
   */
  async dragRowToSection(dragTitle: string, sectionTestId: 'section-current' | 'section-next' | 'section-backlog'): Promise<void> {
    const sectionKey = sectionTestId.replace('section-', ''); // current | next | backlog
    const handle = this.backlogRowByTitle(dragTitle).first().locator('.trow-drag-grab');
    const listEl = this.page.locator(`[data-section="${sectionKey}"]`);

    await handle.scrollIntoViewIfNeeded();
    const hb = await handle.boundingBox();
    await listEl.scrollIntoViewIfNeeded();
    const lb = await listEl.boundingBox();
    if (!hb || !lb) {
      throw new Error('dragRowToSection: bounding box が取得できません');
    }
    const fx = hb.x + hb.width / 2;
    const fy = hb.y + hb.height / 2;
    const tx = lb.x + lb.width / 2;
    const ty = lb.y + Math.max(8, lb.height - 8); // dnd-list 内側下部 (行 or 空ゾーン)

    await this.page.mouse.move(fx, fy);
    await this.page.mouse.down();
    await this.page.mouse.move(fx, fy + 8, { steps: 4 }); // 動かし始め
    await this.page.mouse.move(tx, ty, { steps: 35 });     // 移動先リストへ侵入 (多ステップで検知させる)
    await this.page.mouse.move(tx, ty, { steps: 5 });      // 着地を安定
    await this.page.mouse.up();
  }

  /** 指定区画内に指定タイトルの行が見えるか (クロス区画移動の検証用)。 */
  sectionRowByTitle(sectionTestId: 'section-current' | 'section-next' | 'section-backlog', title: string): Locator {
    return this.page.getByTestId(sectionTestId).getByTestId('live-ticket').filter({ hasText: title });
  }
}
