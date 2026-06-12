// Backlog 画面 e2e (Stage 2 / 2026-06-11)。
// Phase 1-C で実装した「Live (実 API)」セクション + 新規作成ダイアログを検証。
//
// 失敗時は auto-ticket で Belvedere 自身にチケット起票 → ドッグフード閉ループ。
//
// teardown 規律: 各テストで作成した [E2E] チケットは test.afterEach の try/finally
// で必ず削除する。並行 2 run からの汚染蓄積を防ぐ。

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';

test('Backlog の Live セクションが表示される', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();
  await expect(backlog.liveSection).toBeVisible();
});

test('新規チケット作成 → ダイアログ → 作成 → Live セクションに反映', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  const sheet = new DetailSheetPage(authedPage);
  await backlog.open();

  const uniqueTitle = `[E2E] テストチケット ${Date.now()}`;

  try {
    const before = await backlog.liveCount();

    await backlog.createTicket({ title: uniqueTitle, priority: 'high' });

    // Live セクションに新規行が増える
    await expect.poll(async () => backlog.liveCount(), { timeout: 10_000 }).toBeGreaterThan(before);
    expect(await backlog.hasTicketWithTitle(uniqueTitle)).toBe(true);
  } finally {
    // 成功/失敗どちらでも削除 (存在しない場合は静かに無視)
    if (await backlog.hasTicketWithTitle(uniqueTitle)) {
      await backlog.openTicketByTitle(uniqueTitle);
      if (await sheet.sheet.isVisible()) {
        await sheet.deleteTwice();
        await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
      }
    }
  }
});

test('空タイトルで作成 → エラー表示でダイアログ閉じない', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  await backlog.open();

  await backlog.newTicketBtn.click();
  await expect(backlog.createDialog).toBeVisible();

  // タイトル空のまま作成押下
  await backlog.submitCreate.click();

  // エラー表示 (UI 側 validation でダイアログ開いたまま)
  await expect(backlog.createError).toBeVisible();
  await expect(backlog.createDialog).toBeVisible();
});

test('編集: 自作チケットを DetailSheet で開いてタイトル変更 → 反映 (T10)', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  const sheet = new DetailSheetPage(authedPage);
  await backlog.open();

  const title = `[E2E] 編集前 ${Date.now()}`;
  const newTitle = `[E2E] 編集後 ${Date.now()}`;

  try {
    await backlog.createTicket({ title, type: 'task' });

    await backlog.openTicketByTitle(title);
    await expect(sheet.sheet).toBeVisible();

    await sheet.edit(newTitle);
    await expect(sheet.title).toHaveText(newTitle, { timeout: 10_000 });
  } finally {
    // 編集後タイトルで削除を試みる。なければ元タイトルでも試みる。
    // 編集完了後にシートが開いたままになっている場合、openTicketByTitle が
    // .sheet-body にポインタを遮られて timeout するため、先に閉じる。
    await sheet.closeIfOpen();
    for (const t of [newTitle, title]) {
      if (await backlog.hasTicketWithTitle(t)) {
        await backlog.openTicketByTitle(t);
        if (await sheet.sheet.isVisible()) {
          await sheet.deleteTwice();
          await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
        }
        break;
      }
    }
  }
});

test('削除: 自作チケットを 2 段階クリックで削除 → 一覧から消える (T10)', async ({ authedPage }) => {
  const backlog = new BacklogPage(authedPage);
  const sheet = new DetailSheetPage(authedPage);
  await backlog.open();

  const title = `[E2E] 削除対象 ${Date.now()}`;

  try {
    await backlog.createTicket({ title, type: 'task' });

    await backlog.openTicketByTitle(title);
    await expect(sheet.sheet).toBeVisible();

    await sheet.deleteTwice();
    await expect(sheet.sheet).toBeHidden({ timeout: 10_000 });
    expect(await backlog.hasTicketWithTitle(title)).toBe(false);
  } finally {
    // 削除テストなので通常はもう存在しないが、失敗時の残骸を掃除する
    if (await backlog.hasTicketWithTitle(title)) {
      await backlog.openTicketByTitle(title);
      if (await sheet.sheet.isVisible()) {
        await sheet.deleteTwice();
        await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
      }
    }
  }
});
