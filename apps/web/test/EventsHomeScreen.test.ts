// EventsHomeScreen component unit test (T1b / WC-cba82df1)。
// events ホームが current sprint の ステータス別件数 と 停滞チケット(3日以上 DOING)を出すことを固定する。
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket, Status, Epic } from '@belvedere/shared';
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

// Epics (Home Epic インライン編集): epics 一覧 + 更新スパイ。テストで epicsRef を差し替える。
const epicsRef = ref<Epic[]>([]);
const updateEpicSpy = vi.fn((_id: string, _patch: Record<string, unknown>) => Promise.resolve(true));
mockNuxtImport('useEpics', () => () => ({ epics: epicsRef, updateEpic: updateEpicSpy }));

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

describe('EventsHomeScreen Epics 編集 (Home Epic インライン編集)', () => {
  const epic = (over: Partial<Epic> & { id: string }): Epic => ({
    workspaceId: 'ws', name: over.id, status: 'active', createdAt: '2026-06-01T00:00:00Z', ...over,
  });

  it('admin/po は編集ボタンが出て、編集→保存で updateEpic(trim済/status含む全5項目) を呼ぶ', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'po', productGoal: '' };
    epicsRef.value = [epic({ id: 'EP-1', name: '旧名', rationale: '旧意図' })];
    updateEpicSpy.mockClear();
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    await wrapper.find('[data-testid=epic-edit-EP-1]').trigger('click');
    await wrapper.find('[data-testid=epic-name-input-EP-1]').setValue('  新Epic名  ');
    await wrapper.find('[data-testid=epic-rationale-input-EP-1]').setValue(' 新意図 ');
    await wrapper.find('[data-testid=epic-save-EP-1]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(updateEpicSpy).toHaveBeenCalledWith('EP-1', {
      name: '新Epic名', rationale: '新意図', successMetric: '', strategicTheme: '', status: 'active',
    });
  });

  it('Epic 名を空にすると保存ボタンが disabled (name 必須)', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '' };
    epicsRef.value = [epic({ id: 'EP-1', name: '名前あり' })];
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    await wrapper.find('[data-testid=epic-edit-EP-1]').trigger('click');
    await wrapper.find('[data-testid=epic-name-input-EP-1]').setValue('   ');
    expect((wrapper.find('[data-testid=epic-save-EP-1]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('dev は Epic 編集ボタンが出ない (epic.write は po/admin のみ)', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'dev', productGoal: '' };
    epicsRef.value = [epic({ id: 'EP-1', name: 'X' })];
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=epic-edit-EP-1]').exists()).toBe(false);
  });

  it('Epic が無ければプレースホルダを出す', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '' };
    epicsRef.value = [];
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=epics-empty]').exists()).toBe(true);
  });

  it('完了 (completed) / 中止 (cancelled) の Epic は一覧から除外する (2026-07-08 要望)', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '' };
    epicsRef.value = [
      epic({ id: 'EP-active', status: 'active' }),
      epic({ id: 'EP-planned', status: 'planned' }),
      epic({ id: 'EP-done', status: 'completed' }),
      epic({ id: 'EP-cancelled', status: 'cancelled' }),
    ];
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=epic-row-EP-active]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=epic-row-EP-planned]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=epic-row-EP-done]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=epic-row-EP-cancelled]').exists()).toBe(false);
    // ヘッダ件数も可視分だけ (4 件中 2 件)。
    expect(wrapper.find('[data-testid=ehome-epics] .ehome-sp').text()).toContain('2 epics');
  });

  it('全 Epic が完了/中止で可視 0 件ならプレースホルダを出す', async () => {
    wsCurrent.value = { id: 'ws', name: 'W', role: 'admin', productGoal: '' };
    epicsRef.value = [epic({ id: 'EP-done', status: 'completed' }), epic({ id: 'EP-cancelled', status: 'cancelled' })];
    const wrapper = await mountSuspended(EventsHomeScreen, { props: { tickets: [], selectedId: null } });
    expect(wrapper.find('[data-testid=epics-empty]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=epic-row-EP-done]').exists()).toBe(false);
  });
});
