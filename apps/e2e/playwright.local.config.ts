// Belvedere e2e — ローカル決定的 config (e2e アーキ改革パイロット / 2026-07-07)。
//
// 本線 config (playwright.config.ts) との違い = 「e2e 本線を決定的にする」案の実証:
//   - baseURL は localhost:3000 (scripts/dev-local-noauth.sh で起動する無認証ローカル環境)
//   - その環境は LLM_PROVIDER=mock + memory backend + seed = **決定的**。実 Gemini を叩かない
//   - testDir は tests-local (本線 CI は tests/ のみ回すので、このパイロットは CI に混ざらない)
//   - 認証も無し (dev-no-auth) なので auth fixture 不要 = プレーンな @playwright/test を使える
//
// 実行:
//   1) ./scripts/dev-local-noauth.sh   (別ターミナル / :3000 起動を待つ)
//   2) pnpm --filter @belvedere/e2e test:local
//      (= npx playwright test --config playwright.local.config.ts)

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests-local',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  outputDir: 'test-results-local',
});
