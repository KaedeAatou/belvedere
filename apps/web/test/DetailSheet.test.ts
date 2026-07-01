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
  // コメント追加 (WC-2640fecd) の配線スパイ。成功時は更新済チケット (comments 付き) を返す。
  const addComment = vi.fn((id: string, body: string) =>
    Promise.resolve<{ id: string } | null>({ id, comments: [{ id: 'CMT-1', authorId: 'u1', body, createdAt: '2026-07-01T00:00:00Z' }] } as unknown as { id: string }));
  return {
    patchTicket,
    deleteTicket,
    addComment,
    useMembers: () => ({ memberName: () => 'Kaede', memberInitial: () => 'K', members: [] }),
    useFindings: () => ({ findingsFor: () => [] }),
    useTickets: () => ({ patchTicket, deleteTicket, addComment }),
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
  mocks.addComment.mockClear();
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

describe('DetailSheet レビュー指摘 (reviewNotes) 表示', () => {
  it('reviewNotes を持つチケットで「レビュー指摘」セクションと各指摘テキストを描画する', async () => {
    const tk = ticket({ id: 'WC-1', reviewNotes: ['UI が分かりにくい', 'ボタン位置を直す'] });
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: tk } });
    const section = wrapper.find('[data-testid="sheet-review-notes"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain('レビュー指摘');
    expect(section.text()).toContain('UI が分かりにくい');
    expect(section.text()).toContain('ボタン位置を直す');
  });

  it('reviewNotes 未設定なら「レビュー指摘」セクションは描画されない (空なら非表示)', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1' }) } });
    expect(wrapper.find('[data-testid="sheet-review-notes"]').exists()).toBe(false);
  });

  it('reviewNotes が空配列なら「レビュー指摘」セクションは描画されない', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1', reviewNotes: [] }) } });
    expect(wrapper.find('[data-testid="sheet-review-notes"]').exists()).toBe(false);
  });
});

describe('コメント / 追記スレッド (WC-2640fecd)', () => {
  it('既存コメントを著者名 + 本文で描画する', async () => {
    const tk = ticket({ id: 'WC-1', comments: [
      { id: 'CMT-1', authorId: 'u1', body: '追加調査した', createdAt: '2026-07-01T09:00:00Z' },
    ] });
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: tk } });
    const sec = wrapper.find('[data-testid="sheet-comments"]');
    expect(sec.exists()).toBe(true);
    expect(sec.text()).toContain('追加調査した');
    expect(wrapper.find('[data-testid="comment-CMT-1"]').exists()).toBe(true);
  });

  it('入力して追加 → addComment(id, body) を呼び、成功で入力欄をクリアする', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-9' }) } });
    await wrapper.find('[data-testid="comment-input"]').setValue('  あとで直す  ');
    await wrapper.find('[data-testid="comment-submit"]').trigger('click');
    await flushPromises();
    expect(mocks.addComment).toHaveBeenCalledWith('WC-9', 'あとで直す');
    expect((wrapper.find('[data-testid="comment-input"]').element as HTMLTextAreaElement).value).toBe('');
  });

  it('空 (空白のみ) では追加ボタンが disabled で addComment を呼ばない', async () => {
    const wrapper = await mountSuspended(DetailSheet, { props: { ticket: ticket({ id: 'WC-1' }) } });
    await wrapper.find('[data-testid="comment-input"]').setValue('   ');
    expect(wrapper.find('[data-testid="comment-submit"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="comment-submit"]').trigger('click');
    await flushPromises();
    expect(mocks.addComment).not.toHaveBeenCalled();
  });
});
