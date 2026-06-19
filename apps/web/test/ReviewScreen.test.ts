// ReviewScreen component unit test (T1b / 2026-06-19)。
//
// 検証対象は「配線」: Demos (done/review チケット) の指摘欄に入力 → 「指摘を追加」で
// patchTicket(t.id, { reviewNotes: [...既存, 新指摘] }) が呼ばれること。
// 退化入力 (既存 0 件 / 既存複数) で read→append が既存 reviewNotes を消さないことを固定する
// (= Review の指摘は新規起票せず対象チケットの reviewNotes に append する設計のリグレッションガード)。
// 物理 d&d (carry-over の SortableJS) は対象外で e2e / 実機が見る。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket } from '@belvedere/shared';
import ReviewScreen from '~/components/screens/ReviewScreen.vue';

const mocks = vi.hoisted(() => {
  const patchTicket = vi.fn((id: string, patch: Record<string, unknown>) =>
    Promise.resolve<{ id: string } | null>({ id, ...patch }),
  );
  const reorderTickets = vi.fn(() => Promise.resolve([]));
  return {
    patchTicket,
    reorderTickets,
    useTickets: () => ({ patchTicket, reorderTickets, error: { value: null } }),
    useSprints: () => ({
      activeSprint: { value: { id: 's-active', goal: 'ゴール' } },
      sprints: [],
      velocityHistory: { value: [] },
    }),
    useMembers: () => ({ members: [] }),
    useSelection: () => ({
      count: { value: 0 },
      isSelected: () => false,
      toggle: () => {},
      isBusy: { value: false },
      applyToSelected: () => {},
      removeSelected: () => {},
      clear: () => {},
      selectMany: () => {},
    }),
  };
});

mockNuxtImport('useTickets', () => mocks.useTickets);
mockNuxtImport('useSprints', () => mocks.useSprints);
mockNuxtImport('useMembers', () => mocks.useMembers);
mockNuxtImport('useTicketSelection', () => mocks.useSelection);

// active sprint (s-active) に紐づく review/done チケットが demos を生む。
const demo = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws-belvedere',
  title: over.id,
  status: 'review',
  priority: 'medium',
  sprintId: 's-active',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

beforeEach(() => {
  mocks.patchTicket.mockClear();
  mocks.reorderTickets.mockClear();
});

describe('ReviewScreen 指摘追記 → patchTicket(append)', () => {
  it('既存 reviewNotes 無しのチケットに指摘を追加すると reviewNotes:[新指摘] で patchTicket が呼ばれる', async () => {
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-1' })], selectedId: null },
    });
    const input = wrapper.find('[data-testid="review-note-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('  フィルタが分かりにくい  ');
    await wrapper.find('[data-testid="review-note-add"]').trigger('click');
    await flushPromises();
    expect(mocks.patchTicket).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.patchTicket.mock.calls[0]!;
    expect(id).toBe('WC-1');
    expect(patch).toEqual({ reviewNotes: ['フィルタが分かりにくい'] }); // trim 済 / append (既存 0 件)
  });

  it('既存 reviewNotes 複数のチケットに追記すると read→append で既存を消さず全配列を送る', async () => {
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-2', reviewNotes: ['既存A', '既存B'] })], selectedId: null },
    });
    await wrapper.find('[data-testid="review-note-input"]').setValue('新指摘C');
    await wrapper.find('[data-testid="review-note-add"]').trigger('click');
    await flushPromises();
    expect(mocks.patchTicket).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.patchTicket.mock.calls[0]!;
    expect(id).toBe('WC-2');
    // 既存 ['既存A','既存B'] を消さず末尾に append した全配列
    expect(patch).toEqual({ reviewNotes: ['既存A', '既存B', '新指摘C'] });
  });

  it('空入力では patchTicket を呼ばない (空白のみも弾く)', async () => {
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-3' })], selectedId: null },
    });
    await wrapper.find('[data-testid="review-note-input"]').setValue('   ');
    await wrapper.find('[data-testid="review-note-add"]').trigger('click');
    await flushPromises();
    expect(mocks.patchTicket).not.toHaveBeenCalled();
  });

  it('既存指摘は demo セルに一覧表示される (read 経路)', async () => {
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-4', reviewNotes: ['指摘X', '指摘Y'] })], selectedId: null },
    });
    const list = wrapper.find('[data-testid="review-note-list"]');
    expect(list.exists()).toBe(true);
    expect(list.text()).toContain('指摘X');
    expect(list.text()).toContain('指摘Y');
  });

  it('旧「ステークホルダーフィードバック → バックログ起票」UI は撤去されている', async () => {
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-5' })], selectedId: null },
    });
    expect(wrapper.find('[data-testid="review-feedback-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="review-feedback-impact"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="review-feedback-submit"]').exists()).toBe(false);
  });

  it('送信中は同一チケットの二重送信を防ぐ (patchTicket は 1 回・送信中は disabled)', async () => {
    // patchTicket を pending にして in-flight 状態を作る (同期 resolve だと noteBusy が即戻る)。
    let resolvePatch: (v: { id: string } | null) => void = () => {};
    mocks.patchTicket.mockImplementationOnce(
      () => new Promise<{ id: string } | null>((res) => { resolvePatch = res; }),
    );
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-6' })], selectedId: null },
    });
    await wrapper.find('[data-testid="review-note-input"]').setValue('指摘');
    await wrapper.find('[data-testid="review-note-add"]').trigger('click'); // 1 回目 (in-flight)
    expect(wrapper.find('[data-testid="review-note-add"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="review-note-add"]').trigger('click'); // 2 回目 (ガードで弾く)
    await flushPromises();
    expect(mocks.patchTicket).toHaveBeenCalledTimes(1);
    resolvePatch({ id: 'WC-6' }); // 後始末
    await flushPromises();
  });

  it('patchTicket 失敗時は入力をクリアしない (success-only clear)', async () => {
    mocks.patchTicket.mockImplementationOnce(() => Promise.resolve(null));
    const wrapper = await mountSuspended(ReviewScreen, {
      props: { tickets: [demo({ id: 'WC-7' })], selectedId: null },
    });
    const input = wrapper.find('[data-testid="review-note-input"]');
    await input.setValue('消えない指摘');
    await wrapper.find('[data-testid="review-note-add"]').trigger('click');
    await flushPromises();
    expect((input.element as HTMLTextAreaElement).value).toBe('消えない指摘');
  });
});
