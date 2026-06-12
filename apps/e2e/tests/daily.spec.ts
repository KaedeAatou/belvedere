// Daily ボード 回帰 e2e (Wave 3 / 2026-06-12)。
// チケット消失バグ b9de315 のガード: ドラッグ後にカードが消えないことを確認する。
//
// 方針:
//   - 件数ベース assert 禁止 (並行 2 run が同一 Workspace を共有するため)
//   - 作成したチケットは必ず try/finally で削除する (自己清掃)
//   - チケット作成は UI (Backlog ダイアログ)、スプリント投入は API 直叩きに変更
//     (DetailSheet 経由の sheet-edit-sprint/status は経路が脆いため)
//   - dragTo フォールバックは DailyPage.dragCardToCol が内包している

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';
import { DailyPage } from '../pages/DailyPage';

/** ブラウザ context で Firebase ID token を取得するヘルパー型。 */
type FirebaseWindow = {
  __belvedereFirebase?: {
    auth?: { currentUser?: { getIdToken: () => Promise<string> } };
  };
};

test.describe('Daily ボード', () => {
  test('Daily カード d&d: TODO → DOING でカードが消えないこと (b9de315 回帰ガード)', async ({ authedPage, apiBaseUrl }) => {
    const backlog = new BacklogPage(authedPage);
    const sheet = new DetailSheetPage(authedPage);
    const daily = new DailyPage(authedPage);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `[E2E] daily-move-${suffix}`;
    let ticketId = '';

    // === step 1: Backlog でチケット作成 (UI) ===
    await backlog.open();
    await backlog.createTicket({ title, type: 'task' });
    await expect
      .poll(() => backlog.hasTicketWithTitle(title), { timeout: 10_000 })
      .toBe(true);

    try {
      // === step 2: DetailSheet でチケット ID を取得 ===
      await backlog.openTicketByTitle(title);
      await expect(sheet.sheet).toBeVisible({ timeout: 10_000 });
      ticketId = await sheet.getTicketId();

      // シートを閉じてから API 操作へ
      await authedPage.keyboard.press('Escape');
      await sheet.sheet.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);

      // === step 3: API 直叩きでアクティブスプリントへ投入 + status = todo に設定 ===
      // GET /api/sprints で status=active のスプリント ID を取得し、
      // PATCH /api/tickets/{id} で sprintId + status を一括更新する。
      const patchResult = await authedPage.evaluate(
        async ({ base, tId }: { base: string; tId: string }) => {
          const fb = (window as unknown as FirebaseWindow).__belvedereFirebase;
          const token = await fb?.auth?.currentUser?.getIdToken();
          if (!token) return { ok: false, reason: 'no token' };

          // アクティブスプリントを取得
          const spRes = await fetch(`${base}/api/sprints`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!spRes.ok) return { ok: false, reason: `sprints ${spRes.status}` };
          const sprints = (await spRes.json()) as Array<{ id: string; status: string }>;
          const active = sprints.find((s) => s.status === 'active');
          if (!active) return { ok: false, reason: 'no active sprint' };

          // PATCH でスプリント投入 + status = todo
          const pRes = await fetch(`${base}/api/tickets/${tId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sprintId: active.id, status: 'todo' }),
          });
          if (!pRes.ok) {
            const body = await pRes.text();
            return { ok: false, reason: `patch ${pRes.status}: ${body}` };
          }
          return { ok: true, sprintId: active.id };
        },
        { base: apiBaseUrl, tId: ticketId },
      );

      if (!patchResult.ok) {
        throw new Error(`API によるスプリント投入に失敗: ${patchResult.reason}`);
      }

      // === step 4: Daily へ遷移 → TODO 列にカードが見えること ===
      await daily.open();

      // daily-card-{id} が TODO 列に存在すること
      const cardLocator = daily.card(ticketId);
      await expect
        .poll(async () => {
          const box = await cardLocator.boundingBox();
          return box !== null;
        }, { timeout: 15_000, intervals: [500, 500, 1000] })
        .toBe(true);

      // === step 5: DOING 列へ d&d → カードが消えないこと (バグ回帰ガード) ===
      await daily.dragCardToCol(ticketId, 'in-progress');

      // poll で in-progress 列にカードが存在し続けることを確認
      await expect
        .poll(
          async () => {
            const col = daily.col('in-progress');
            const card = col.getByTestId(`daily-card-${ticketId}`);
            return await card.count();
          },
          { timeout: 10_000, intervals: [500, 500, 1000] },
        )
        .toBeGreaterThan(0);
    } finally {
      // === teardown: API 直 DELETE でチケットを削除 ===
      if (ticketId) {
        await authedPage.evaluate(
          async ({ base, tId }: { base: string; tId: string }) => {
            const fb = (window as unknown as FirebaseWindow).__belvedereFirebase;
            const token = await fb?.auth?.currentUser?.getIdToken();
            if (!token) return;
            await fetch(`${base}/api/tickets/${tId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
          },
          { base: apiBaseUrl, tId: ticketId },
        );
      } else {
        // ticketId が取れていない場合は UI 経由でフォールバック削除を試みる
        await backlog.open();
        if (await backlog.hasTicketWithTitle(title)) {
          await backlog.openTicketByTitle(title);
          if (await sheet.sheet.isVisible()) {
            await sheet.deleteTwice();
            await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
          }
        }
      }
    }
  });
});
