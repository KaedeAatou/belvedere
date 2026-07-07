// AI パネル チャット e2e — ローカル決定的版 (e2e アーキ改革パイロット / 2026-07-07)。
//
// 本線 (tests/ai-panel.spec.ts) は dev 実 Gemini を叩くため「応答 or エラーのどちらか出れば OK」
// という緩い assert しか書けなかった。このパイロットは無認証ローカル (LLM_PROVIDER=mock) に対して
// 走らせ、**mock の決定的な応答 (必ず "(Mock)" マーカーを含む) の中身まで assert** する。
// これが「LLM を mock に差し替え + 環境を使い捨てにすれば e2e が決定的になる」実証。
//
// 前提: ./scripts/dev-local-noauth.sh で :3000 (無認証 / mock / seed) を起動しておく。
// 認証 fixture は使わない (dev-no-auth なのでプレーンな @playwright/test でよい)。

import { test, expect } from '@playwright/test';

test.describe('AI パネル (ローカル mock / 決定的)', () => {
  test('送信すると mock agent の応答が (Mock) マーカー付きで返る', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const input = page.locator('[data-testid=ai-input]');
    await expect(input).toBeVisible({ timeout: 20_000 });

    await input.fill('今のスプリントを診断して');
    await page.locator('[data-testid=ai-send]').click();

    // mock は決定的: どの儀式 agent / orchestrator でも最終応答に "(Mock)" マーカーが必ず入る。
    // 実 Gemini と違い「内容」を assert できるのがこのパイロットの主眼。
    const agentMsg = page.locator('[data-testid=ai-message]').filter({ hasText: 'Belvedere' });
    await expect(agentMsg.filter({ hasText: '(Mock)' }).first()).toBeVisible({ timeout: 30_000 });
  });
});
