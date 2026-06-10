// /settings/profile 用 Page Object (Stage 2 / 2026-06-11)。
// Stage 1 の tests/profile.spec.ts 内の locator を移植 + 編集操作を抽象化。

import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SettingsProfilePage extends BasePage {
  // 主要要素
  readonly emailValue: Locator;
  readonly roleBadge: Locator;
  readonly displayNameInput: Locator;
  readonly saveButton: Locator;
  readonly whoamiButton: Locator;
  readonly whoamiResult: Locator;
  readonly successMsg: Locator;
  readonly errorMsg: Locator;

  constructor(page: Page) {
    super(page);
    this.emailValue = page.locator('.value.readonly').first();
    this.roleBadge = page.locator('.role-badge');
    this.displayNameInput = page.locator('#displayName');
    this.saveButton = page.getByRole('button', { name: /保存/ });
    this.whoamiButton = page.getByRole('button', { name: /whoami/i });
    this.whoamiResult = page.locator('.whoami-result');
    this.successMsg = page.locator('.msg.success');
    this.errorMsg = page.locator('.msg.error');
  }

  async open(): Promise<void> {
    await this.goto('/settings/profile');
    await expect(this.page.getByText('プロフィール')).toBeVisible({ timeout: 15_000 });
  }

  async getRole(): Promise<string> {
    return (await this.roleBadge.textContent())?.trim() ?? '';
  }

  async editDisplayName(newName: string): Promise<void> {
    await this.displayNameInput.fill(newName);
    await this.saveButton.click();
  }

  async expectSaveSuccess(): Promise<void> {
    await expect(this.successMsg).toBeVisible({ timeout: 10_000 });
  }

  async clickWhoami(): Promise<void> {
    await this.whoamiButton.click();
    await expect(this.whoamiResult).toBeVisible({ timeout: 10_000 });
  }

  async whoamiContainsRole(expectedRole: string): Promise<boolean> {
    const text = (await this.whoamiResult.textContent()) ?? '';
    return text.includes(`"role"`) && text.includes(`"${expectedRole}"`);
  }
}
