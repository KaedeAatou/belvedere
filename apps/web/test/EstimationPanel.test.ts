// EstimationPanel component unit test (F-09 / F-28 / 2026-07-08)。
//
// 検証対象は「配線」(testing.md の component unit):
//   F-09: SP 採用 (adopt) 成功後に useTickets().fetchTickets() を呼んで共有 tickets state を
//         再取得するか。ローカル session の差し替えだけだと一覧行・区画集計・AI パネルが
//         リロードまで stale のまま残る (ドッグフード実機で確認)。
//   F-28: status=adopted のセッション表示に facilitator 向け「再ポーカー」ボタンが出て、
//         click で既存の start() (POST /estimation) が飛ぶか。API は adopted 後の再 start を
//         201 で許可済みなのに UI 導線が無く再見積もり不能だった。
// 見た目 CSS / ポーカーの隠蔽ロジック (サーバ強制) は対象外。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket } from '@belvedere/shared';
import type { EstimationView } from '~/composables/useEstimation';
import EstimationPanel from '~/components/EstimationPanel.vue';

const mocks = vi.hoisted(() => {
  // 権限切替用の me (canFacilitate=admin/sm / canAdopt=admin/sm/dev)。テストごとに差し替える。
  const me = { value: { role: 'sm' } as null | { role: string } };
  const fetchTickets = vi.fn(() => Promise.resolve());
  // useEstimation の 5 endpoint スパイ。各テストが状態 (revealed / adopted) を差し込む。
  const estFetch = vi.fn<() => Promise<EstimationView | null>>(() => Promise.resolve(null));
  const start = vi.fn<() => Promise<EstimationView | null>>(() =>
    Promise.resolve({ status: 'voting', myVote: null, votedUserIds: [], voteCount: 0 }));
  const vote = vi.fn<() => Promise<EstimationView | null>>(() => Promise.resolve(null));
  const reveal = vi.fn<() => Promise<EstimationView | null>>(() => Promise.resolve(null));
  const adopt = vi.fn<() => Promise<EstimationView | null>>(() =>
    Promise.resolve({ status: 'adopted', votes: [{ userId: 'u1', value: 5 }], adoptedValue: 5 }));
  return { me, fetchTickets, estFetch, start, vote, reveal, adopt };
});

mockNuxtImport('useMe', () => () => ({ me: mocks.me }));
mockNuxtImport('useMembers', () => () => ({ memberName: (id: string) => id }));
mockNuxtImport('useTickets', () => () => ({ fetchTickets: mocks.fetchTickets }));
mockNuxtImport('useEstimation', () => () => ({
  error: { value: null },
  fetch: mocks.estFetch,
  start: mocks.start,
  vote: mocks.vote,
  reveal: mocks.reveal,
  adopt: mocks.adopt,
}));

const ticket: Ticket = {
  id: 'WC-101',
  workspaceId: 'ws-belvedere',
  title: 'ポーカー対象 Story',
  status: 'todo',
  priority: 'medium',
  type: 'story',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
};

const revealedView: EstimationView = {
  status: 'revealed',
  votes: [{ userId: 'u1', value: 5 }, { userId: 'u2', value: 5 }],
};
const adoptedView: EstimationView = {
  status: 'adopted',
  votes: [{ userId: 'u1', value: 5 }],
  adoptedValue: 5,
};

beforeEach(() => {
  mocks.me.value = { role: 'sm' };
  mocks.fetchTickets.mockClear();
  mocks.estFetch.mockReset().mockResolvedValue(null);
  mocks.start.mockClear().mockResolvedValue({ status: 'voting', myVote: null, votedUserIds: [], voteCount: 0 });
  mocks.adopt.mockClear().mockResolvedValue(adoptedView);
});

describe('F-09: SP 採用 → 共有 tickets state の再取得', () => {
  it('adopt 成功で useTickets().fetchTickets() を呼ぶ (一覧行・区画集計・AI パネルに即反映)', async () => {
    mocks.estFetch.mockResolvedValue(revealedView);
    const wrapper = await mountSuspended(EstimationPanel, { props: { ticket } });
    await flushPromises();
    await wrapper.find('[data-testid="est-adopt-5"]').trigger('click');
    await flushPromises();
    expect(mocks.adopt).toHaveBeenCalledWith('WC-101', 5);
    expect(mocks.fetchTickets).toHaveBeenCalledTimes(1);
    wrapper.unmount(); // 5s ポーリングの後片付け
  });

  it('adopt 失敗 (null) では fetchTickets を呼ばない (無駄な再取得をしない)', async () => {
    mocks.estFetch.mockResolvedValue(revealedView);
    mocks.adopt.mockResolvedValue(null);
    const wrapper = await mountSuspended(EstimationPanel, { props: { ticket } });
    await flushPromises();
    await wrapper.find('[data-testid="est-adopt-5"]').trigger('click');
    await flushPromises();
    expect(mocks.fetchTickets).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('F-28: adopted 後の再ポーカー導線', () => {
  it('adopted 表示で facilitator に「再ポーカー」が出て、click で start (POST) が飛ぶ', async () => {
    mocks.estFetch.mockResolvedValue(adoptedView);
    const wrapper = await mountSuspended(EstimationPanel, { props: { ticket } });
    await flushPromises();
    const btn = wrapper.find('[data-testid="est-repoker"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('再ポーカー');
    await btn.trigger('click');
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith('WC-101');
    // start が voting ビューを返す → 投票中表示に切り替わる (facilitator には開示ボタン)
    expect(wrapper.find('[data-testid="est-reveal"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('facilitator でない dev には「再ポーカー」は出ない (canFacilitate=admin/sm)', async () => {
    mocks.me.value = { role: 'dev' };
    mocks.estFetch.mockResolvedValue(adoptedView);
    const wrapper = await mountSuspended(EstimationPanel, { props: { ticket } });
    await flushPromises();
    expect(wrapper.find('[data-testid="est-repoker"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
