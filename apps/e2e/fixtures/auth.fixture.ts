// Playwright fixture: authedPage を提供する (Stage 1 / 2026-06-10)。
//
// 動作フロー:
// 1. Firebase Admin SDK で robot UID 用の custom token を発行
// 2. Web ページを開く → ブラウザ context で Firebase JS SDK を初期化
// 3. signInWithCustomToken で token をクライアント側 SDK に渡してログイン状態化
// 4. 以降の test は authedPage 経由でログイン済みの page を使う
//
// 設計判断:
// - Stage 1 では既存 owner@example.com の Firebase UID を robot UID として共用
//   (Stage 2 で robot-e2e@belvedere.test に分離、ws-e2e-test owner 化)
// - storageState は使わない (Firebase Auth は localStorage + IndexedDB に状態を保存するため
//   storageState だけだとうまく復元できない、毎テスト signIn する方が確実)
// - Stage 2 で storageState 並列化を検討 (workers > 1 対応)
//
// 環境変数:
//   FIREBASE_SA_KEY (必須): Firebase Admin SDK の SA 鍵 JSON
//   E2E_ROBOT_UID (必須): robot user の Firebase UID
//                       (Stage 1 では owner@example.com の UID を使う)
//   E2E_ROBOT_EMAIL (任意): robot user の email (display 用、emailAllowlist との突合)

import { test as base, type Page } from '@playwright/test';
import { mintCustomToken, getProjectId } from '../utils/firebase-admin';
import { createTicketClient, type TicketClient } from '../utils/ticket-client';

interface AuthedFixtures {
  /** Firebase signInWithCustomToken で robot user としてログイン済の page */
  authedPage: Page;
  /** API 起票クライアント (現在の robot user の ID token を保持) */
  ticketClient: TicketClient;
  /** API base URL (env 経由、default は dev Cloud Run) */
  apiBaseUrl: string;
}

const API_BASE_URL_DEFAULT = 'https://belvedere-api-dev-cpszmcqmuq-an.a.run.app';

export const test = base.extend<AuthedFixtures>({
  apiBaseUrl: async ({}, use) => {
    await use(process.env.API_BASE_URL ?? API_BASE_URL_DEFAULT);
  },

  authedPage: async ({ page }, use) => {
    const robotUid = process.env.E2E_ROBOT_UID;
    if (!robotUid) {
      throw new Error('E2E_ROBOT_UID env is required (Firebase UID of robot user)');
    }
    const projectId = getProjectId();
    const customToken = await mintCustomToken(robotUid);

    // ブラウザに Web SDK を読み込ませてから signInWithCustomToken を実行
    // (apps/web/composables/useFirebase.ts が window.__belvedereFirebase を露出済)
    //
    // 注意: page.evaluate 内の `await import('firebase/auth')` は bare specifier 解決不可
    // (ブラウザのモジュール解決を使うため、Nuxt/Vite の bundle 経路に乗らない)。
    // 代わりに window scope に露出した signInWithCustomToken を使う。
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // useFirebase composable が走るまで少し待つ (Nuxt hydration)
    await page.waitForFunction(
      () => typeof (window as unknown as { __belvedereFirebase?: { signInWithCustomToken?: (t: string) => Promise<unknown> } }).__belvedereFirebase?.signInWithCustomToken === 'function',
      undefined,
      { timeout: 15_000 },
    );

    const signInError = await page.evaluate(async (customToken) => {
      try {
        const fb = (window as unknown as { __belvedereFirebase?: { signInWithCustomToken: (t: string) => Promise<unknown> } }).__belvedereFirebase;
        if (!fb || typeof fb.signInWithCustomToken !== 'function') {
          return 'window.__belvedereFirebase.signInWithCustomToken not available';
        }
        await fb.signInWithCustomToken(customToken);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    }, customToken);

    if (signInError) {
      throw new Error(`Firebase signInWithCustomToken failed: ${signInError} (projectId=${projectId})`);
    }

    // ログイン完了 → / に遷移して onAuthStateChanged の処理を確実に通す
    await page.goto('/', { waitUntil: 'networkidle' });

    await use(page);
  },

  ticketClient: async ({ page, apiBaseUrl }, use) => {
    // ticketClient は authedPage より先には使えない (idToken が必要)。
    // authedPage を依存に入れず、test 内で都度 ID token を取り直す方針:
    // → idToken を fixture 内で取れないため、failure 時のみ test 終了直前に取得する設計に。
    //
    // 簡易実装: idToken は test 内で getIdToken() を呼んで取得し、
    // ticketClient.createFailureTicket を test の afterEach で呼ぶ前提。
    //
    // Stage 1 ではこの fixture は使われない可能性もある (CI workflow 側で
    // run 結果を見て後付けでチケット起票する方が確実)。
    const idToken = await page.evaluate(async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        return (await getAuth().currentUser?.getIdToken()) ?? '';
      } catch {
        return '';
      }
    });

    const client = createTicketClient({ apiBaseUrl, idToken });
    await use(client);
  },
});

export { expect } from '@playwright/test';
