// SprintSectionedList component unit test (T1b / 2026-06-18)。
//
// 検証対象は「配線」: VueDraggable の @end (onDragEnd) が reorderTickets を
// orderedIds / movedId / sprintId 正しく呼ぶか。物理 d&d (SortableJS の掴み/ドロップ/選択抑止) は
// 対象外で e2e (reorder.spec) と実機 (local-ui-verify) が見る。ここでは @end を合成イベントで
// 発火させ、移動先区画 / 区画跨ぎの分岐で reorderTickets の引数が正しいことだけを固定する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { VueDraggable } from 'vue-draggable-plus';
import type { Ticket, TicketType } from '@belvedere/shared';
import SprintSectionedList from '~/components/SprintSectionedList.vue';

type SSLProps = InstanceType<typeof SprintSectionedList>['$props'];

// 共有する reorderTickets スパイは vi.hoisted で生成 (mockNuxtImport は巻き上げられるため)。
const mocks = vi.hoisted(() => {
  const reorderTickets = vi.fn(() => Promise.resolve([]));
  // createTicket は作成成功 (truthy) を返すスパイ。submitCreate / submitSplit の配線 (epicId が body に
  // 載るか / 必須ガードで弾かれるか) を呼出引数で固定するため、デフォルトで created を返す。
  const createTicket = vi.fn((input: Record<string, unknown>) => Promise.resolve({ id: 'WC-new', ...input }));
  // createEpic は新 Epic を返すスパイ。インライン Epic 作成 (Story を作る儀式で Epic も追加) の配線を固定。
  const createEpic = vi.fn((input: { name: string }) =>
    Promise.resolve({ id: 'EP-NEW', workspaceId: 'ws-belvedere', name: input.name, status: 'planned', createdAt: '2026-06-01T00:00:00Z' }));
  // 並び替え権限 (canReorder) を切替えるための me。template/script は me.value?.role を読む。
  // テストごとに value を差し替えて remount し、reorderBlocked (= VueDraggable :disabled) を踏む。
  const me = { value: null as null | { role: string } };
  return {
    me,
    reorderTickets,
    createTicket,
    createEpic,
    // テンプレートは ref を自動アンラップするが、プレーン {value} はアンラップされない。
    // createLoading は template でのみ truthy 判定される (script で .value を読まない) ので素の値を渡す。
    // liveError は script で .value を読むので {value} 形を保つ。
    useTickets: () => ({
      createTicket,
      reorderTickets,
      isLoading: false,
      error: { value: null },
    }),
    useFindings: () => ({ findingsFor: () => [] }),
    useStoryCheck: () => ({ checkStory: () => Promise.resolve(null), checking: { value: false } }),
    useSprints: () => ({
      activeSprint: { value: { id: 's-active' } },
      nextPlanned: { value: { id: 's-next' } },
    }),
    // selectableEpics は template の v-for で消費される。ref のアンラップ後の素の配列を渡す
    // (プレーン {value:[...]} だと v-for がオブジェクトを走査して option が壊れる)。
    useEpics: () => ({
      epics: [{ id: 'EP-1', workspaceId: 'ws-belvedere', name: 'Epic 1', status: 'active', createdAt: '2026-06-01T00:00:00Z' }],
      selectableEpics: [{ id: 'EP-1', workspaceId: 'ws-belvedere', name: 'Epic 1', status: 'active', createdAt: '2026-06-01T00:00:00Z' }],
      fetchEpics: () => Promise.resolve(),
      createEpic,
      error: { value: null },
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

mockNuxtImport('useMe', () => () => ({ me: mocks.me }));
mockNuxtImport('useTickets', () => mocks.useTickets);
mockNuxtImport('useFindings', () => mocks.useFindings);
mockNuxtImport('useStoryCheck', () => mocks.useStoryCheck);
mockNuxtImport('useSprints', () => mocks.useSprints);
mockNuxtImport('useEpics', () => mocks.useEpics);
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

// 並び替え権限 (backlog.reorder = PO/admin) の UI ゲート (2026-06-23 レビュー指摘)。
// 非 PO がドラッグ → サーバ 403 → 無言 revert する紛らわしさを防ぐため、3 区画の VueDraggable の
// :disabled を role で切替える。ここでは me.role を差替えて disabled prop が期待通り反転するかを固定する。
describe('SprintSectionedList reorder の role ゲート (:disabled)', () => {
  const props = { ...baseProps, current: [t('A')], next: [], backlog: [t('B')] };

  async function disabledFlags(role: string | null): Promise<boolean[]> {
    mocks.me.value = role ? { role } : null;
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    return wrapper.findAllComponents(VueDraggable).map((d) => d.props('disabled') as boolean);
  }

  it('po は全区画で drag 有効 (disabled=false)', async () => {
    expect((await disabledFlags('po')).every((d) => d === false)).toBe(true);
  });
  it('admin は drag 有効 (disabled=false)', async () => {
    expect((await disabledFlags('admin')).every((d) => d === false)).toBe(true);
  });
  it('sm は drag 無効 (disabled=true) — reorder は PO の専権', async () => {
    expect((await disabledFlags('sm')).every((d) => d === true)).toBe(true);
  });
  it('dev は drag 無効 (disabled=true)', async () => {
    expect((await disabledFlags('dev')).every((d) => d === true)).toBe(true);
  });
  it('me 未取得 (初期ロード / null) は許可側に倒す (admin を誤って止めない)', async () => {
    expect((await disabledFlags(null)).every((d) => d === false)).toBe(true);
    mocks.me.value = null; // 後続テストへ漏らさない (既定 null へ戻す)
  });
});

// ===== 案A: story 作成の親Epic必須化 + 分割子の親Epic継承の配線 (T1b) =====
// 物理 d&d と同じく「配線」を固定する層。submitCreate / submitSplit が createTicket を
// epicId 付き/無しで正しく呼ぶか、必須ガードで呼ばず弾くかを引数アサートで踏む。
const story = (id: string, epicId?: string): Ticket => ({
  ...t(id),
  type: 'story',
  ...(epicId !== undefined && { epicId }),
});

describe('SprintSectionedList story 作成の親Epic必須化 (案A)', () => {
  const storyProps = {
    ...baseProps,
    allowedTypes: ['story'] as TicketType[],
    current: [] as Ticket[],
    next: [] as Ticket[],
    backlog: [] as Ticket[],
  };

  // New issue → story フォームを開き 3 欄を埋める (親 Epic 選択は各テストで分岐)。
  async function openCreateStory() {
    const wrapper = await mountSuspended(SprintSectionedList, { props: storyProps });
    await wrapper.get('[data-testid=section-new-ticket-btn]').trigger('click');
    await wrapper.get('[data-testid=us-asa]').setValue('運営担当者');
    await wrapper.get('[data-testid=us-iwant]').setValue('ゴール提案がほしい');
    await wrapper.get('[data-testid=us-sothat]').setValue('判定が割れない');
    return wrapper;
  }

  it('親 Epic 未選択で作成 → createTicket を呼ばず createError を出す', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await openCreateStory();
    await wrapper.get('[data-testid=submit-create]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid=create-error]').text()).toContain('親 Epic');
  });

  it('親 Epic を選ぶと createTicket が epicId 付き story で呼ばれる', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await openCreateStory();
    await wrapper.get('[data-testid=us-epic]').setValue('EP-1');
    await wrapper.get('[data-testid=submit-create]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).toHaveBeenCalledTimes(1);
    expect(mocks.createTicket.mock.calls[0]![0]).toMatchObject({ type: 'story', epicId: 'EP-1' });
  });

  // 決定2部目: Story を作れる儀式で Epic も追加できる (インライン作成 → 即選択)。
  it('インライン Epic 作成: 名前を入れて作成すると createEpic が呼ばれフォームが閉じる', async () => {
    mocks.createEpic.mockClear();
    const wrapper = await openCreateStory();
    await wrapper.get('[data-testid=epic-new-toggle]').trigger('click');
    await wrapper.get('[data-testid=epic-new-name]').setValue('運営の自動化');
    await wrapper.get('[data-testid=epic-new-rationale]').setValue('レビュー判定を割れさせない');
    await wrapper.get('[data-testid=epic-new-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createEpic).toHaveBeenCalledTimes(1);
    expect(mocks.createEpic.mock.calls[0]![0]).toMatchObject({ name: '運営の自動化', rationale: 'レビュー判定を割れさせない' });
    expect(wrapper.find('[data-testid=epic-create]').exists()).toBe(false); // 作成後に閉じる
  });

  it('インライン Epic 作成: 名前が空なら createEpic を呼ばずエラーを出す', async () => {
    mocks.createEpic.mockClear();
    const wrapper = await openCreateStory();
    await wrapper.get('[data-testid=epic-new-toggle]').trigger('click');
    await wrapper.get('[data-testid=epic-new-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createEpic).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid=epic-new-error]').text()).toContain('Epic 名');
  });
});

describe('SprintSectionedList 分割の親Epic継承 (案A)', () => {
  // split ボタン → ダイアログを開き 1 行目のタイトルを埋める。
  async function mountAndOpenSplit(props: SSLProps, parentId: string, rowTitle: string) {
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    await wrapper.get(`[data-testid=split-${parentId}]`).trigger('click');
    await wrapper.get('[data-testid=split-row-0]').setValue(rowTitle);
    return wrapper;
  }

  it('child-story: 親に epicId があれば子 Story が継承する', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await mountAndOpenSplit(
      { ...baseProps, splitMode: 'child-story', allowedTypes: ['story'] as TicketType[],
        current: [], next: [], backlog: [story('US-1', 'EP-9')] },
      'US-1', '最小ゴール提案を返す',
    );
    await wrapper.get('[data-testid=split-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).toHaveBeenCalledTimes(1);
    expect(mocks.createTicket.mock.calls[0]![0]).toMatchObject({ type: 'story', parentTicketId: 'US-1', epicId: 'EP-9' });
  });

  it('child-story: 親に epicId が無い時はダイアログで選んだ Epic を子に付ける', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await mountAndOpenSplit(
      { ...baseProps, splitMode: 'child-story', allowedTypes: ['story'] as TicketType[],
        current: [], next: [], backlog: [story('US-2')] },
      'US-2', '子 Story A',
    );
    await wrapper.get('[data-testid=split-epic]').setValue('EP-1');
    await wrapper.get('[data-testid=split-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).toHaveBeenCalledTimes(1);
    expect(mocks.createTicket.mock.calls[0]![0]).toMatchObject({ type: 'story', parentTicketId: 'US-2', epicId: 'EP-1' });
  });

  it('child-story: 親も選択も Epic 無しなら createTicket を呼ばず splitError (blocker 再現)', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await mountAndOpenSplit(
      { ...baseProps, splitMode: 'child-story', allowedTypes: ['story'] as TicketType[],
        current: [], next: [], backlog: [story('US-3')] },
      'US-3', '子 Story X',
    );
    await wrapper.get('[data-testid=split-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid=split-error]').text()).toContain('親 Epic');
  });

  it('task-spike: 子 Task には epicId を付けない (親が epicId 持ちでも)', async () => {
    mocks.createTicket.mockClear();
    const wrapper = await mountAndOpenSplit(
      { ...baseProps, splitMode: 'task-spike', allowedTypes: ['task'] as TicketType[],
        current: [story('US-4', 'EP-9')], next: [], backlog: [] },
      'US-4', 'API 実装',
    );
    await wrapper.get('[data-testid=split-submit]').trigger('click');
    await flushPromises();
    expect(mocks.createTicket).toHaveBeenCalledTimes(1);
    const arg = mocks.createTicket.mock.calls[0]![0];
    expect(arg).toMatchObject({ type: 'task', parentTicketId: 'US-4' });
    expect(arg).not.toHaveProperty('epicId');
  });
});

// ===== WC-517e029a: 区画の折り畳み + localStorage 保持 =====
// 配線を固定する: ヘッダクリックで caret の open が反転し localStorage に保存される / 保存済みなら
// 再マウントで復元 / New issue は @click.stop でトグルしない。物理的な見た目は review で目視。
describe('SprintSectionedList 区画の折り畳み (WC-517e029a)', () => {
  const props = { ...baseProps, current: [t('A')], next: [t('B')], backlog: [t('C')] };
  // nuxt test 環境の localStorage は partial (clear 無し) なので、フル機能の in-memory mock に差し替える。
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('既定は全区画オープン (caret に open)', async () => {
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    expect(wrapper.find('[data-testid=section-toggle-current] .sec-caret').classes()).toContain('open');
    expect(wrapper.find('[data-testid=section-toggle-backlog] .sec-caret').classes()).toContain('open');
  });

  it('ヘッダクリックで折り畳み → caret から open が外れ localStorage に保存される', async () => {
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    await wrapper.get('[data-testid=section-toggle-backlog]').trigger('click');
    expect(wrapper.find('[data-testid=section-toggle-backlog] .sec-caret').classes()).not.toContain('open');
    const saved = JSON.parse(localStorage.getItem('belv:section-collapsed') ?? '{}');
    expect(saved.backlog).toBe(true);
    expect(saved.current).toBe(false);
  });

  it('localStorage に保存済みなら再マウントで折り畳み状態を復元する', async () => {
    localStorage.setItem('belv:section-collapsed', JSON.stringify({ current: true, next: false, backlog: false }));
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    expect(wrapper.find('[data-testid=section-toggle-current] .sec-caret').classes()).not.toContain('open');
    expect(wrapper.find('[data-testid=section-toggle-next] .sec-caret').classes()).toContain('open');
  });

  it('New issue ボタンのクリックは折り畳みをトグルしない (@click.stop)', async () => {
    const wrapper = await mountSuspended(SprintSectionedList, { props });
    await wrapper.get('[data-testid=section-new-ticket-btn]').trigger('click');
    expect(wrapper.find('[data-testid=section-toggle-backlog] .sec-caret').classes()).toContain('open');
    expect(wrapper.find('[data-testid=create-dialog]').exists()).toBe(true);
  });
});
