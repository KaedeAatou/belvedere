// TicketRow component unit test (T1b / 2026-06-18)。
// ランナー健全性の最初の 1 本: t prop → data-ticket-id / title / findings 描画の配線を確認する。
// useFindings は mockNuxtImport で差し替え (findings の有無を制御)。見た目 CSS は対象外。

import { describe, it, expect } from 'vitest';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { Ticket } from '@belvedere/shared';
import TicketRow from '~/components/primitives/TicketRow.vue';

// findings は ticket id で出し分け: WC-FLAG のみ 1 件 finding を返す。
mockNuxtImport('useFindings', () => {
  return () => ({
    findingsFor: (id: string) =>
      id === 'WC-FLAG'
        ? [{ ruleId: 'STORY_DOD_MISSING', ticketId: 'WC-FLAG', severity: 'error', message: 'DoD がありません' }]
        : [],
  });
});

const ticket = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws-belvedere',
  title: over.id,
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

describe('TicketRow', () => {
  it('t prop を data-ticket-id と title で描画する', async () => {
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-1', title: 'ログイン validation を追加' }) },
    });
    expect(wrapper.find('[data-ticket-id="WC-1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ログイン validation を追加');
    // findings 無し → flags は描画しない
    expect(wrapper.find('.trow-flags').exists()).toBe(false);
  });

  it('findings がある ticket では flags 列を描画する', async () => {
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-FLAG', title: 'DoD 欠落 Story' }) },
    });
    expect(wrapper.find('[data-ticket-id="WC-FLAG"]').exists()).toBe(true);
    expect(wrapper.find('.trow-flags').exists()).toBe(true);
  });

  // WC-d019fd94: 長いタイトルで警告ピルが見切れる不具合の修正のガード。
  // タイトルは専用 .trow-title-text に入り (ここだけ省略 …)、長くても .trow-flags は残る
  // (flex-shrink:0 で常時表示)。CSS の見切れ自体は実機で確認するが、DOM 契約はここで固定する。
  it('タイトルが長くても title-text と flags が両方描画される', async () => {
    const longTitle = 'チケット名が長いと再現手順なしとかアイコンが見切れている問題を再現する非常に長いタイトルです'.repeat(2);
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-FLAG', title: longTitle }) },
    });
    // タイトル文字列は専用 span に入る (省略の対象)
    const titleText = wrapper.find('.trow-title-text');
    expect(titleText.exists()).toBe(true);
    expect(titleText.text()).toBe(longTitle);
    // 長いタイトルでも flags 列は残る (押し出されて消えない)
    expect(wrapper.find('.trow-flags').exists()).toBe(true);
  });

  it('selectable prop でチェックボックス列を出す', async () => {
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-2' }), selectable: true },
    });
    expect(wrapper.find('[data-testid="trow-check"]').exists()).toBe(true);
  });

  // WC-28: 分割子チケットの親リンク。
  it('parentTicketId があると親リンクを出し、クリックで selectParent を emit する', async () => {
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-25', parentTicketId: 'WC-22' }) },
    });
    const link = wrapper.find('[data-testid="trow-parent-WC-25"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('WC-22');
    await link.trigger('click');
    expect(wrapper.emitted('selectParent')).toEqual([['WC-22']]);
    // 親ピルクリックは行クリック (click) を発火しない (@click.stop)。
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('parentTicketId が無い行には親リンクを出さない', async () => {
    const wrapper = await mountSuspended(TicketRow, { props: { t: ticket({ id: 'WC-1' }) } });
    expect(wrapper.find('[data-testid="trow-parent-WC-1"]').exists()).toBe(false);
  });
});
