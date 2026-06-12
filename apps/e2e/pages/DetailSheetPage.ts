// DetailSheet (チケット詳細シート) 用 Page Object (T8 / 2026-06-11)。
// 見積もりポーカー (T7) と編集/削除 (T10) の testid をまとめる。

import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DetailSheetPage extends BasePage {
  readonly sheet: Locator;
  readonly estimationPanel: Locator;
  readonly editBtn: Locator;
  readonly editTitle: Locator;
  readonly saveBtn: Locator;
  readonly deleteBtn: Locator;
  readonly title: Locator;

  /**
   * 現在開いているシートのチケット ID 表示要素。
   * sheet-head には `.t-mono` が複数存在する可能性がある (ID コピーボタン内 span + その他)。
   * strict mode 違反を避けるため `.first()` を使う (getTicketId 参照)。
   */
  readonly ticketIdEl: Locator;

  constructor(page: Page) {
    super(page);
    this.sheet = page.locator('.sheet');
    this.estimationPanel = page.getByTestId('estimation-panel');
    this.editBtn = page.getByTestId('edit-ticket');
    this.editTitle = page.getByTestId('edit-title');
    this.saveBtn = page.getByTestId('save-ticket');
    this.deleteBtn = page.getByTestId('delete-ticket');
    this.title = page.locator('.sheet .sheet-body h2');
    this.ticketIdEl = page.locator('.sheet .sheet-head .t-mono');
  }

  /** 現在開いているシートのチケット ID 文字列を返す。
   *
   * sheet-head に `.t-mono` は複数存在し得る (ID コピーボタン内の span + 他の chip 等)。
   * `.first()` で最初の要素 (= チケット ID 表示 span) を確実に取る。
   */
  async getTicketId(): Promise<string> {
    return (await this.ticketIdEl.first().textContent())?.trim() ?? '';
  }

  // ----- シート開閉 -----

  /**
   * シートが開いていれば ESC で閉じ、hidden になるまで待つ。
   * teardown の先頭で呼ぶことで「開いているシートがポインタを遮って openTicketByTitle が
   * timeout する」問題 (T10 teardown) を解消する。
   * シートが既に閉じていれば何もしない。
   */
  async closeIfOpen(): Promise<void> {
    if (await this.sheet.isVisible()) {
      await this.page.keyboard.press('Escape');
      await this.sheet.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
    }
  }

  // ----- 見積もりポーカー (T7) -----
  estStart(): Locator { return this.page.getByTestId('est-start'); }
  estVote(v: number | string): Locator { return this.page.getByTestId(`est-vote-${v}`); }
  estReveal(): Locator { return this.page.getByTestId('est-reveal'); }
  estAdopt(v: number): Locator { return this.page.getByTestId(`est-adopt-${v}`); }

  // ----- 編集 (T10-1) -----
  async edit(newTitle: string): Promise<void> {
    await this.editBtn.click();
    await this.editTitle.fill(newTitle);
    await this.saveBtn.click();
  }

  // ----- 削除 (T10-2 / 2 段階クリック) -----
  async deleteTwice(): Promise<void> {
    await this.deleteBtn.click(); // 1 回目: arm
    await this.deleteBtn.click(); // 2 回目: 実行
  }
}
