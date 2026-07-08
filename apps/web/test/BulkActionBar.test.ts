// BulkActionBar component unit test (T1b)。
//
// 検証対象は「配線」と「座標計算の純粋関数」:
// - F-18: 一括削除の 2 段階確認 (window.confirm 廃止 → armed 状態 + 自動解除)。
//   native confirm はブラウザ自動化を塞ぎ、アプリ内確認 UI とも不統一のため使わない。
// - F-29: メニュー / フライアウトの <Teleport to="body"> + position:fixed 化。
//   祖先 .screen-body { overflow: hidden } のクリップでビューポート下端のサブメニューが
//   見切れてクリック不能になるバグの根治。座標計算 (下端フリップ / 右端フリップ) は
//   純粋関数 computeMenuPosition / computeFlyoutPosition を直接テストで固定する。
// 見た目 CSS は対象外 (スクショ目視 / 実機)。
//
// メニューは Teleport で document.body 配下に出るため、要素検索は
// wrapper → document.body の順で探す q() ヘルパで両対応にする。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { DOMWrapper, flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import BulkActionBar, { computeMenuPosition, computeFlyoutPosition } from '~/components/BulkActionBar.vue';

type Mounted = Awaited<ReturnType<typeof mountSuspended>>;
let wrapper: Mounted | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountBar(count = 3): Promise<Mounted> {
  wrapper = await mountSuspended(BulkActionBar, {
    props: { count, members: [], sprints: [], busy: false },
  });
  return wrapper;
}

/** wrapper 内 → document.body (Teleport 先) の順で探す。 */
function q(sel: string) {
  const w = wrapper!.find(sel);
  if (w.exists()) return w;
  return new DOMWrapper(document.body).find(sel);
}

async function openMenu(): Promise<void> {
  await wrapper!.find('[data-testid="bulk-kebab"]').trigger('click');
  await flushPromises(); // メニュー座標計測 (nextTick) を消化
}

describe('BulkActionBar 一括削除の 2 段階確認 (F-18)', () => {
  it('1 回目のクリックでは remove を emit せず armed 表示になる (window.confirm 不使用)', async () => {
    // happy-dom は window.confirm を実装しない (= native confirm がテスト/自動化を塞ぐ証左)。
    // スタブして「呼ばれないこと」を検証する。
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    await mountBar(3);
    await openMenu();

    const del = q('[data-testid="bulk-delete"]');
    expect(del.exists()).toBe(true);
    expect(del.text()).toContain('3 件を削除');

    await del.trigger('click');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(wrapper!.emitted('remove')).toBeUndefined();
    // armed 表示に変わり、メニューは開いたまま (2 回目を押せる)
    expect(q('[data-testid="bulk-delete"]').text()).toContain('削除する (3件)');
    expect(q('[data-testid="bulk-delete"]').text()).toContain('もう一度押して確定');
    expect(q('[data-testid="bulk-menu"]').exists()).toBe(true);
  });

  it('armed 中の 2 回目のクリックで remove を emit し、メニューを閉じる', async () => {
    await mountBar(3);
    await openMenu();

    await q('[data-testid="bulk-delete"]').trigger('click'); // arm
    await q('[data-testid="bulk-delete"]').trigger('click'); // 確定
    expect(wrapper!.emitted('remove')).toHaveLength(1);
    expect(q('[data-testid="bulk-menu"]').exists()).toBe(false);
  });

  it('armed は数秒で自動解除され、その後のクリックも 1 回目扱い (誤爆防止)', async () => {
    await mountBar(3);
    await openMenu();

    vi.useFakeTimers();
    await q('[data-testid="bulk-delete"]').trigger('click'); // arm
    expect(q('[data-testid="bulk-delete"]').text()).toContain('もう一度押して確定');

    vi.advanceTimersByTime(3100); // 自動解除
    await wrapper!.vm.$nextTick();
    expect(q('[data-testid="bulk-delete"]').text()).toContain('3 件を削除');
    expect(q('[data-testid="bulk-delete"]').text()).not.toContain('もう一度押して確定');

    await q('[data-testid="bulk-delete"]').trigger('click'); // 解除後は再び arm (emit しない)
    expect(wrapper!.emitted('remove')).toBeUndefined();
  });

  it('メニューを閉じると armed が解除される (再オープン時に 1 回目から)', async () => {
    await mountBar(2);
    await openMenu();

    await q('[data-testid="bulk-delete"]').trigger('click'); // arm
    await q('[data-testid="bulk-backdrop"]').trigger('click'); // メニュー外クリックで閉じる
    await openMenu();
    expect(q('[data-testid="bulk-delete"]').text()).toContain('2 件を削除');
    expect(q('[data-testid="bulk-delete"]').text()).not.toContain('もう一度押して確定');
    expect(wrapper!.emitted('remove')).toBeUndefined();
  });
});

// ===== F-29: 座標計算の純粋関数 (下端 / 右端 / 通常) =====

describe('computeMenuPosition — kebab トリガー矩形からメニュー fixed 座標 (F-29)', () => {
  const vp = { width: 1280, height: 800 };
  const menu = { width: 200, height: 300 };

  it('通常: トリガー右端に右揃えで、下に gap を空けて出す', () => {
    const trigger = { top: 100, left: 800, right: 828, bottom: 128 };
    expect(computeMenuPosition(trigger, menu, vp)).toEqual({ top: 134, left: 628 });
  });

  it('下端: 下に収まらないときは上方向へフリップ', () => {
    const trigger = { top: 652, left: 800, right: 828, bottom: 680 };
    expect(computeMenuPosition(trigger, menu, vp)).toEqual({ top: 346, left: 628 });
  });

  it('左端: 右揃えで左にはみ出すときは margin にクランプ', () => {
    const trigger = { top: 100, left: 122, right: 150, bottom: 128 };
    expect(computeMenuPosition(trigger, menu, vp)).toEqual({ top: 134, left: 8 });
  });

  it('退化: 上下どちらにも収まらないビューポートでは margin に張り付く (負にしない)', () => {
    const trigger = { top: 100, left: 800, right: 828, bottom: 128 };
    expect(computeMenuPosition(trigger, menu, { width: 1280, height: 200 })).toEqual({ top: 8, left: 628 });
  });
});

describe('computeFlyoutPosition — 親項目矩形からフライアウト fixed 座標 (F-29)', () => {
  const vp = { width: 1280, height: 800 };
  const fly = { width: 160, height: 180 };

  it('通常: 親項目の右横に、親項目と同じ top で出す', () => {
    const item = { top: 200, left: 900, right: 1100, bottom: 236 };
    expect(computeFlyoutPosition(item, fly, vp)).toEqual({ top: 200, left: 1100 });
  });

  it('右端: 右に収まらないときは左横へフリップ', () => {
    const item = { top: 200, left: 1040, right: 1200, bottom: 236 };
    expect(computeFlyoutPosition(item, fly, vp)).toEqual({ top: 200, left: 880 });
  });

  it('下端: 下に収まらないときはビューポート内に収まるまで上方向へシフト', () => {
    const item = { top: 700, left: 900, right: 1100, bottom: 736 };
    expect(computeFlyoutPosition(item, fly, vp)).toEqual({ top: 612, left: 1100 });
  });

  it('退化: 極小ビューポートでも座標は margin を下回らない (負にしない)', () => {
    const item = { top: 60, left: 200, right: 280, bottom: 96 };
    expect(computeFlyoutPosition(item, fly, { width: 300, height: 100 })).toEqual({ top: 8, left: 40 });
  });
});

// ===== F-29: Teleport + fixed 配線 =====

describe('BulkActionBar メニュー / フライアウトの Teleport 配線 (F-29)', () => {
  it('メニューは document.body 直下に Teleport され position:fixed で出る', async () => {
    await mountBar(3);
    await openMenu();

    const menu = document.querySelector('[data-testid="bulk-menu"]') as HTMLElement | null;
    expect(menu).toBeTruthy();
    // .screen-body { overflow: hidden } にクリップされないよう body 直下 + fixed
    expect(menu!.parentElement).toBe(document.body);
    expect(menu!.style.position).toBe('fixed');
  });

  it('親項目クリックでフライアウトが fixed で開き、値クリックで emit + メニューを閉じる', async () => {
    await mountBar(3);
    await openMenu();

    await q('[data-testid="bulk-set-status"]').trigger('click');
    await flushPromises();
    const fly = document.querySelector('[data-testid="bulk-flyout"]') as HTMLElement | null;
    expect(fly).toBeTruthy();
    expect(fly!.style.position).toBe('fixed');

    await q('[data-testid="bulk-status-done"]').trigger('click');
    expect(wrapper!.emitted('setStatus')).toEqual([['done']]);
    expect(document.querySelector('[data-testid="bulk-menu"]')).toBeNull();
  });

  it('親項目 hover (mouseenter) でもフライアウトが開き、mouseleave で閉じる', async () => {
    await mountBar(3);
    await openMenu();

    const wrapEl = q('[data-testid="bulk-set-priority"]').element.parentElement!;
    await new DOMWrapper(wrapEl).trigger('mouseenter');
    await flushPromises();
    expect(document.querySelector('[data-testid="bulk-priority-high"]')).toBeTruthy();

    await new DOMWrapper(wrapEl).trigger('mouseleave');
    expect(document.querySelector('[data-testid="bulk-priority-high"]')).toBeNull();
  });
});
