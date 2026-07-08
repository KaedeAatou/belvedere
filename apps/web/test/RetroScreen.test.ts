// RetroScreen component unit test (F-14 / 2026-07-08)。
//
// バグ: Try ノートの「積み上げへ」が d&d のみで、d&d が機能しない環境では Try を一度も
// 永続化できなかった (代替導線ゼロ)。主導線をボタンにし、click→createTry の配線と
// 二重追加防止 (積み上げ済み text は冪等スキップ + disabled) を固定する。
// 流儀: environment 'nuxt' + mockNuxtImport (T1b — 配線だけ薄く検証。d&d の物理は実機)。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { RetroNote, RetroTry, Sprint } from '@belvedere/shared';
import RetroScreen from '~/components/screens/RetroScreen.vue';

const mocks = vi.hoisted(() => ({
  createTry: vi.fn((_input: unknown) => Promise.resolve()),
  fetchNotes: vi.fn(() => Promise.resolve()),
  fetchTries: vi.fn(() => Promise.resolve()),
  fetchMe: vi.fn(() => Promise.resolve()),
}));

// mockNuxtImport の factory は import 時に評価されうるため、ref はここで作らず
// beforeEach で毎テスト作り直す (テスト間の状態漏れも防ぐ)。
let notesRef: Ref<RetroNote[]> | undefined;
let triesRef: Ref<RetroTry[]> | undefined;

mockNuxtImport('useMembers', () => () => ({
  memberName: (id: string | null) => id ?? '',
  memberInitial: (id: string | null) => (id ?? '?').slice(0, 1), // Avatar (子コンポーネント) が使う
}));
mockNuxtImport('useSprints', () => () => ({
  activeSprint: ref({
    id: 's-active', workspaceId: 'ws', number: 13,
    startsAt: '', endsAt: '', goal: '', capacity: 0, status: 'active',
  } as Sprint),
}));
mockNuxtImport('useMe', () => () => ({ me: ref({ userId: 'u-1' }), fetchMe: mocks.fetchMe }));
mockNuxtImport('useRetroNotes', () => () => ({
  notes: notesRef, isLoading: ref(false), error: ref(null),
  fetchNotes: mocks.fetchNotes, create: vi.fn(), editText: vi.fn(),
  toggleVote: vi.fn(), remove: vi.fn(),
}));
mockNuxtImport('useRetroTries', () => () => ({
  tries: triesRef, isLoading: ref(false), error: ref(null),
  fetchTries: mocks.fetchTries, create: mocks.createTry, toggleDone: vi.fn(), remove: vi.fn(),
}));

const note = (id: string, text: string, column: RetroNote['column'] = 'try'): RetroNote => ({
  id, workspaceId: 'ws', sprintNumber: 13, column, text, authorId: 'u-1', votes: [],
  createdAt: '2026-05-18T10:00:00+09:00', createdBy: 'u-1',
});

beforeEach(() => {
  notesRef = ref<RetroNote[]>([]);
  triesRef = ref<RetroTry[]>([]);
  mocks.createTry.mockClear();
});

describe('RetroScreen Try→積み上げボタン (F-14)', () => {
  it('Try ノートに「積み上げへ追加」ボタンが出て、クリックで createTry を text/sprintNumber/sprintId 付きで呼ぶ', async () => {
    notesRef!.value = [note('note-1', '自動化を増やす')];
    const wrapper = await mountSuspended(RetroScreen);
    const btn = wrapper.find('[data-testid=retro-stack-add]');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(mocks.createTry).toHaveBeenCalledTimes(1);
    expect(mocks.createTry.mock.calls[0]?.[0]).toEqual({
      text: '自動化を増やす',
      sprintNumber: 13,
      sprintId: 's-active',
    });
  });

  it('積み上げ済み (同一 text) なら disabled + クリックしても createTry を呼ばない (二重追加防止)', async () => {
    notesRef!.value = [note('note-1', '既にある改善')];
    triesRef!.value = [{
      id: 'try-1', workspaceId: 'ws', text: '既にある改善', sprintNumber: 12,
      done: false, createdAt: '2026-05-05T10:00:00+09:00', createdBy: 'u-1',
    }];
    const wrapper = await mountSuspended(RetroScreen);
    const btn = wrapper.find('[data-testid=retro-stack-add]');
    expect(btn.exists()).toBe(true);
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    await btn.trigger('click');
    expect(mocks.createTry).not.toHaveBeenCalled();
  });

  it('keep / problem 列のノートには積み上げボタンを出さない (昇格は Try 列のみ)', async () => {
    notesRef!.value = [note('note-k', 'keep メモ', 'keep'), note('note-p', 'problem メモ', 'problem')];
    const wrapper = await mountSuspended(RetroScreen);
    expect(wrapper.find('[data-testid=retro-stack-add]').exists()).toBe(false);
  });
});
