// Backlog 並び替え e2e (Wave 3 / 2026-06-12)。
// バックログ行の orderIndex が更新され、リロード後も DOM 順序が保たれることを確認する。
//
// 方針:
//   - 件数ベース assert 禁止 (並行 2 run が同一 Workspace を共有するため)
//   - 作成した 2 枚は try/finally で必ず削除する (自己清掃)
//   - d&d UI 操作はブラウザの dragArmed フラグとの同期が困難なため、
//     orderIndex を API 直 PATCH で更新し「repo ソート + UI 反映 + 永続」を検証する。
//     d&d UI 操作の実機検証は browser MCP での手動確認に委ねる (TODO)。
//   - DOM 順序は document.querySelectorAll('[data-testid="live-ticket"]') で確認する

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';

/** ブラウザ context で Firebase ID token を取得するヘルパー型。 */
type FirebaseWindow = {
  __belvedereFirebase?: {
    auth?: { currentUser?: { getIdToken: () => Promise<string> } };
  };
};

test.describe('Backlog 並び替え', () => {
  test('orderIndex API PATCH で B を A の上へ → DOM 順序 + リロード後も保たれること', async ({ authedPage, apiBaseUrl }) => {
    const backlog = new BacklogPage(authedPage);
    const sheet = new DetailSheetPage(authedPage);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const titleA = `[E2E] reorder-A-${suffix}`;
    const titleB = `[E2E] reorder-B-${suffix}`;
    let idA = '';
    let idB = '';

    await backlog.open();

    // === step 1: 仮チケット 2 枚作成 (A, B の順) ===
    await backlog.createTicket({ title: titleA, type: 'bug' });
    await expect
      .poll(() => backlog.hasTicketWithTitle(titleA), { timeout: 10_000 })
      .toBe(true);

    await backlog.createTicket({ title: titleB, type: 'bug' });
    await expect
      .poll(() => backlog.hasTicketWithTitle(titleB), { timeout: 10_000 })
      .toBe(true);

    try {
      // === step 2: DetailSheet でチケット ID を取得 (A) ===
      await backlog.openTicketByTitle(titleA);
      await expect(sheet.sheet).toBeVisible({ timeout: 10_000 });
      idA = await sheet.getTicketId();
      await sheet.closeIfOpen();

      // === step 3: DetailSheet でチケット ID を取得 (B) ===
      await backlog.openTicketByTitle(titleB);
      await expect(sheet.sheet).toBeVisible({ timeout: 10_000 });
      idB = await sheet.getTicketId();
      await sheet.closeIfOpen();

      // === step 4: API 直 PATCH で B.orderIndex < A.orderIndex を設定 ===
      // B の orderIndex を 100 に、A の orderIndex を 200 に設定することで B が A より上になる。
      const patchResult = await authedPage.evaluate(
        async ({ base, aId, bId }: { base: string; aId: string; bId: string }) => {
          const fb = (window as unknown as FirebaseWindow).__belvedereFirebase;
          const token = await fb?.auth?.currentUser?.getIdToken();
          if (!token) return { ok: false, reason: 'no token' };

          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          };

          // A を orderIndex=200、B を orderIndex=100 に設定 → B が A より上
          const [rA, rB] = await Promise.all([
            fetch(`${base}/api/tickets/${aId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ orderIndex: 200 }),
            }),
            fetch(`${base}/api/tickets/${bId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ orderIndex: 100 }),
            }),
          ]);

          if (!rA.ok) return { ok: false, reason: `patch A ${rA.status}: ${await rA.text()}` };
          if (!rB.ok) return { ok: false, reason: `patch B ${rB.status}: ${await rB.text()}` };
          return { ok: true };
        },
        { base: apiBaseUrl, aId: idA, bId: idB },
      );

      if (!patchResult.ok) {
        throw new Error(`API による orderIndex 設定に失敗: ${patchResult.reason}`);
      }

      // === step 5: リロードして DOM 順序を確認 (orderIndex 永続 + UI 反映) ===
      await backlog.open();

      await expect
        .poll(() => backlog.hasTicketWithTitle(titleA), { timeout: 10_000 })
        .toBe(true);
      await expect
        .poll(() => backlog.hasTicketWithTitle(titleB), { timeout: 10_000 })
        .toBe(true);

      const indexAAfter = await authedPage.evaluate((t: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="live-ticket"]'));
        return rows.findIndex((r) => r.textContent?.includes(t));
      }, titleA);
      const indexBAfter = await authedPage.evaluate((t: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="live-ticket"]'));
        return rows.findIndex((r) => r.textContent?.includes(t));
      }, titleB);

      // B (orderIndex=100) が A (orderIndex=200) より上 (小さい index) にあること
      if (indexAAfter >= 0 && indexBAfter >= 0) {
        expect(indexBAfter).toBeLessThan(indexAAfter);
      }
    } finally {
      // === teardown: API 直 DELETE でチケットを削除 ===
      const idsToDelete = [idA, idB].filter(Boolean);
      if (idsToDelete.length > 0) {
        await authedPage.evaluate(
          async ({ base, ids }: { base: string; ids: string[] }) => {
            const fb = (window as unknown as FirebaseWindow).__belvedereFirebase;
            const token = await fb?.auth?.currentUser?.getIdToken();
            if (!token) return;
            await Promise.all(
              ids.map((id) =>
                fetch(`${base}/api/tickets/${id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                }),
              ),
            );
          },
          { base: apiBaseUrl, ids: idsToDelete },
        );
      } else {
        // ID が取れていない場合は UI 経由でフォールバック削除
        await backlog.open();
        for (const title of [titleA, titleB]) {
          if (await backlog.hasTicketWithTitle(title)) {
            await backlog.openTicketByTitle(title);
            if (await sheet.sheet.isVisible()) {
              await sheet.deleteTwice();
              await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
            }
          }
        }
      }
    }
  });

  // ★ 実機赤を CI で捕まえる本命ガード。合成イベントではなく Playwright 実マウスで
  //   usePointerReorder の start→setPointerCapture→onMove→onUp→commit を本物で踏む。
  //   過去のデグレ (capture 欠如で動かない / 掴むとテキストが複数行選択される) は、この経路を
  //   通さない API 直 PATCH・合成 PointerEvent テストでは緑になり隠れていた。
  test('実 pointer でハンドルを掴み B を A の上へ → 並び替わる + ネイティブ選択が起きない (症状1/4 の実機ガード)', async ({
    authedPage,
  }) => {
    const backlog = new BacklogPage(authedPage);
    const sheet = new DetailSheetPage(authedPage);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const titleA = `[E2E] pdrag-A-${suffix}`;
    const titleB = `[E2E] pdrag-B-${suffix}`;

    await backlog.open();
    await backlog.createTicket({ title: titleA, type: 'bug' });
    await expect.poll(() => backlog.hasTicketWithTitle(titleA), { timeout: 10_000 }).toBe(true);
    await backlog.createTicket({ title: titleB, type: 'bug' });
    await expect.poll(() => backlog.hasTicketWithTitle(titleB), { timeout: 10_000 }).toBe(true);

    // 自作 2 枚の相対 index のみ見る (並行 2 run が同一 WS を共有するため全体件数は見ない)。
    const indexOf = (title: string): Promise<number> =>
      authedPage.evaluate((t: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="live-ticket"]'));
        return rows.findIndex((r) => r.textContent?.includes(t));
      }, title);

    try {
      // B のハンドルを実マウスで掴み、A 行の上端へドロップ ('before')。
      await backlog.reorderDragBefore(titleB, titleA);

      // 症状4 ガード: B が A より上 (小さい index) に来る = commit→orderIndex PATCH→UI 反映が走った。
      await expect
        .poll(
          async () => {
            const ia = await indexOf(titleA);
            const ib = await indexOf(titleB);
            return ia >= 0 && ib >= 0 && ib < ia;
          },
          { timeout: 10_000 },
        )
        .toBe(true);

      // 症状1 ガード: ドラッグで native テキスト選択が起きていない (3 行全選択に見える現象の根)。
      const selectionLen = await authedPage.evaluate(
        () => window.getSelection()?.toString().length ?? 0,
      );
      expect(selectionLen).toBe(0);
    } finally {
      for (const title of [titleA, titleB]) {
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
