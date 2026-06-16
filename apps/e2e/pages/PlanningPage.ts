// Planning 画面 (floor 01) 用 Page Object (2026-06-11)。
// 「次スプリント計画」ダイアログ + 「Pull from backlog」ダイアログの操作をまとめる。
// 非破壊テスト専用: save / start / pull-submit は呼ばない。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class PlanningPage extends BasePage {
  // ---- スプリント編集 / 計画ダイアログ (current=編集 / next=計画+開始) ----
  readonly editCurrentSprintBtn: Locator;
  readonly planNextSprintBtn: Locator;
  readonly sprintDialog: Locator;
  readonly sprintNameInput: Locator;
  readonly sprintGoalInput: Locator;
  readonly sprintStartInput: Locator;
  readonly sprintEndInput: Locator;
  /** 保存 (開始せず) ボタン — 非破壊テストではキャンセル代わりに使わない。閉じるは close-btn で行う */
  readonly sprintSaveBtn: Locator;
  readonly sprintStartBtn: Locator;
  readonly sprintCloseBtn: Locator;

  // ---- Pull from backlog ダイアログ ----
  readonly pullFromBacklogBtn: Locator;
  readonly pullDialog: Locator;
  readonly pullSubmitBtn: Locator;
  readonly pullCloseBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.editCurrentSprintBtn = page.getByTestId('edit-current-sprint');
    this.planNextSprintBtn = page.getByTestId('plan-next-sprint');
    this.sprintDialog = page.getByTestId('sprint-dialog');
    this.sprintNameInput = page.getByTestId('sprint-name-input');
    this.sprintGoalInput = page.getByTestId('sprint-goal-input');
    this.sprintStartInput = page.getByTestId('sprint-start-input');
    this.sprintEndInput = page.getByTestId('sprint-end-input');
    this.sprintSaveBtn = page.getByTestId('sprint-save');
    this.sprintStartBtn = page.getByTestId('sprint-start');
    // ダイアログ内の × ボタン (sprint-dialog 内の close-btn)
    this.sprintCloseBtn = page.getByTestId('sprint-dialog').locator('.close-btn');

    this.pullFromBacklogBtn = page.getByTestId('pull-from-backlog');
    this.pullDialog = page.getByTestId('pull-dialog');
    this.pullSubmitBtn = page.getByTestId('pull-submit');
    // pull-dialog 内の × ボタン
    this.pullCloseBtn = page.getByTestId('pull-dialog').locator('.close-btn');
  }

  /** Events タブ → Planning レール (floor 01) を開く。 */
  async open(): Promise<void> {
    await this.goto('/');
    await this.page.getByRole('button', { name: 'Events', exact: true }).click();
    await this.page.getByTestId('rail-planning').click();
    // Planning 画面の識別要素が visible になるまで待つ
    await expect(this.page.locator('.planning')).toBeVisible({ timeout: 15_000 });
  }

  /**
   * 指定 id のバックログ行 locator (pull-dialog 内)。
   * togglePullRow でクリックすると pull-row--selected クラスが付く。
   */
  pullRow(id: string): Locator {
    return this.page.getByTestId(`pull-row-${id}`);
  }

  /** pull-dialog 内の全バックログ行 */
  allPullRows(): Locator {
    return this.page.locator('[data-testid^="pull-row-"]');
  }
}
