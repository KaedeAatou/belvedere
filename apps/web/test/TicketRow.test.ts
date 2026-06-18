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

  it('selectable prop でチェックボックス列を出す', async () => {
    const wrapper = await mountSuspended(TicketRow, {
      props: { t: ticket({ id: 'WC-2' }), selectable: true },
    });
    expect(wrapper.find('[data-testid="trow-check"]').exists()).toBe(true);
  });
});
