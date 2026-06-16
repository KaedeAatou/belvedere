// Planning 画面 e2e — Sprint 計画ダイアログ + Pull from backlog ダイアログ (2026-06-11)。
//
// 方針: 非破壊テスト。共有 Workspace の状態を書き換えないため
//   - sprint-save / sprint-start は絶対に押さない (スプリント状態を変更するため)
//   - pull-submit は押さない (チケットの sprintId / status を書き換えるため)
//   - ダイアログは必ず × ボタン or キャンセルで閉じる
//
// skip 条件:
//   - Sprint 計画ダイアログ: nextPlanned スプリントが無い (plan-next-sprint ボタンが存在しない)
//   - Pull from backlog ダイアログ: activeSprint が無い (pull-from-backlog ボタンが disabled)
//     → disabled のまま開けないため skip

import { test, expect } from '../fixtures/auth.fixture';
import { PlanningPage } from '../pages/PlanningPage';

// ===============================================================
// 1. Sprint 計画ダイアログ (表示のみ / 非破壊)
// ===============================================================

test.describe('Sprint 計画ダイアログ', () => {
  test('plan-next-sprint がある場合: ダイアログ表示 → 入力値プリフィル確認 → キャンセル', async ({ authedPage }) => {
    const planning = new PlanningPage(authedPage);
    await planning.open();

    // nextPlanned スプリントが無い環境ではボタンが表示されない → skip
    const btnCount = await planning.planNextSprintBtn.count();
    if (btnCount === 0) {
      test.skip(true, 'plan-next-sprint ボタンが存在しない (nextPlanned スプリントなし) — skip');
      return;
    }

    await planning.planNextSprintBtn.click();
    await expect(planning.sprintDialog).toBeVisible({ timeout: 10_000 });

    // goal / start / end がプリフィルされていること (空文字以外または日付形式 YYYY-MM-DD が入っている)
    // goal は nextPlanned.goal から来るが「スプリントゴールが設定されていません」の場合は空にセットされる
    const goalValue = await planning.sprintGoalInput.inputValue();
    const startValue = await planning.sprintStartInput.inputValue();
    const endValue = await planning.sprintEndInput.inputValue();

    // start / end は YYYY-MM-DD 形式の日付文字列が入っているはず
    expect(startValue, 'sprint-start-input がプリフィルされていない').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endValue, 'sprint-end-input がプリフィルされていない').toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // goal は空文字か任意の文字列 (自動生成スプリントの空 goal は openSprintDialog で空のまま)
    // → 型的に string であることだけ確認 (空文字 OK)
    expect(typeof goalValue).toBe('string');

    // name 入力欄もプリフィルされている (string、空 OK)
    expect(typeof (await planning.sprintNameInput.inputValue())).toBe('string');

    // ★ キャンセル: × ボタンで閉じる (保存・開始ボタンは押さない)
    await planning.sprintCloseBtn.click();
    await expect(planning.sprintDialog).toBeHidden({ timeout: 5_000 });
  });

  test('edit-current-sprint がある場合: 現スプリント編集ダイアログ表示 → プリフィル → キャンセル', async ({ authedPage }) => {
    const planning = new PlanningPage(authedPage);
    await planning.open();

    // activeSprint が無い環境ではボタンが表示されない → skip (常時稼働化で通常は存在する)
    const btnCount = await planning.editCurrentSprintBtn.count();
    if (btnCount === 0) {
      test.skip(true, 'edit-current-sprint ボタンが存在しない (activeSprint なし) — skip');
      return;
    }

    await planning.editCurrentSprintBtn.click();
    await expect(planning.sprintDialog).toBeVisible({ timeout: 10_000 });

    // current の name / goal / 期間がプリフィル (start/end は YYYY-MM-DD)
    const startValue = await planning.sprintStartInput.inputValue();
    const endValue = await planning.sprintEndInput.inputValue();
    expect(startValue, 'sprint-start-input がプリフィルされていない').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endValue, 'sprint-end-input がプリフィルされていない').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof (await planning.sprintNameInput.inputValue())).toBe('string');

    // 現スプリント編集モードには「開始」ボタンが無い (sprint-start は next 専用) — 破壊操作を防ぐ
    await expect(planning.sprintStartBtn).toHaveCount(0);

    // ★ キャンセル: × ボタンで閉じる (保存は押さない)
    await planning.sprintCloseBtn.click();
    await expect(planning.sprintDialog).toBeHidden({ timeout: 5_000 });
  });
});

// ===============================================================
// 2. Pull from backlog ダイアログ (表示のみ / 非破壊)
// ===============================================================

test.describe('Pull from backlog ダイアログ', () => {
  test('pull-from-backlog クリック → ダイアログ表示 → 行選択でハイライト → キャンセル', async ({ authedPage }) => {
    const planning = new PlanningPage(authedPage);
    await planning.open();

    // activeSprint が無い場合はボタンが disabled → ダイアログを開けないため skip
    const isDisabled = await planning.pullFromBacklogBtn.isDisabled();
    if (isDisabled) {
      test.skip(true, 'pull-from-backlog ボタンが disabled (activeSprint なし) — skip');
      return;
    }

    await planning.pullFromBacklogBtn.click();
    await expect(planning.pullDialog).toBeVisible({ timeout: 10_000 });

    // バックログ行が 1 件以上ある場合のみ「選択ハイライト」を確認
    const rowCount = await planning.allPullRows().count();
    if (rowCount > 0) {
      const firstRow = planning.allPullRows().first();

      // 選択前: pull-row--selected クラスが付いていないこと
      await expect(firstRow).not.toHaveClass(/pull-row--selected/);

      // クリックで選択
      await firstRow.click();

      // 選択後: pull-row--selected クラスが付くこと
      // aria 対応が無い場合は class 変化で判定 (RetroScreen の pull-row--selected)
      await expect(firstRow).toHaveClass(/pull-row--selected/, { timeout: 5_000 });

      // もう一度クリックで選択解除
      await firstRow.click();
      await expect(firstRow).not.toHaveClass(/pull-row--selected/, { timeout: 5_000 });
    }
    // バックログが空の場合も「バックログにチケットがありません。」の表示は OK (assert 不要 — 表示されるだけ)

    // ★ キャンセル: × ボタンで閉じる (pull-submit は押さない)
    await planning.pullCloseBtn.click();
    await expect(planning.pullDialog).toBeHidden({ timeout: 5_000 });
  });
});
