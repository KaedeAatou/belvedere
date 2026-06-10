#!/usr/bin/env tsx
// e2e 失敗時のチケット自動起票スクリプト (Stage 1 / 2026-06-10)。
//
// GitHub Actions の "Auto-create Belvedere ticket on failure" step から呼ばれる。
// test-results/results.json (Playwright json reporter 出力) を読んで、
// failed test 1 件ごとに POST /api/tickets を叩く。
//
// 必須 env:
//   API_BASE_URL: Belvedere API URL
//   FIREBASE_SA_KEY: Firebase Admin SDK SA 鍵 (JSON)
//   E2E_ROBOT_UID: robot user の Firebase UID
//   GH_RUN_URL: GitHub Actions run の URL (description に埋める)
//
// 実行: pnpm --filter @belvedere/e2e exec tsx utils/post-failure-tickets.ts

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mintCustomToken } from './firebase-admin';
import { createTicketClient } from './ticket-client';

interface PlaywrightTestResult {
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  error?: { message?: string };
}

interface PlaywrightSpec {
  title: string;
  tests: Array<{
    results: PlaywrightTestResult[];
  }>;
}

interface PlaywrightSuite {
  title: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
}

function collectFailures(suites: PlaywrightSuite[]): Array<{ name: string; error: string }> {
  const out: Array<{ name: string; error: string }> = [];
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        for (const r of t.results) {
          if (r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted') {
            out.push({
              name: `${suite.title} > ${spec.title}`,
              error: r.error?.message ?? `status=${r.status}`,
            });
          }
        }
      }
    }
    if (suite.suites) out.push(...collectFailures(suite.suites));
  }
  return out;
}

async function main(): Promise<void> {
  const apiBaseUrl = process.env.API_BASE_URL;
  const robotUid = process.env.E2E_ROBOT_UID;
  const runUrl = process.env.GH_RUN_URL ?? '(GitHub Actions URL not provided)';

  if (!apiBaseUrl || !robotUid) {
    console.error('[post-failure-tickets] missing env: API_BASE_URL / E2E_ROBOT_UID');
    process.exit(1);
  }

  const resultsPath = resolve(process.cwd(), 'test-results/results.json');
  if (!existsSync(resultsPath)) {
    console.warn(`[post-failure-tickets] no results.json at ${resultsPath}, skipping`);
    return;
  }

  let report: PlaywrightReport;
  try {
    report = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch (e) {
    console.error(`[post-failure-tickets] failed to parse results.json: ${(e as Error).message}`);
    process.exit(1);
  }

  const failures = collectFailures(report.suites ?? []);
  if (failures.length === 0) {
    console.log('[post-failure-tickets] no failures, nothing to file');
    return;
  }

  console.log(`[post-failure-tickets] ${failures.length} failure(s) detected`);

  // Firebase Admin SDK で custom token → API に渡す ID token を取得するため Web SDK が必要だが、
  // Node.js 環境では JS SDK の signInWithCustomToken が動かない。
  // → 代替: Identity Toolkit REST API で custom token → ID token に交換する
  const customToken = await mintCustomToken(robotUid);
  const idToken = await exchangeCustomTokenForIdToken(customToken);

  const client = createTicketClient({ apiBaseUrl, idToken });

  for (const f of failures) {
    try {
      const result = await client.createFailureTicket({
        testName: f.name,
        runUrl,
        errorMessage: f.error,
      });
      console.log(`[post-failure-tickets] created ticket ${result.id} for "${f.name}"`);
    } catch (e) {
      console.error(`[post-failure-tickets] failed to create ticket for "${f.name}": ${(e as Error).message}`);
    }
  }
}

/**
 * Firebase の Identity Toolkit REST API を直接叩いて custom token → ID token を交換する。
 * Node.js 環境では firebase JS SDK の signInWithCustomToken が動かないため。
 *
 * API key が必要だが、これは公開可能な値なので env (FIREBASE_API_KEY) または
 * SA 鍵の project_id から動的に取得する形にする。
 * → 現状は env 指定なしで動かす場合、SA 鍵から project_id を取り、固定 API key (Web SDK 設定値) を使う。
 */
async function exchangeCustomTokenForIdToken(customToken: string): Promise<string> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY ?? 'AIzaSyCwtYyHcGwuspL_TWyw6qN6PHxvuLGW3AA';
  // 注: 上記 apiKey は belvedere-dev-atrium プロジェクトの Web SDK 公開 API キー。
  // Firebase JS SDK の仕様で公開可能な値 (apps/web/nuxt.config.ts と一致)。

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`failed to exchange custom token: ${res.status} ${res.statusText} — ${text}`);
  }

  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

main().catch((e) => {
  console.error('[post-failure-tickets] fatal:', e);
  process.exit(1);
});
