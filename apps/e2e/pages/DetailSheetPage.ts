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

  /** 現在開いているシートのチケット ID (`.sheet-head` 内の `.t-mono` テキスト)。 */
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

  /** 現在開いているシートのチケット ID 文字列を返す。 */
  async getTicketId(): Promise<string> {
    return (await this.ticketIdEl.textContent())?.trim() ?? '';
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
