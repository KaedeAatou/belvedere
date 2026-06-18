// DetailSheet component unit test (T1b / 2026-06-18)。
//
// 検証対象は「配線」: 編集モード遷移 / タイトル必須バリデーション / 保存ボタンの二重送信防止
// (saving フラグ) / patchTicket への patch 組み立て。見た目 CSS は対象外。
// EstimationPanel は story 種別のみ描画されるため、ここでは type=task のチケットで mount する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket } from '@belvedere/shared';
import DetailSheet from '~/components/DetailSheet.vue';

const mocks = vi.hoisted(() => {
  const patchTicket = vi.fn((_id: string, _patch: Record<string, unknown>) =>
    Promise.resolve<{ id: string } | null>({ id: 'WC-1' }),
  );
  const deleteTicket = vi.fn((_id: string) => Promise.resolve(true));
  return {
    patchTicket,
    deleteTicket,
    useMembers: () => ({ memberName: () => 'Kaede', members: [] }),
    useFindings: () => ({ findingsFor: () => [] }),
    useTickets: () => ({ patchTicket, deleteTicket }),
    useSprints: () => ({ sprints: [] }),
  };
});

mockNuxtImport('useMembers', () => mocks.useMembers);
mockNuxtImport('useFindings', () => mocks.useFindings);
mockNuxtImport('useTickets', () => mocks.useTickets);
mockNuxtImport('useSprints', () => mocks.useSprints);

const ticket = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws-belvedere',
  title: 'もとのタイトル',
  status: 'todo',
  priority: 'medium',
  type: 'task',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

beforeEach(() => {
  mocks.patchTicket.mockClear().mockResolvedValue({ id: 'WC-1' });
  mocks.deleteTicket.mockClear();
});

describe('DetailSheet 編集 → 保存 の配線', () => {
  it('編集ボタンで編集モードに入り、保存/キャンセルが出る', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1' }) } });
    expect(wrapper.find('[data-testid="save-ticket"]').exists()).toBe(false);
    await wrapper.find('[data-testid="edit-ticket"]').trigger('click');
    expect(wrapper.find('[data-testid="save-ticket"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-title"]').exists()).toBe(true);
  });

  it('タイトル空で保存 → エラー表示、patchTicket は呼ばない', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1' }) } });
    await wrapper.find('[data-testid="edit-ticket"]').trigger('click');
    await wrapper.find('[data-testid="edit-title"]').setValue('   ');
    await wrapper.find('[data-testid="save-ticket"]').trigger('click');
    await flushPromises();
    expect(mocks.patchTicket).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-error"]').text()).toContain('タイトルは必須');
  });

  it('有効な編集で patchTicket(id, patch) を組み立てて呼び、成功で編集モードを抜ける', async () => {
    const tk = ticket({ id: 'WC-1', acceptanceCriteria: [] });
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: tk } });
    await wrapper.find('[data-testid="edit-ticket"]').trigger('click');
    await wrapper.find('[data-testid="edit-title"]').setValue('  新しいタイトル  ');
    await wrapper.find('[data-testid="sheet-edit-ac"]').setValue('ユーザがログインできる\n\n  プロフィールが見える  ');
    await wrapper.find('[data-testid="save-ticket"]').trigger('click');
    await flushPromises();
    expect(mocks.patchTicket).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.patchTicket.mock.calls[0]!;
    expect(id).toBe('WC-1');
    expect(patch).toMatchObject({
      title: '新しいタイトル', // trim 済
      status: 'todo',
      priority: 'medium',
      acceptanceCriteria: ['ユーザがログインできる', 'プロフィールが見える'], // 空行除去 + trim
    });
    // 成功 → 編集モードを抜けて編集ボタンに戻る
    expect(wrapper.find('[data-testid="save-ticket"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-ticket"]').exists()).toBe(true);
  });

  it('二重送信防止: 保存中 (saving) は保存ボタンが disabled', async () => {
    // patchTicket を未解決のまま保留し、保存中状態を観測する。
    let release!: (v: { id: string } | null) => void;
    mocks.patchTicket.mockReturnValueOnce(new Promise<{ id: string } | null>((r) => { release = r; }));
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1' }) } });
    await wrapper.find('[data-testid="edit-ticket"]').trigger('click');
    await wrapper.find('[data-testid="edit-title"]').setValue('保存テスト');
    await wrapper.find('[data-testid="save-ticket"]').trigger('click');
    await flushPromises();
    // saving=true の間、保存ボタンは disabled (連打しても 2 回目の patchTicket は走らない)
    expect(wrapper.find('[data-testid="save-ticket"]').attributes('disabled')).toBeDefined();
    expect(mocks.patchTicket).toHaveBeenCalledTimes(1);
    release({ id: 'WC-1' }); // 後片付け
    await flushPromises();
  });
});
