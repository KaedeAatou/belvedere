// EpicList component unit test (WC-24 / 2026-07-06)。
// 検証対象は「配線」: orderIndex 昇順表示 / VueDraggable @end → reorderEpics(現並び順 id) /
// canEdit=false で d&d 無効 / 空表示。物理 d&d (SortableJS) は実機・e2e が見る。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { VueDraggable } from 'vue-draggable-plus';
import type { Epic } from '@belvedere/shared';
import EpicList from '~/components/EpicList.vue';

const reorderSpy = vi.fn<(ids: string[]) => Promise<void>>(() => Promise.resolve());
const epicsRef = ref<Epic[]>([]);
mockNuxtImport('useEpics', () => () => ({ epics: epicsRef, reorderEpics: reorderSpy }));

const ep = (id: string, orderIndex: number): Epic => ({
  id, workspaceId: 'ws', name: id, status: 'planned', orderIndex, createdAt: '2026-01-01T00:00:00Z',
});

describe('EpicList — Backlog Epic d&d 並び替え (WC-24)', () => {
  beforeEach(() => { reorderSpy.mockClear(); });

  it('orderIndex 昇順で Epic を表示する', async () => {
    epicsRef.value = [ep('EP-B', 2000), ep('EP-A', 1000)];
    const wrapper = await mountSuspended(EpicList, { props: { canEdit: true } });
    const ids = wrapper.findAll('[data-testid^="backlog-epic-"]').map((r) => r.attributes('data-testid'));
    expect(ids).toEqual(['backlog-epic-EP-A', 'backlog-epic-EP-B']);
  });

  it('@end (ドラッグ確定) で reorderEpics に現並び順の id を渡す', async () => {
    epicsRef.value = [ep('EP-A', 1000), ep('EP-B', 2000)];
    const wrapper = await mountSuspended(EpicList, { props: { canEdit: true } });
    wrapper.findComponent(VueDraggable).vm.$emit('end');
    await flushPromises();
    expect(reorderSpy).toHaveBeenCalledWith(['EP-A', 'EP-B']);
  });

  it('canEdit=false なら VueDraggable は disabled (dev は並び替え不可)', async () => {
    epicsRef.value = [ep('EP-A', 1000)];
    const wrapper = await mountSuspended(EpicList, { props: { canEdit: false } });
    expect(wrapper.findComponent(VueDraggable).props('disabled')).toBe(true);
  });

  it('Epic が無ければ empty メッセージを出す', async () => {
    epicsRef.value = [];
    const wrapper = await mountSuspended(EpicList, { props: { canEdit: true } });
    expect(wrapper.find('[data-testid="backlog-epics-empty"]').exists()).toBe(true);
  });
});
