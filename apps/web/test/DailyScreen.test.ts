// DailyScreen component unit test (T1b)。
// WC-676a53e1: Daily は現スプリントの status=backlog チケットを「未着手」列で表示し、
// 表示集合が Planning CURRENT (active sprint の全チケット) と一致することを固定する。
// (この列が無いと backlog 状態が Daily で消え Planning と件数が食い違う = 報告バグ)。
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

describe('DailyScreen 未着手列 (WC-676a53e1)', () => {
  it('現スプリントの status=backlog も「未着手」列に出て、全チケットが表示される', async () => {
    const wrapper = await mountSuspended(DailyScreen, {
      props: { tickets: [t('WC-B', 'backlog'), t('WC-T', 'todo'), t('WC-D', 'done')], selectedId: null },
    });
    // 未着手 (backlog) 列が存在し、backlog 状態カードを含む
    expect(wrapper.find('[data-testid=daily-col-backlog]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=daily-card-WC-B]').exists()).toBe(true);
    // active sprint の全 3 枚が描画される (= Planning CURRENT と一致)
    expect(wrapper.findAll('[data-testid^=daily-card-]').length).toBe(3);
  });

  it('別スプリント / 未割当のチケットは Daily に出ない (active sprint スコープ)', async () => {
    const other: Ticket = { ...t('WC-X', 'backlog'), sprintId: 's-other' };
    const wrapper = await mountSuspended(DailyScreen, {
      props: { tickets: [t('WC-B', 'backlog'), other], selectedId: null },
    });
    expect(wrapper.find('[data-testid=daily-card-WC-B]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=daily-card-WC-X]').exists()).toBe(false);
  });
});
