// EventsHomeScreen component unit test (T1b / WC-cba82df1)。
// events ホームが current sprint の ステータス別件数 と 停滞チケット(3日以上 DOING)を出すことを固定する。
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket, Status } from '@belvedere/shared';
import EventsHomeScreen from '~/components/screens/EventsHomeScreen.vue';

mockNuxtImport('useSprints', () => () => ({
  activeSprint: { value: { id: 's-active', goal: 'ゴール', startsAt: '2026-06-25T00:00:00Z', endsAt: '2026-07-09T00:00:00Z' } },
  nextPlanned: { value: null },
  velocityHistory: { value: [] },
  currentLabel: { value: 'Sprint 1' },
}));

// Product Goal (WC-23): current ws + 更新スパイ。テストで role / productGoal を差し替える。
const wsCurrent = ref<{ id: string; name: string; role: string; productGoal: string }>(
  { id: 'ws', name: 'W', role: 'admin', productGoal: '決済MVPを本番リリース' },
);
const updateGoalSpy = vi.fn((_g: string) => Promise.resolve(true));
mockNuxtImport('useWorkspaces', () => () => ({ current: wsCurrent, updateProductGoal: updateGoalSpy }));

const t = (id: string, status: Status, over: Partial<Ticket> = {}): Ticket => ({
  id, workspaceId: 'ws-belvedere', title: id, status, priority: 'medium', sprintId: 's-active',
  createdAt: '2026-06-25T00:00:00Z', updatedAt: '2026-06-25T00:00:00Z', createdBy: 'human', ...over,
});

describe('EventsHomeScreen (WC-cba82df1)', () => {
  it('current sprint のステータス別件数を出す', async () => {
    const wrapper = await mountSuspended(EventsHomeScreen, {
      props: { tickets: [t('A', 'todo'), t('B', 'done'), t('C', 'done')], selectedId: null },
    });
    expect(wrapper.find('[data-testid=events-home]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=ehome-count-todo]').text()).toContain('1');
    expect(wrapper.find('[data-testid=ehome-count-done]').text()).toContain('2');
  });

  it('3 日以上 DOING の停滞チケットを出す / 新しい DOING は出さない', async () => {
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const fresh = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const wrapper = await mountSuspended(EventsHomeScreen, {
      props: { tickets: [t('S', 'in-progress', { startedAt: old }), t('F', 'in-progress', { startedAt: fresh })], selectedId: null },
    });
    expect(wrapper.find('[data-testid=ehome-stalled-S]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=ehome-stalled-F]').exists()).toBe(false);
  });
});

describe('EventsHomeScreen Product Goal (WC-23)', () => {
  it('Product Goal を表示する', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '決済MVPを本番リリース' };
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=ehome-product-goal]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=pg-text]').text()).toContain('決済MVPを本番リリース');
  });

  it('admin/po は編集ボタンが出て、編集→保存で updateProductGoal(trim済) を呼ぶ', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'po', productGoal: '旧ゴール' };
    updateGoalSpy.mockClear();
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    await wrapper.find('[data-testid=pg-edit]').trigger('click');
    await wrapper.find('[data-testid=pg-input]').setValue('  新しい到達点  ');
    await wrapper.find('[data-testid=pg-save]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(updateGoalSpy).toHaveBeenCalledWith('新しい到達点');
  });

  it('dev は編集ボタンが出ない (product.goal は po/admin のみ)', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'dev', productGoal: 'ゴール' };
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=pg-edit]').exists()).toBe(false);
  });

  it('productGoal 空なら未設定プレースホルダを出す', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '' };
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=pg-empty]').exists()).toBe(true);
  });
});
