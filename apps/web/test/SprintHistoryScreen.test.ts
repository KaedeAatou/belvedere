// SprintHistoryScreen の Try 表示 配線テスト (WC-32 / 2026-07-06)。
// 展開したスプリントの Retro Try を sprintNumber で突合して出すか / 無ければ出さないかを検証する。

import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Sprint, RetroTry } from '@belvedere/shared';
import SprintHistoryScreen from '~/components/screens/SprintHistoryScreen.vue';

const completedRef = ref<Sprint[]>([]);
const triesRef = ref<RetroTry[]>([]);
mockNuxtImport('useSprints', () => () => ({
  completedSprints: completedRef,
  sprintLabel: (s: { name?: string } | null, _sfx = '', fb = '') => (s?.name?.trim() || fb),
}));
mockNuxtImport('useRetroTries', () => () => ({ tries: triesRef, fetchTries: vi.fn() }));
mockNuxtImport('useFindings', () => () => ({ findingsFor: () => [] }));

const sprint = (over: Partial<Sprint> & { id: string; number: number }): Sprint => ({
  workspaceId: 'ws', startsAt: '2026-01-01T00:00:00+09:00', endsAt: '2026-01-14T23:59:59+09:00',
  goal: 'g', capacity: 0, status: 'completed', ...over,
});
const tryItem = (over: Partial<RetroTry> & { id: string; sprintNumber: number }): RetroTry => ({
  workspaceId: 'ws', text: over.id, done: false, createdAt: '2026-01-01T00:00:00Z', createdBy: 'u', ...over,
});

describe('SprintHistoryScreen — Try 表示 (WC-32)', () => {
  it('展開したスプリントの Try を sprintNumber で突合して表示する (他 sprint の Try は出さない)', async () => {
    completedRef.value = [sprint({ id: 'S2', number: 2 })];
    triesRef.value = [
      tryItem({ id: 'T1', sprintNumber: 2, text: 'AC に期日を書く' }),
      tryItem({ id: 'T2', sprintNumber: 3, text: '別スプリントの Try' }),
    ];
    const wrapper = await mountSuspended(SprintHistoryScreen, { props: { tickets: [], selectedId: null } });
    await wrapper.find('[data-testid="sh-sprint-S2"]').trigger('click');
    expect(wrapper.find('[data-testid="sh-tries"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sh-try-T1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('AC に期日を書く');
    expect(wrapper.find('[data-testid="sh-try-T2"]').exists()).toBe(false);
  });

  it('Try が無いスプリントでは Try セクションを出さない', async () => {
    completedRef.value = [sprint({ id: 'S5', number: 5 })];
    triesRef.value = [];
    const wrapper = await mountSuspended(SprintHistoryScreen, { props: { tickets: [], selectedId: null } });
    await wrapper.find('[data-testid="sh-sprint-S5"]').trigger('click');
    expect(wrapper.find('[data-testid="sh-tries"]').exists()).toBe(false);
  });
});
