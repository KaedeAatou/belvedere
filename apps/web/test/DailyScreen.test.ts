// DailyScreen component unit test (T1b)。
// WC-676a53e1: Daily は current sprint の作業ボード (todo/in-progress/review/done の 4 列)。
// backlog 状態は「スプリント未所属」を意味し current には存在しない不変条件 (API が保証) なので
// backlog 列は持たない。Daily の表示集合 = current sprint の全チケット = Planning CURRENT に一致する。
import { describe, it, expect } from 'vitest';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket, Status } from '@belvedere/shared';
import DailyScreen from '~/components/screens/DailyScreen.vue';

mockNuxtImport('useSprints', () => () => ({
  activeSprint: { value: { id: 's-active', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-15T00:00:00Z' } },
  velocityHistory: { value: [] },
}));
mockNuxtImport('useFindings', () => () => ({ findingsFor: () => [] }));

const t = (id: string, status: Status): Ticket => ({
  id,
  workspaceId: 'ws-belvedere',
  title: id,
  status,
  priority: 'medium',
  sprintId: 's-active',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
});

describe('DailyScreen (current のみ / backlog 列なし) WC-676a53e1', () => {
  it('current sprint のチケットを 4 列で表示し backlog 列は持たない', async () => {
    const wrapper = await mountSuspended(DailyScreen, {
      props: { tickets: [t('WC-T', 'todo'), t('WC-D', 'done')], selectedId: null },
    });
    // current に backlog 状態は存在しない不変条件 → backlog 列は無い
    expect(wrapper.find('[data-testid=daily-col-backlog]').exists()).toBe(false);
    // 4 列は存在する
    expect(wrapper.find('[data-testid=daily-col-todo]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=daily-col-done]').exists()).toBe(true);
    // current の todo/done チケットは表示
    expect(wrapper.find('[data-testid=daily-card-WC-T]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=daily-card-WC-D]').exists()).toBe(true);
  });

  it('別スプリント / 未割当のチケットは Daily に出ない (current スコープ)', async () => {
    const other: Ticket = { ...t('WC-X', 'todo'), sprintId: 's-other' };
    const wrapper = await mountSuspended(DailyScreen, {
      props: { tickets: [t('WC-T', 'todo'), other], selectedId: null },
    });
    expect(wrapper.find('[data-testid=daily-card-WC-T]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=daily-card-WC-X]').exists()).toBe(false);
  });
});
