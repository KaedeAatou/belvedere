// Page Object Model 基底クラス (Stage 2 / 2026-06-11)。
// 各画面の Page Object はこれを継承して page と共通 navigation を持つ。

import type { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'networkidle' });
  }
}
