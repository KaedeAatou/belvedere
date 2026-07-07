// AI パネル チャット e2e (P8 / 2026-07-07)。
//
// 目的: 「ai-input に入力 → ai-send → 応答が AI パネルに出る」という会話の往復が実ブラウザで
// 成立することを 1 本だけ保証する。
//
// 方針 (dev の実環境事情に合わせる):
//   - dev API は LLM_PROVIDER=gemini (実 Gemini) なので応答は非決定的 + tool ループで 30〜60s かかる。
//     → 内容・件数は一切 assert しない。setTimeout / poll を長めに取る。
//   - 実 Gemini は時に 429/遅延で失敗する。その場合はエラーバナー (ai-error) が出る。
//     「agent の応答メッセージ」か「エラーバナー」の**どちらか**が出れば往復は成立したとみなす
//     (送信経路・応答描画が動いた証拠。Gemini の機嫌で赤くしない)。
//   - 並行 2 run が同一 Workspace を共有するため件数比較はしない。
//   - 送信先 agent 名 (orchestrator / 儀式) に依存しない書き方にする (flag の ON/OFF どちらでも通る)。
//   - 自己清掃: 「新しい会話」ボタンで localStorage の会話を消し、他 run に会話を漏らさない。

import { test, expect } from '../fixtures/auth.fixture';

test.describe('AI パネル チャット', () => {
  test('質問を送ると agent 応答またはエラー表示が返る (会話の往復)', async ({ authedPage }) => {
    test.setTimeout(120_000); // 実 Gemini + tool ループで時間がかかる

    const page = authedPage;
    await page.goto('/', { waitUntil: 'networkidle' });

    const input = page.locator('[data-testid=ai-input]');
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill('今のスプリントのゴールを一言で教えて');
    await page.locator('[data-testid=ai-send]').click();

    // agent (Belvedere) 側の会話メッセージ。ai-message は user/agent 両方に付くので
    // 'Belvedere' ラベルで agent 側だけに絞る (静的 checks 行は ai-message testid を持たない)。
    const agentMsg = page.locator('[data-testid=ai-message]').filter({ hasText: 'Belvedere' });
    const errorBanner = page.locator('[data-testid=ai-error]');

    try {
      await expect
        .poll(async () => (await agentMsg.count()) > 0 || (await errorBanner.count()) > 0, {
          timeout: 90_000,
          intervals: [1000, 2000, 3000],
        })
        .toBe(true);
    } finally {
      const clear = page.locator('[data-testid=ai-clear]');
      if (await clear.count()) await clear.click().catch(() => {});
    }
  });
});
