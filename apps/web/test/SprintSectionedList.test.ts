// SprintSectionedList component unit test (T1b / 2026-06-18)。
//
// 検証対象は「配線」: VueDraggable の @end (onDragEnd) が reorderTickets を
// orderedIds / movedId / sprintId 正しく呼ぶか。物理 d&d (SortableJS の掴み/ドロップ/選択抑止) は
// 対象外で e2e (reorder.spec) と実機 (local-ui-verify) が見る。ここでは @end を合成イベントで
// 発火させ、移動先区画 / 区画跨ぎの分岐で reorderTickets の引数が正しいことだけを固定する。

import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { VueDraggable } from 'vue-draggable-plus';
import type { Ticket, TicketType } from '@belvedere/shared';
import SprintSectionedList from '~/components/SprintSectionedList.vue';

type SSLProps = InstanceType<typeof SprintSectionedList>['$props'];

// 共有する reorderTickets スパイは vi.hoisted で生成 (mockNuxtImport は巻き上げられるため)。
const mocks = vi.hoisted(() => {
  const reorderTickets = vi.fn(() => Promise.resolve([]));
  return {
    reorderTickets,
    useTickets: () => ({
      createTicket: () => Promise.resolve(null),
      reorderTickets,
      isLoading: { value: false },
      error: { value: null },
    }),
    useFindings: () => ({ findingsFor: () => [] }),
    useStoryCheck: () => ({ checkStory: () => Promise.resolve(null), checking: { value: false } }),
    useSprints: () => ({
      activeSprint: { value: { id: 's-active' } },
      nextPlanned: { value: { id: 's-next' } },
    }),
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
mockNuxtImport('useFindings', () => mocks.useFindings);
mockNuxtImport('useStoryCheck', () => mocks.useStoryCheck);
mockNuxtImport('useSprints', () => mocks.useSprints);
mockNuxtImport('useTicketSelection', () => mocks.useSelection);

const t = (id: string): Ticket => ({
  id,
  workspaceId: 'ws-belvedere',
  title: id,
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
});

// data-section / data-ticket-id を持つ合成 DOM (SortableJS evt の代用)。
const el = (attr: string, val: string): HTMLElement => {
  const d = document.createElement('div');
  d.setAttribute(attr, val);
  return d;
};

async function fireDragEnd(
  props: SSLProps,
  evt: { item: HTMLElement; from: HTMLElement; to: HTMLElement },
): Promise<void> {
  const wrapper = await mountSuspended(SprintSectionedList, { props });
  // 3 区画の VueDraggable はすべて同じ onDragEnd を @end に束ねる。どれに emit しても
  // ハンドラは evt の data-section / data-ticket-id だけを読むので先頭に発火させる。
  const dnd = wrapper.findAllComponents(VueDraggable);
  // $emit は同期的に onDragEnd を起動し、その中で reorderTickets が await 前に呼ばれる。
  dnd[0]!.vm.$emit('end', evt);
  await flushPromises();
}

const baseProps = {
  selectedId: null,
  members: [],
  sprints: [],
  allowedTypes: ['task'] as TicketType[],
};

describe('SprintSectionedList onDragEnd → reorderTickets', () => {
  it('区画内 並び替え (backlog→backlog): orderedIds のみ送る (movedId/sprintId なし)', async () => {
    await fireDragEnd(
      { ...baseProps, current: [], next: [], backlog: [t('A'), t('B'), t('C')] },
      { item: el('data-ticket-id', 'A'), from: el('data-section', 'backlog'), to: el('data-section', 'backlog') },
    );
    expect(mocks.reorderTickets).toHaveBeenCalledWith({ orderedIds: ['A', 'B', 'C'] });
  });

  it('区画跨ぎ → current: movedId + sprintId=activeSprint.id を載せる', async () => {
    // 移動先 current にすでに A が入っている状態 (SortableJS がドロップ済) を再現。
    await fireDragEnd(
      { ...baseProps, current: [t('A'), t('X')], next: [], backlog: [t('B')] },
      { item: el('data-ticket-id', 'A'), from: el('data-section', 'backlog'), to: el('data-section', 'current') },
    );
    expect(mocks.reorderTickets).toHaveBeenCalledWith({
      orderedIds: ['A', 'X'],
      movedId: 'A',
      sprintId: 's-active',
    });
  });

  it('区画跨ぎ → backlog: movedId + sprintId=null (未割当へ解除)', async () => {
    await fireDragEnd(
      { ...baseProps, current: [t('B')], next: [], backlog: [t('A'), t('Y')] },
      { item: el('data-ticket-id', 'A'), from: el('data-section', 'current'), to: el('data-section', 'backlog') },
    );
    expect(mocks.reorderTickets).toHaveBeenCalledWith({
      orderedIds: ['A', 'Y'],
      movedId: 'A',
      sprintId: null,
    });
  });

  it('移動先 section に id が居ない (不整合 evt) → reorderTickets を呼ばず再同期で握りつぶす', async () => {
    mocks.reorderTickets.mockClear();
    await fireDragEnd(
      { ...baseProps, current: [], next: [], backlog: [t('A')] },
      { item: el('data-ticket-id', 'GHOST'), from: el('data-section', 'backlog'), to: el('data-section', 'backlog') },
    );
    expect(mocks.reorderTickets).not.toHaveBeenCalled();
  });
});
