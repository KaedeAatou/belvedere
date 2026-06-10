// Belvedere e2e — Playwright 設定 (Stage 1 / 2026-06-10)。
//
// 設計判断 (案 C 推奨):
// - Stage 1 では POM 未導入、fixture だけ最初から (test.extend で authedPage を注入)
// - baseURL は env で受ける: WEB_BASE_URL (本番デフォルト belvedere-web-dev-cpszmcqmuq-an.a.run.app)
// - retries: 1 (CI でフレーキー対策)、Stage 3 で trace='on-first-retry' に切替予定
// - workers: 1 (Firebase Auth 状態は workers 間共有不可、Stage 2 で storageState 並列化検討)

import { defineConfig, devices } from '@playwright/test';

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://belvedere-web-dev-cpszmcqmuq-an.a.run.app';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Firebase Auth 共有のため
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
});
