// PlanningScreen の SMART 実評価 配線テスト (WC-14 / 旧 WC-2665bb65)。
// 重い子 SprintSectionedList は stub し、SMART 行の「未評価→neutral / ボタンで evaluate 呼出 /
// verdict 反映で ok/weak + note 表示」だけを検証する (採点ロジックは handler/mock テストが担う)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import PlanningScreen from '~/components/screens/PlanningScreen.vue';
import type { Ticket } from '@belvedere/shared';

type Verdict = { goal: string; criteria: { letter: string; name: string; ok: boolean; note: string }[]; summary?: string };
// mockNuxtImport の factory は遅延実行 (mount 時) なので、モジュールレベルの ref/spy を安全に参照できる。
// vi.hoisted 内で ref() を呼ぶと import 前 (TDZ) で落ちるため、ここでは vi.hoisted を使わない。
const verdictRef: Ref<Verdict | null> = ref(null);
const evaluateSpy = vi.fn(() => Promise.resolve());
// WC-30: 持ち越しテスト用に可変化する (既存 SMART テストは既定値のままで不変)。
const startSprintSpy = vi.fn<(id: string, body: Record<string, unknown>) => Promise<void>>(() => Promise.resolve());
const nextPlannedRef = ref<Record<string, unknown> | null>(null);
const activeSprintRef = ref<Record<string, unknown> | null>({ id: 's-active', goal: '決済MVPを完成させる' });

mockNuxtImport('useSprints', () => () => ({
  sprints: ref([]), velocityHistory: ref([]),
  activeSprint: activeSprintRef,
  nextPlanned: nextPlannedRef, currentLabel: ref('Sprint 1'), nextLabel: ref('Next'),
  patchSprint: vi.fn(), startSprint: startSprintSpy,
}));
// F-08: Pull from backlog の投入先テストで patch 引数を見るためモジュールレベル spy にする。
const patchTicketSpy = vi.fn((_id: string, _patch: Record<string, unknown>) =>
  Promise.resolve<{ id: string } | null>({ id: _id }));
mockNuxtImport('useTickets', () => () => ({ tickets: ref([]), patchTicket: patchTicketSpy }));
mockNuxtImport('useMembers', () => () => ({ members: ref([]) }));
mockNuxtImport('useSprintSections', () => () => ({ current: ref([]), next: ref([]), backlog: ref([]) }));
mockNuxtImport('useSmartEval', () => () => ({
  verdict: verdictRef, loading: ref(false), error: ref(null), evaluate: evaluateSpy,
}));
mockNuxtImport('useWorkspaces', () => () => ({
  current: ref({ id: 'ws', name: 'W', role: 'admin', productGoal: '決済基盤を本番リリースする' }),
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
    await wrapper.find('[data-testid=smart-toggle]').trigger('click'); // SMART は既定折りたたみ → 展開
    for (const l of ['S', 'M', 'A', 'R', 'T']) {
      const cell = wrapper.find(`[data-testid=smart-cell-${l}]`);
      expect(cell.exists()).toBe(true);
      expect(cell.classes()).toContain('neutral');
    }
    expect(wrapper.find('[data-testid=smart-notes]').exists()).toBe(false);
  });

  it('SMART を展開すると目的説明 (smart-explain) が表示される (WC-14)', async () => {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=smart-toggle]').trigger('click');
    expect(wrapper.find('[data-testid=smart-explain]').exists()).toBe(true);
  });

  it('Product Goal を読み取り専用で表示する (WC-23 / 編集は Home)', async () => {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    const pg = wrapper.find('[data-testid=planning-product-goal]');
    expect(pg.exists()).toBe(true);
    expect(pg.text()).toContain('決済基盤を本番リリースする');
    // 編集手段 (input/button) は Planning には無い (Home 専用)。
    expect(pg.find('textarea').exists()).toBe(false);
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
    await wrapper.find('[data-testid=smart-toggle]').trigger('click'); // 展開して再評価ボタンを出す
    evaluateSpy.mockClear(); // mount 時の自動評価を除外し、クリック分だけを見る
    await wrapper.find('[data-testid=smart-eval-btn]').trigger('click');
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });

  it('verdict があると ok/weak が反映され、弱い観点の note が出る', async () => {
    verdictRef.value = fullVerdict(MOCK_GOAL);
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets: [], selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=smart-toggle]').trigger('click');
    expect(wrapper.find('[data-testid=smart-cell-M]').classes()).toContain('weak');
    expect(wrapper.find('[data-testid=smart-cell-S]').classes()).toContain('ok');
    const notes = wrapper.find('[data-testid=smart-notes]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain('完了率%を追加しましょう');
    expect(notes.text()).toContain('弱い観点: M');
  });
});

const tk = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws', title: over.id, status: 'todo', priority: 'medium',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdBy: 'human', ...over,
});

// F-08: Pull from backlog の投入先が Next 固定で、CURRENT (active sprint) に一括で
// 入れられなかった。投入先セレクタ (CURRENT / Next) の配線を固定する。
describe('PlanningScreen Pull from backlog の投入先選択 (F-08)', () => {
  beforeEach(() => {
    verdictRef.value = null;
    patchTicketSpy.mockClear();
    activeSprintRef.value = { id: 's-active', goal: '決済MVPを完成させる' };
    nextPlannedRef.value = { id: 's-next', status: 'planned', number: 2 };
  });

  const backlogTickets = () => [
    tk({ id: 'WC-10', status: 'backlog' }),
    tk({ id: 'WC-11', status: 'backlog' }),
  ];

  async function openPull(tickets: Ticket[]) {
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets, selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=pull-from-backlog]').trigger('click');
    return wrapper;
  }

  it('投入先セレクタが出て、既定は Next (従来挙動の維持)', async () => {
    const wrapper = await openPull(backlogTickets());
    const sel = wrapper.find('[data-testid=pull-target]');
    expect(sel.exists()).toBe(true);
    expect((sel.element as HTMLSelectElement).value).toBe('next');
  });

  it('既定 (Next) のまま追加 → nextPlanned.id へ patch する', async () => {
    const wrapper = await openPull(backlogTickets());
    await wrapper.find('[data-testid=pull-row-WC-10]').trigger('click');
    await wrapper.find('[data-testid=pull-submit]').trigger('click');
    await flushPromises();
    expect(patchTicketSpy).toHaveBeenCalledWith('WC-10', { sprintId: 's-next', status: 'todo' });
  });

  it('CURRENT を選ぶと activeSprint.id へ一括 patch する', async () => {
    const wrapper = await openPull(backlogTickets());
    await wrapper.find('[data-testid=pull-target]').setValue('current');
    await wrapper.find('[data-testid=pull-row-WC-10]').trigger('click');
    await wrapper.find('[data-testid=pull-row-WC-11]').trigger('click');
    await wrapper.find('[data-testid=pull-submit]').trigger('click');
    await flushPromises();
    expect(patchTicketSpy).toHaveBeenCalledWith('WC-10', { sprintId: 's-active', status: 'todo' });
    expect(patchTicketSpy).toHaveBeenCalledWith('WC-11', { sprintId: 's-active', status: 'todo' });
  });

  it('nextPlanned が無い環境では CURRENT のみが選べて既定になる', async () => {
    nextPlannedRef.value = null;
    const wrapper = await openPull(backlogTickets());
    const sel = wrapper.find('[data-testid=pull-target]');
    expect(sel.exists()).toBe(true);
    expect((sel.element as HTMLSelectElement).value).toBe('current');
    expect(sel.findAll('option').map((o) => o.attributes('value'))).toEqual(['current']);
  });
});

describe('PlanningScreen 持ち越し確認 (WC-30)', () => {
  beforeEach(() => {
    verdictRef.value = null;
    startSprintSpy.mockClear();
    activeSprintRef.value = { id: 's-active', goal: '決済MVPを完成させる' };
    nextPlannedRef.value = {
      id: 's-next', goal: 'G', status: 'planned', number: 2,
      startsAt: '2026-08-01T00:00:00+09:00', endsAt: '2026-08-14T23:59:59+09:00',
    };
  });

  it('開始ダイアログに現 active の未完了チケットだけが持ち越し候補に出る (done/別sprint は除外)', async () => {
    const tickets = [
      tk({ id: 'WC-1', sprintId: 's-active', status: 'todo' }),
      tk({ id: 'WC-2', sprintId: 's-active', status: 'done' }),
      tk({ id: 'WC-3', sprintId: 's-other', status: 'todo' }),
    ];
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets, selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=sprint-start-cta]').trigger('click');
    expect(wrapper.find('[data-testid=carryover-row-WC-1]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=carryover-row-WC-2]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=carryover-row-WC-3]').exists()).toBe(false);
  });

  it('既定全チェックの carryOverIds が startSprint に渡り、外したものは除外される', async () => {
    const tickets = [
      tk({ id: 'WC-1', sprintId: 's-active', status: 'todo' }),
      tk({ id: 'WC-4', sprintId: 's-active', status: 'in-progress' }),
    ];
    const wrapper = await mountSuspended(PlanningScreen, { props: { tickets, selectedId: null }, ...mountOpts });
    await wrapper.find('[data-testid=sprint-start-cta]').trigger('click');
    // WC-4 の持ち越しを外す (既定は全チェック)。
    await wrapper.find('[data-testid=carryover-row-WC-4] input').trigger('change');
    await wrapper.find('[data-testid=sprint-start]').trigger('click');
    expect(startSprintSpy).toHaveBeenCalledTimes(1);
    const body = startSprintSpy.mock.calls[0]![1] as { carryOverIds?: string[] };
    expect(body.carryOverIds).toEqual(['WC-1']);
  });
});
