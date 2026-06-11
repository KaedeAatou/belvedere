// Backlog Refinement 画面 (floor 03) 用 Page Object (T8 / 2026-06-11)。
// findings ワークキューと「ポーカー開始」(T9) の操作をまとめる。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RefinementPage extends BasePage {
  readonly body: Locator;

  constructor(page: Page) {
    super(page);
    this.body = page.getByTestId('refinement-body');
  }

  /** Events タブ → Refinement レール (floor 03) を開く。 */
  async open(): Promise<void> {
    await this.page.getByRole('button', { name: 'Events', exact: true }).click();
    await this.page.getByTestId('rail-refinement').click();
    await expect(this.body).toBeVisible({ timeout: 15_000 });
  }

  /** 指定タイトルの行 (ワークキュー内)。 */
  row(title: string): Locator {
    return this.body.locator('.trow').filter({ hasText: title });
  }

  /** 指定タイトルのストーリーで「ポーカー開始」を押す (STORY_SP_MISSING グループ内)。 */
  async startPoker(title: string): Promise<void> {
    await this.row(title).locator('[data-testid^="ref-start-poker-"]').first().click();
  }
}
