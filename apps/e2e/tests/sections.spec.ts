// 3 区画ビュー (CURRENT / NEXT / BACKLOG) のクロス区画 d&d e2e (2026-06-13)。
//
// ユーザー報告「Backlog / Planning で BACKLOG の行を CURRENT / NEXT に移動できない」の
// 再現ガード。SprintSectionedList の onSectionDragOver / onSectionDrop / moveToSection →
// PATCH sprintId の経路を、実ブラウザの DragEvent dispatch で検証する。
//
// 並行 2 run が同一 WS を共有するため、件数比較はせずテキスト存在 + 自己清掃で書く。

import { test, expect } from '../fixtures/auth.fixture';
import { BacklogPage } from '../pages/BacklogPage';
import { DetailSheetPage } from '../pages/DetailSheetPage';

test.describe('3 区画ビュー クロス区画移動', () => {
  test('BACKLOG 行を CURRENT へ d&d → 移動 + 永続 → BACKLOG へ戻す (sprintId 解除)', async ({ authedPage }) => {
    const backlog = new BacklogPage(authedPage);
    const sheet = new DetailSheetPage(authedPage);
    // 全区画 (CURRENT/NEXT/BACKLOG) を同時に表示し、実マウスのクロス区画ドラッグが viewport
    // クランプされないよう縦長にする (SortableJS は移動先リストへのカーソル侵入で移動を検知する)。
    await authedPage.setViewportSize({ width: 1280, height: 1800 });
    await backlog.open();

    const title = `[E2E] 区画移動 ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await backlog.createTicket({ title, type: 'bug' });
      // 作成直後は sprintId 無し → BACKLOG 区画に出る
      await expect(backlog.sectionRowByTitle('section-backlog', title).first()).toBeVisible({ timeout: 10_000 });

      // BACKLOG → CURRENT (区画 div 本体へのドロップ経路)
      await backlog.dragRowToSection(title, 'section-current');
      await expect(backlog.sectionRowByTitle('section-current', title).first()).toBeVisible({ timeout: 10_000 });

      // リロードしても CURRENT に留まる (sprintId が API へ永続化されている)
      await authedPage.reload();
      await expect(backlog.liveSection).toBeVisible({ timeout: 15_000 });
      await expect(backlog.sectionRowByTitle('section-current', title).first()).toBeVisible({ timeout: 10_000 });

      // CURRENT → BACKLOG (sprintId null 解除の経路)
      await backlog.dragRowToSection(title, 'section-backlog');
      await expect(backlog.sectionRowByTitle('section-backlog', title).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      // teardown: 自作チケットを削除 (汚染防止)
      if (await backlog.hasTicketWithTitle(title)) {
        await backlog.openTicketByTitle(title);
        if (await sheet.sheet.isVisible()) {
          await sheet.deleteTwice();
          await sheet.sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
        }
      }
    }
  });
});
