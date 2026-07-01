// PlanningScreen の SMART 実評価 配線テスト (WC-14 / 旧 WC-2665bb65)。
// 重い子 SprintSectionedList は stub し、SMART 行の「未評価→neutral / ボタンで evaluate 呼出 /
// verdict 反映で ok/weak + note 表示」だけを検証する (採点ロジックは handler/mock テストが担う)。
import { describe, it, expect, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import PlanningScreen from '~/components/screens/PlanningScreen.vue';

type Verdict = { goal: string; criteria: { letter: string; name: string; ok: boolean; note: string }[]; summary?: string };
// mockNuxtImport の factory は遅延実行 (mount 時) なので、モジュールレベルの ref/spy を安全に参照できる。
// vi.hoisted 内で ref() を呼ぶと import 前 (TDZ) で落ちるため、ここでは vi.hoisted を使わない。
const verdictRef: Ref<Verdict | null> = ref(null);
const evaluateSpy = vi.fn(() => Promise.resolve());

mockNuxtImport('useSprints', () => () => ({
  sprints: ref([]), velocityHistory: ref([]),
  activeSprint: ref({ id: 's-active', goal: '決済MVPを完成させる' }),
  nextPlanned: ref(null), currentLabel: ref('Sprint 1'), nextLabel: ref('Next'),
  patchSprint: vi.fn(), startSprint: vi.fn(),
}));
mockNuxtImport('useTickets', () => () => ({ tickets: ref([]), patchTicket: vi.fn() }));
mockNuxtImport('useMembers', () => () => ({ members: ref([]) }));
mockNuxtImport('useSprintSections', () => () => ({ current: ref([]), next: ref([]), backlog: ref([]) }));
mockNuxtImport('useSmartEval', () => () => ({
  verdict: verdictRef, loading: ref(false), error: ref(null), evaluate: evaluateSpy,
}));

const mountOpts = { global: { stubs: { SprintSectionedList: true } } };

describe('PlanningScreen SMART 実評価 (WC-14)', () => {
  it('未評価時は 5 セルが neutral (— 表示)', async () => {
    verdictRef.value = null;
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    for (const l of ['S', 'M', 'A', 'R', 'T']) {
      const cell = wrapper.find(`[data-testid=smart-cell-${l}]`);
      expect(cell.exists()).toBe(true);
      expect(cell.classes()).toContain('neutral');
    }
    expect(wrapper.find('[data-testid=smart-notes]').exists()).toBe(false);
  });

  it('「AI で評価」ボタンで evaluate を呼ぶ', async () => {
    evaluateSpy.mockClear();
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=smart-eval-btn]').trigger('click');
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });

  it('verdict があると ok/weak が反映され、弱い観点の note が出る', async () => {
    verdictRef.value = {
      goal: '決済MVP', summary: '弱い観点: M',
      criteria: [
        { letter: 'S', name: 'Specific', ok: true, note: 'ok' },
        { letter: 'M', name: 'Measurable', ok: false, note: '完了率%を追加しましょう' },
        { letter: 'A', name: 'Attainable', ok: true, note: 'ok' },
        { letter: 'R', name: 'Relevant', ok: true, note: 'ok' },
        { letter: 'T', name: 'Time-bound', ok: true, note: 'ok' },
      ],
    };
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    expect(wrapper.find('[data-testid=smart-cell-M]').classes()).toContain('weak');
    expect(wrapper.find('[data-testid=smart-cell-S]').classes()).toContain('ok');
    const notes = wrapper.find('[data-testid=smart-notes]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain('完了率%を追加しましょう');
    expect(notes.text()).toContain('弱い観点: M');
  });
});
