// PlanningScreen の SMART 実評価 配線テスト (WC-14 / 旧 WC-2665bb65)。
// 重い子 SprintSectionedList は stub し、SMART 行の「未評価→neutral / ボタンで evaluate 呼出 /
// verdict 反映で ok/weak + note 表示」だけを検証する (採点ロジックは handler/mock テストが担う)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// mock の activeSprint goal (useSprints モック) と一致させる。
const MOCK_GOAL = '決済MVPを完成させる';
const fullVerdict = (goal: string) => ({
  goal, summary: '弱い観点: M',
  criteria: [
    { letter: 'S', name: 'Specific', ok: true, note: 'ok' },
    { letter: 'M', name: 'Measurable', ok: false, note: '完了率%を追加しましょう' },
    { letter: 'A', name: 'Attainable', ok: true, note: 'ok' },
    { letter: 'R', name: 'Relevant', ok: true, note: 'ok' },
    { letter: 'T', name: 'Time-bound', ok: true, note: 'ok' },
  ],
});

describe('PlanningScreen SMART 実評価 (WC-14)', () => {
  beforeEach(() => { verdictRef.value = null; evaluateSpy.mockClear(); });

  it('未評価時は 5 セルが neutral (— 表示)', async () => {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    for (const l of ['S', 'M', 'A', 'R', 'T']) {
      const cell = wrapper.find(`[data-testid=smart-cell-${l}]`);
      expect(cell.exists()).toBe(true);
      expect(cell.classes()).toContain('neutral');
    }
    expect(wrapper.find('[data-testid=smart-notes]').exists()).toBe(false);
  });

  it('目的説明 (smart-explain) が常に表示される (WC-14: 使い方が分からない対策)', async () => {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    expect(wrapper.find('[data-testid=smart-explain]').exists()).toBe(true);
  });

  it('A案: goal があり未評価なら mount 時に自動評価する', async () => {
    // verdictRef=null (beforeEach) + activeSprint.goal あり → onMounted で evaluate。
    await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });

  it('A案: 同じ goal を評価済なら mount 時は呼ばない (キャッシュ表示)', async () => {
    verdictRef.value = fullVerdict(MOCK_GOAL); // 現在の goal と一致する verdict を持つ
    await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it('「再評価」ボタンで evaluate を呼ぶ (mount 時の自動評価とは別に手動でも)', async () => {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    evaluateSpy.mockClear(); // mount 時の自動評価を除外し、クリック分だけを見る
    await wrapper.find('[data-testid=smart-eval-btn]').trigger('click');
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });

  it('verdict があると ok/weak が反映され、弱い観点の note が出る', async () => {
    verdictRef.value = fullVerdict(MOCK_GOAL);
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    expect(wrapper.find('[data-testid=smart-cell-M]').classes()).toContain('weak');
    expect(wrapper.find('[data-testid=smart-cell-S]').classes()).toContain('ok');
    const notes = wrapper.find('[data-testid=smart-notes]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain('完了率%を追加しましょう');
    expect(notes.text()).toContain('弱い観点: M');
  });
});
