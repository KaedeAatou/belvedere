// BulkActionBar component unit test (T1b)。
//
// 検証対象は「配線」:
// - F-18: 一括削除の 2 段階確認 (window.confirm 廃止 → armed 状態 + 自動解除)。
//   native confirm はブラウザ自動化を塞ぎ、アプリ内確認 UI とも不統一のため使わない。
// 見た目 CSS は対象外 (スクショ目視 / 実機)。
//
// メニューはビューポート下端クリップ対策 (F-29) で <Teleport to="body"> 配下に出る想定が
// あるため、要素検索は wrapper → document.body の順で探す q() ヘルパで両対応にする。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { DOMWrapper, flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import BulkActionBar from '~/components/BulkActionBar.vue';

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
