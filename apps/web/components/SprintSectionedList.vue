<script setup lang="ts">
// 儀式画面の 3 区画共通ビュー (Wave 1 / 2026-06-13)。
// Backlog / Refinement / Planning が共有する「CURRENT / NEXT / BACKLOG」セクションリスト。
//
// 区画内 d&d 並び替え: 各区画の VueDraggable (vue-draggable-plus / SortableJS) が DOM 並びを確定し、
//   onDragEnd で「移動先区画の全 id を新並び順で」reorderTickets に渡し区画全体を密再採番する。
// 区画跨ぎ d&d 移動: ドラッグ開始区画とドロップ先区画が異なれば、同じ reorderTickets 呼出に
//   movedId + sprintId (current=activeSprint.id / next=nextPlanned.id / backlog=null) を載せ、
//   その 1 件だけ sprint を変える (区画内の他チケットの sprintId は触らない)。
// within vs across の判別: fromSection (開始区画) と toSection (drop 先) を比較。
// ※ 旧「近傍 2 行の orderBetween で 1 件 patch」は区画内に orderIndex 未設定/等値が在ると破綻したため撤去。

import type { Ticket, Priority, TicketType, Member, Sprint } from '@belvedere/shared';
import { VueDraggable } from 'vue-draggable-plus';

type SectionKey = 'current' | 'next' | 'backlog';

const props = defineProps<{
  current: Ticket[];
  next: Ticket[];
  backlog: Ticket[];
  selectedId: string | null;
  members: Member[];
  sprints: Sprint[];
  /** CURRENT セクションのラベル (例: "Sprint 13")。 */
  currentLabel?: string;
  /** NEXT セクションのラベル (例: "Sprint 14 (planned)")。 */
  nextLabel?: string;
  /** 作成ダイアログの種別セレクタに出す候補。incident/bug は全画面、story は Backlog のみ。 */
  allowedTypes: TicketType[];
  /**
   * 行内「分割」アクションのモード。
   * - 'child-story': Refinement — story を最小価値の子 Story に分割 (子 type=story)。
   * - 'task-spike': Planning — CURRENT の story を Task/Spike に分割 (子 type=task|spike)。
   * - 未指定: 分割ボタンを出さない (Backlog)。
   * いずれも story 種別の行にのみボタンを出し、子は parentTicketId で親に紐付ける。
   */
  splitMode?: 'child-story' | 'task-spike';
  /**
   * BACKLOG セクション内の「New issue」ボタンを隠す。
   * Backlog 画面は上部ツールバーに専用の New issue があるため二重になるので true を渡す。
   * Refinement/Planning はツールバー側に作成導線が無いので false (既定) のまま section 側を使う。
   */
  hideSectionCreate?: boolean;
  /**
   * 並び替え d&d を無効化する (既定 false)。
   * Backlog 画面でフィルタ適用中は区画の一部しか表示されず、可視分だけ密再採番すると隠れた
   * 同区画チケットと orderIndex が混ざって順序が崩れる (= 報告バグと同型) ため、フィルタ中は true。
   */
  reorderDisabled?: boolean;
  /** 各行 #extra スロット用に finding ピル等を行が描く前提なので追加 props は不要。 */
}>();

const emit = defineEmits<{
  select: [id: string];
  /** 作成成功後 (親で findings 再取得などに使う)。 */
  created: [];
}>();

// 各行右の追加スロット (Refinement の「ポーカー開始」等)。デフォルトは StatusDot のみ。
defineSlots<{
  'row-extra'(props: { ticket: Ticket }): unknown;
}>();

const { createTicket, reorderTickets, isLoading: createLoading, error: liveError } = useTickets();
const { findingsFor } = useFindings();
const { checkStory, checking: storyChecking } = useStoryCheck();
const { activeSprint, nextPlanned } = useSprints();
const { selectableEpics, fetchEpics, createEpic, error: epicsError } = useEpics();
const { me } = useMe();

// 並び替え (= backlog.reorder) は PO/admin のみ (permissions.ts MATRIX)。非 PO がドラッグして
// サーバで 403 → 無言 revert する紛らわしさを防ぐため、UI 側でも drag を無効化する。
// me 未取得 (初期ロード) の間は許可側に倒して admin を誤って止めない (server 側 can('backlog.reorder') が最終防衛線)。
const canReorder = computed(() => {
  const r = me.value?.role;
  if (!r) return true;
  return r === 'admin' || r === 'po';
});
// フィルタ中 (props.reorderDisabled) または並び替え権限なしのとき d&d を無効化する。
const reorderBlocked = computed(() => props.reorderDisabled || !canReorder.value);

// 複数選択 (全区画跨ぎ選択可)。BulkActionBar は上部に 1 つ。
const sel = useTicketSelection();
const allVisibleIds = computed(() => [
  ...props.current.map((t) => t.id),
  ...props.next.map((t) => t.id),
  ...props.backlog.map((t) => t.id),
]);

// ===== d&d は SortableJS (vue-draggable-plus) で実装 =====
// 自前 pointer 実装は cross-section / 選択抑止 / ドロップ位置で edge case を量産したため廃止。
// SortableJS は Trello/Jira 級で実績があり、group でリスト間移動、handle で点々限定ドラッグ、
// native テキスト選択抑止を内蔵する。各区画を同じ group の VueDraggable にし、ドロップ確定 (onEnd)
// で「移動先区画の全 id を新並び順で」reorderTickets に送り区画全体を密再採番 (+跨ぎは sprintId) する。
const rootEl = ref<HTMLElement | null>(null);
// 区画ごとの SortableJS group。pull(出す) は常に可。put(受け入れ) は「その区画に対応する
// スプリントが在る」時だけ可にする: 計画中(NEXT)スプリントが無い環境では NEXT へ put:false →
// ドロップ自体を受け付けず「移動先に出るが離すと戻る」紛らわしい挙動を防ぐ。
// (backlog は未割当=常に受け入れ可。current は active sprint がある時のみ)
const DRAG_GROUP = 'belv-sections';
// put 関数は SortableJS が dragover 毎に呼ぶので activeSprint/nextPlanned を都度ライブで読む
// (静的オブジェクトで OK・group 再 init を避ける)。スプリント不在なら受け入れ false。
const currentGroup = { name: DRAG_GROUP, put: (): boolean => !!activeSprint.value };
const nextGroup = { name: DRAG_GROUP, put: (): boolean => !!nextPlanned.value };
const backlogGroup = { name: DRAG_GROUP };

// VueDraggable は v-model に可変配列を要求するので props の computed をローカルにミラーする。
// SortableJS が並べ替え → onEnd で patch → tickets 更新 → props 変化 → watch で再同期、のループ。
const currentList = ref<Ticket[]>([]);
const nextList = ref<Ticket[]>([]);
const backlogList = ref<Ticket[]>([]);
function syncLists(): void {
  currentList.value = [...props.current];
  nextList.value = [...props.next];
  backlogList.value = [...props.backlog];
}
syncLists();
watch(() => [props.current, props.next, props.backlog], syncLists);

function listRefFor(section: SectionKey) {
  return section === 'current' ? currentList : section === 'next' ? nextList : backlogList;
}

// SortableJS のドロップ確定。evt.item=ドラッグ行 / evt.from,to=移動元,先リスト(data-section付き)。
// 並べ替えは既にローカル配列へ反映済 → 移動先区画の全 id を新並び順でサーバへ送り密再採番する。
// 旧「近傍 2 行の中点を 1 件 patch」は区画内に orderIndex 未設定/等値が在ると先頭ジャンプや
// 元位置復帰を起こした (orderBetween + compareTicketOrder 規則2) ため、区画全体の再採番に統一。
async function onDragEnd(evt: { item: HTMLElement; from: HTMLElement; to: HTMLElement }): Promise<void> {
  const id = evt.item?.getAttribute?.('data-ticket-id') ?? null;
  const fromSection = (evt.from?.getAttribute?.('data-section') ?? null) as SectionKey | null;
  const toSection = (evt.to?.getAttribute?.('data-section') ?? null) as SectionKey | null;
  if (!id || !toSection) { syncLists(); return; }
  const list = listRefFor(toSection).value;
  if (!list.some((t) => t.id === id)) { syncLists(); return; }
  const input: { orderedIds: string[]; movedId?: string; sprintId?: string | null } = {
    orderedIds: list.map((t) => t.id),
  };
  // 区画が変わったら movedId 1 件だけ sprintId を変更 (current=active / next=planned / backlog=null 解除)。
  if (fromSection !== toSection) {
    if (toSection === 'current') {
      if (!activeSprint.value) { syncLists(); return; }
      input.movedId = id;
      input.sprintId = activeSprint.value.id;
    } else if (toSection === 'next') {
      if (!nextPlanned.value) { syncLists(); return; }
      input.movedId = id;
      input.sprintId = nextPlanned.value.id;
    } else {
      input.movedId = id;
      input.sprintId = null;
    }
  }
  const res = await reorderTickets(input);
  if (!res) syncLists(); // 失敗時はサーバ状態へ戻す (成功時の findings 再取得は useTickets が担う)
}

// ===== セクション統計 =====
function stats(list: Ticket[]) {
  return {
    count: list.length,
    sp: list.reduce((n, t) => n + (t.estimatePt ?? 0), 0),
    flagged: list.filter((t) => findingsFor(t.id).length > 0).length,
  };
}
const currentStats = computed(() => stats(props.current));
const nextStats = computed(() => stats(props.next));
const backlogStats = computed(() => stats(props.backlog));

// ===== 新規作成ダイアログ (allowedTypes で種別を制限) =====
const showCreateDialog = ref(false);
const newTitle = ref('');
const newType = ref<TicketType>(props.allowedTypes[0] ?? 'task');
const newPriority = ref<Priority>('medium');
const newTimebox = ref<number | null>(null);
const createError = ref<string | null>(null);

// 起票先の区画 (Backlog / Next / Current)。作成時にそのまま sprintId に変換する。
type CreateSection = 'backlog' | 'next' | 'current';
const newSection = ref<CreateSection>('backlog');
// 実在する区画だけ選べるようにする (active/planned スプリントが無ければ Backlog のみ)。
const sectionOptions = computed<{ value: CreateSection; label: string }[]>(() => {
  const opts: { value: CreateSection; label: string }[] = [{ value: 'backlog', label: 'Backlog (未スケジュール)' }];
  if (nextPlanned.value) opts.push({ value: 'next', label: props.nextLabel ?? 'Next Sprint' });
  if (activeSprint.value) opts.push({ value: 'current', label: props.currentLabel ?? 'Current Sprint' });
  return opts;
});
function sprintIdForSection(s: CreateSection): string | undefined {
  if (s === 'current') return activeSprint.value?.id;
  if (s === 'next') return nextPlanned.value?.id;
  return undefined;
}

const suggestSpike = computed(
  () => props.allowedTypes.includes('spike') && /(調査|検証|比較|スパイク)/.test(newTitle.value) && newType.value !== 'spike',
);
function applySpike(): void { newType.value = 'spike'; }

// ===== User Story 3 欄フォーム + AI 品質チェック (newType==='story' のとき) =====
// 「誰が / 何をしたい / なぜ」で description を構成し、起票前に AI で形骸化 + ゴール適合を診断する。
const usAsA = ref('');
const usIWant = ref('');
const usSoThat = ref('');
const storyVerdict = ref<StoryQualityVerdict | null>(null);
// story の親 Epic (案A: story 作成時は必須)。selectableEpics から選ぶ。
const newEpicId = ref<string>('');

// ===== インライン Epic 作成 (ユーザー決定2部目: Story を作れる儀式で Epic も追加できる) =====
// Story 作成フォームの親 Epic セレクタの隣で「その場で Epic を作って即選択」できる。
// epic 0 件の workspace でも story を作れるようにする (案A の必須化が行き止まりにならない)。
const showEpicCreate = ref(false);
const newEpicName = ref('');
const newEpicRationale = ref('');
const epicCreateBusy = ref(false);
const epicCreateError = ref<string | null>(null);

function toggleEpicCreate(): void {
  showEpicCreate.value = !showEpicCreate.value;
  epicCreateError.value = null;
}

async function submitEpicCreate(): Promise<void> {
  epicCreateError.value = null;
  const name = newEpicName.value.trim();
  if (!name) {
    epicCreateError.value = 'Epic 名は必須です';
    return;
  }
  epicCreateBusy.value = true;
  const created = await createEpic({
    name,
    ...(newEpicRationale.value.trim() && { rationale: newEpicRationale.value.trim() }),
  });
  epicCreateBusy.value = false;
  if (created) {
    newEpicId.value = created.id; // 作った Epic を即・親に選択
    showEpicCreate.value = false;
    newEpicName.value = '';
    newEpicRationale.value = '';
  } else {
    epicCreateError.value = epicsError.value ?? 'Epic 作成に失敗しました';
  }
}

const isStory = computed(() => newType.value === 'story');
// US の title は 3 欄から自動生成 (空欄時)。手入力 title があればそれを優先。
const composedStoryTitle = computed(() =>
  usAsA.value.trim() && usIWant.value.trim() ? `${usAsA.value.trim()}として${usIWant.value.trim()}` : '',
);
function composeStoryDescription(): string {
  return [
    `**誰が:** ${usAsA.value.trim() || '—'}`,
    `**何をしたい:** ${usIWant.value.trim() || '—'}`,
    `**なぜ:** ${usSoThat.value.trim() || '—'}`,
  ].join('\n');
}

async function runStoryCheck(): Promise<void> {
  storyVerdict.value = await checkStory({
    asA: usAsA.value,
    iWant: usIWant.value,
    soThat: usSoThat.value,
    title: newTitle.value,
  });
}

function openCreate(): void {
  newTitle.value = '';
  newType.value = props.allowedTypes[0] ?? 'task';
  newPriority.value = 'medium';
  newTimebox.value = null;
  createError.value = null;
  usAsA.value = '';
  usIWant.value = '';
  usSoThat.value = '';
  storyVerdict.value = null;
  newEpicId.value = '';
  showEpicCreate.value = false;
  newEpicName.value = '';
  newEpicRationale.value = '';
  epicCreateError.value = null;
  newSection.value = 'backlog';
  // story 作成時の親 Epic セレクタ用に Epic 一覧を確実に読み込む (単体マウント経路でも空にしない)。
  void fetchEpics();
  showCreateDialog.value = true;
}

// 入力が変わったら前回の AI 診断結果は古くなるので破棄する。
watch([usAsA, usIWant, usSoThat, newType], () => { storyVerdict.value = null; });

defineExpose({ openCreate });

// U-2: ESC で作成ダイアログを閉じる (入力中は無視)。
onMounted(() => {
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (showSplitDialog.value) { e.stopPropagation(); showSplitDialog.value = false; return; }
    if (showCreateDialog.value) { e.stopPropagation(); showCreateDialog.value = false; }
  };
  document.addEventListener('keydown', onKeydown);
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
});

// サーバの epic 関連エラーコードを日本語に翻訳 (それ以外は素通し)。案A の 400 を原因が伝わる文言にする。
function translateTicketError(code: string | null): string | null {
  if (code === 'epic_required') return '親 Epic が未設定です。親 Epic を選択してください';
  if (code === 'epic_not_found') return '指定した親 Epic が見つかりません';
  return code;
}

async function submitCreate(): Promise<void> {
  createError.value = null;
  // US は title を手入力 or 3 欄から自動生成。それ以外は title 必須。
  const effectiveTitle = isStory.value ? (newTitle.value.trim() || composedStoryTitle.value) : newTitle.value.trim();
  if (!effectiveTitle) {
    createError.value = isStory.value ? '「誰が」と「何をしたい」を入力してください' : 'タイトルは必須です';
    return;
  }
  // story は親 Epic 必須 (案A)。サーバ 400 に頼らず UI で弾く。
  if (isStory.value && !newEpicId.value) {
    createError.value = '親 Epic を選択してください';
    return;
  }
  const input: {
    title: string; priority: Priority; type: TicketType;
    estimatePt?: number; timeboxHours?: number; description?: string;
    sprintId?: string; status?: 'backlog' | 'todo'; epicId?: string;
  } = {
    title: effectiveTitle,
    priority: newPriority.value,
    type: newType.value,
  };
  if (isStory.value) {
    input.description = composeStoryDescription();
    input.epicId = newEpicId.value;
  } else if (newType.value === 'spike') {
    if (newTimebox.value !== null) input.timeboxHours = newTimebox.value;
  }
  // bug / incident / task は作成時に Story Point を設定しない。
  // story と同様、見積もりは見積もりポーカー (EstimationPanel) で全員で決める (WC-9460f690)。
  // 起票先区画 → sprintId/status。Current/Next はスプリント内なので todo、Backlog は未スケジュール。
  const sid = sprintIdForSection(newSection.value);
  if (sid !== undefined) {
    input.sprintId = sid;
    input.status = 'todo';
  }
  const created = await createTicket(input);
  if (created) {
    showCreateDialog.value = false;
    emit('created');
  } else {
    createError.value = translateTicketError(liveError.value) ?? 'API 呼出失敗';
  }
}

// ===== 分割アクション (story → 子チケット) =====
const showSplitDialog = ref(false);
const splitParent = ref<Ticket | null>(null);
const splitRows = ref<{ title: string; type: TicketType }[]>([]);
const splitBusy = ref(false);
const splitError = ref<string | null>(null);
// child-story 分割で親に epicId が無いとき、子 Story に付ける親 Epic (案A: 分割子も親 Epic 必須)。
// seed の story は epicId を持たない (grandfather) ため、それを分割する時はここで選ばせる。
const splitEpicId = ref<string>('');

// child-story モードかつ親に epicId が無い → 子 Story の親 Epic を分割ダイアログで選ばせる。
const splitNeedsEpic = computed(
  () => props.splitMode !== 'task-spike' && splitParent.value?.epicId === undefined,
);

// task-spike モードの子種別候補。child-story モードは常に story。
const splitChildTypes: TicketType[] = ['task', 'spike'];
const splitChildLabel = computed(() => (props.splitMode === 'task-spike' ? 'Task / Spike に分割' : '子 Story に分割'));

function defaultChildType(): TicketType {
  return props.splitMode === 'task-spike' ? 'task' : 'story';
}

function openSplit(t: Ticket): void {
  splitParent.value = t;
  splitRows.value = [
    { title: '', type: defaultChildType() },
    { title: '', type: defaultChildType() },
  ];
  splitError.value = null;
  splitEpicId.value = '';
  // child-story 分割で親に epicId が無いとき、子 Story の親 Epic を選ばせるため Epic 一覧を読み込む。
  if (props.splitMode !== 'task-spike' && t.epicId === undefined) void fetchEpics();
  showSplitDialog.value = true;
}

function addSplitRow(): void {
  splitRows.value = [...splitRows.value, { title: '', type: defaultChildType() }];
}
function removeSplitRow(i: number): void {
  splitRows.value = splitRows.value.filter((_, idx) => idx !== i);
}

async function submitSplit(): Promise<void> {
  const parent = splitParent.value;
  if (!parent) return;
  const rows = splitRows.value.filter((r) => r.title.trim());
  if (rows.length === 0) {
    splitError.value = '子チケットのタイトルを 1 件以上入力してください';
    return;
  }
  // child-story モードの子 Story は親 Epic が必須 (案A)。親の epicId を継承し、親に無ければ
  // (seed story 等) ダイアログで選んだ splitEpicId を使う。どちらも無ければ UI で弾く (サーバ 400 前)。
  const isChildStory = props.splitMode !== 'task-spike';
  const childEpicId = isChildStory ? (parent.epicId ?? splitEpicId.value) : '';
  if (isChildStory && !childEpicId) {
    splitError.value = '子 Story の親 Epic を選択してください';
    return;
  }
  splitBusy.value = true;
  splitError.value = null;
  try {
    for (const r of rows) {
      const input: {
        title: string; type: TicketType; priority: Priority; parentTicketId: string;
        sprintId?: string; status?: 'backlog' | 'todo'; epicId?: string;
      } = {
        title: r.title.trim(),
        type: props.splitMode === 'task-spike' ? r.type : 'story',
        priority: parent.priority,
        parentTicketId: parent.id,
        // 子は親のスプリントを継承 (CURRENT story → Task は CURRENT、Backlog US → 子 Story は未割当)。
        ...(parent.sprintId !== undefined && { sprintId: parent.sprintId }),
        // child-story モード (子 type=story) は親 Epic 必須: 親の epicId を継承、無ければ選択値を使う。
        // task-spike モード (子 Task/Spike) は epicId 不要なので付けない。
        ...(isChildStory && childEpicId !== '' && { epicId: childEpicId }),
        status: parent.sprintId ? 'todo' : 'backlog',
      };
      const created = await createTicket(input);
      if (!created) throw new Error(translateTicketError(liveError.value) ?? `「${r.title}」の作成に失敗しました`);
    }
    showSplitDialog.value = false;
    emit('created');
  } catch (e) {
    splitError.value = e instanceof Error ? e.message : '分割に失敗しました';
  } finally {
    splitBusy.value = false;
  }
}
</script>

<template>
  <div ref="rootEl" class="screen-body" data-testid="live-section">
    <BulkActionBar
      v-if="sel.count.value > 0"
      :count="sel.count.value"
      :members="members"
      :sprints="sprints"
      :busy="sel.isBusy.value"
      @set-status="(s) => sel.applyToSelected({ status: s })"
      @set-assignee="(a) => sel.applyToSelected({ assigneeId: a })"
      @set-priority="(p) => sel.applyToSelected({ priority: p })"
      @set-value-impact="(v) => sel.applyToSelected({ valueImpact: v })"
      @set-sprint="(sp) => sel.applyToSelected({ sprintId: sp })"
      @remove="sel.removeSelected"
      @clear="sel.clear"
      @select-all="() => sel.selectMany(allVisibleIds)"
    />

    <!-- CURRENT SPRINT -->
    <div class="backlog-section" data-testid="section-current">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">{{ currentLabel ?? 'Current Sprint' }}</span>
        <span class="chip amber solid">CURRENT</span>
        <div class="meta">
          <span><b>{{ currentStats.count }}</b> issues</span>
          <span><b>{{ currentStats.sp }}</b> SP</span>
          <span><b>{{ currentStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <VueDraggable v-model="currentList" :group="currentGroup" handle=".trow-drag-grab"
                    :disabled="reorderBlocked" :animation="150" :force-fallback="true"
                    data-section="current" class="dnd-list" @end="onDragEnd">
        <TicketRow v-for="t in currentList" :key="t.id" :t="t" data-testid="live-ticket"
                   :selected="selectedId === t.id" drag-handle reorderable
                   selectable :bulk-selected="sel.isSelected(t.id)"
                   @click="emit('select', t.id)"
                   @toggle-select="sel.toggle(t.id)">
          <template #extra>
            <button v-if="splitMode && t.type === 'story'" class="split-btn"
                    :data-testid="`split-${t.id}`" :title="splitChildLabel"
                    @click.stop="openSplit(t)">分割</button>
            <slot name="row-extra" :ticket="t" />
            <StatusDot :status="t.status" />
          </template>
        </TicketRow>
      </VueDraggable>
      <p v-if="currentList.length === 0" class="live-msg">アクティブスプリントにチケットがありません。</p>
    </div>

    <!-- NEXT SPRINT -->
    <div class="backlog-section" data-testid="section-next">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">{{ nextLabel ?? 'Next Sprint' }}</span>
        <span class="chip amber">NEXT</span>
        <div class="meta">
          <span><b>{{ nextStats.count }}</b> issues</span>
          <span><b>{{ nextStats.sp }}</b> SP</span>
          <span><b>{{ nextStats.flagged }}</b> flagged</span>
        </div>
      </div>
      <VueDraggable v-model="nextList" :group="nextGroup" handle=".trow-drag-grab"
                    :disabled="reorderBlocked" :animation="150" :force-fallback="true"
                    data-section="next" class="dnd-list" @end="onDragEnd">
        <TicketRow v-for="t in nextList" :key="t.id" :t="t" data-testid="live-ticket"
                   :selected="selectedId === t.id" drag-handle reorderable
                   selectable :bulk-selected="sel.isSelected(t.id)"
                   @click="emit('select', t.id)"
                   @toggle-select="sel.toggle(t.id)">
          <template #extra>
            <button v-if="splitMode && t.type === 'story'" class="split-btn"
                    :data-testid="`split-${t.id}`" :title="splitChildLabel"
                    @click.stop="openSplit(t)">分割</button>
            <slot name="row-extra" :ticket="t" />
            <StatusDot :status="t.status" />
          </template>
        </TicketRow>
      </VueDraggable>
      <p v-if="nextList.length === 0" class="live-msg">計画中スプリントにチケットがありません。</p>
    </div>

    <!-- BACKLOG (未スケジュール) -->
    <div class="backlog-section" data-testid="section-backlog">
      <div class="backlog-section-head">
        <Icon name="caretRight" />
        <span class="title">Backlog</span>
        <span class="chip">UNSCHEDULED</span>
        <div class="meta">
          <span><b>{{ backlogStats.count }}</b> issues</span>
          <span><b>{{ backlogStats.sp }}</b> SP</span>
          <span><b>{{ backlogStats.flagged }}</b> flagged</span>
        </div>
        <button v-if="!hideSectionCreate" class="h-btn" data-testid="section-new-ticket-btn" style="margin-left: 16px"
                @click="openCreate"><Icon name="plus" /> New issue</button>
      </div>
      <VueDraggable v-model="backlogList" :group="backlogGroup" handle=".trow-drag-grab"
                    :disabled="reorderBlocked" :animation="150" :force-fallback="true"
                    data-section="backlog" class="dnd-list" @end="onDragEnd">
        <TicketRow v-for="t in backlogList" :key="t.id" :t="t" data-testid="live-ticket"
                   :selected="selectedId === t.id" drag-handle reorderable
                   selectable :bulk-selected="sel.isSelected(t.id)"
                   @click="emit('select', t.id)"
                   @toggle-select="sel.toggle(t.id)">
          <template #extra>
            <button v-if="splitMode && t.type === 'story'" class="split-btn"
                    :data-testid="`split-${t.id}`" :title="splitChildLabel"
                    @click.stop="openSplit(t)">分割</button>
            <slot name="row-extra" :ticket="t" />
            <StatusDot :status="t.status" />
          </template>
        </TicketRow>
      </VueDraggable>
      <p v-if="backlogList.length === 0" class="live-msg">未スケジュールのチケットはありません。</p>
    </div>
  </div>

  <!-- 新規作成ダイアログ (allowedTypes で種別制限) -->
  <div v-if="showCreateDialog" class="dialog-overlay" data-testid="create-dialog" @click.self="showCreateDialog = false">
    <div class="dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">新規チケット</h2>
        <button class="close-btn" @click="showCreateDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <!-- 種別セレクタ (story を選ぶと 3 欄フォームに切り替わる) -->
        <div class="field">
          <label class="label" for="ssl-new-type">種別</label>
          <select id="ssl-new-type" v-model="newType" data-testid="new-ticket-type" class="select-input">
            <option v-for="tp in allowedTypes" :key="tp" :value="tp">{{ tp }}</option>
          </select>
        </div>

        <!-- User Story: 誰が / 何をしたい / なぜ の 3 欄 + AI 品質チェック -->
        <template v-if="isStory">
          <div class="field">
            <label class="label" for="ssl-us-asa">誰が <span class="req">*</span></label>
            <input id="ssl-us-asa" v-model="usAsA" data-testid="us-asa" type="text" class="text-input"
                   maxlength="80" placeholder="例: 初めて使う運営担当者" />
          </div>
          <div class="field">
            <label class="label" for="ssl-us-iwant">何をしたい <span class="req">*</span></label>
            <input id="ssl-us-iwant" v-model="usIWant" data-testid="us-iwant" type="text" class="text-input"
                   maxlength="120" placeholder="例: スプリント開始時にゴール候補を AI に提案してほしい" />
          </div>
          <div class="field">
            <label class="label" for="ssl-us-sothat">なぜ <span class="req">*</span></label>
            <input id="ssl-us-sothat" v-model="usSoThat" data-testid="us-sothat" type="text" class="text-input"
                   maxlength="160" placeholder="例: 測定可能なゴールを定義でき、レビュー時の判定が割れない" />
          </div>
          <!-- 親 Epic は story 作成時に必須 (案A)。実在 Epic から選ぶ or その場で作る (決定2部目)。 -->
          <div class="field">
            <label class="label" for="ssl-us-epic">親 Epic <span class="req">*</span></label>
            <div class="epic-select-row">
              <select id="ssl-us-epic" v-model="newEpicId" data-testid="us-epic" class="select-input">
                <option value="" disabled>親 Epic を選択</option>
                <option v-for="e in selectableEpics" :key="e.id" :value="e.id">{{ e.name }}</option>
              </select>
              <button type="button" class="epic-new-btn" data-testid="epic-new-toggle" @click="toggleEpicCreate">
                {{ showEpicCreate ? '閉じる' : '+ 新規 Epic' }}
              </button>
            </div>
            <p v-if="selectableEpics.length === 0 && !showEpicCreate" class="us-epic-empty" data-testid="us-epic-empty">
              選択できる Epic がありません。「+ 新規 Epic」でこの場で作成してください。
            </p>
            <!-- インライン Epic 作成: Story を作る流れのまま親 Epic を新設して即選択する -->
            <div v-if="showEpicCreate" class="epic-create" data-testid="epic-create">
              <input v-model="newEpicName" data-testid="epic-new-name" type="text" class="text-input"
                     maxlength="120" placeholder="Epic 名 (例: スプリント運営の自動化)" />
              <input v-model="newEpicRationale" data-testid="epic-new-rationale" type="text" class="text-input"
                     maxlength="200" placeholder="戦略意図 / なぜこの Epic か (任意)" />
              <div class="epic-create-foot">
                <button type="button" class="btn-primary" data-testid="epic-new-submit"
                        :disabled="epicCreateBusy" @click="submitEpicCreate">
                  {{ epicCreateBusy ? '作成中…' : 'Epic を作成' }}
                </button>
              </div>
              <p v-if="epicCreateError" class="msg-error" data-testid="epic-new-error">{{ epicCreateError }}</p>
            </div>
          </div>
          <p v-if="composedStoryTitle" class="us-preview">
            プレビュー: <b>{{ newTitle.trim() || composedStoryTitle }}</b>
          </p>

          <!-- AI 品質チェック -->
          <div class="us-check">
            <button type="button" class="us-check-btn" data-testid="us-ai-check"
                    :disabled="storyChecking || (!usSoThat.trim() && !usIWant.trim())"
                    @click="runStoryCheck">
              <Icon name="sparkle" /> {{ storyChecking ? 'AI 診断中…' : 'AI で品質チェック' }}
            </button>
            <div v-if="storyVerdict" class="us-verdict" data-testid="us-verdict">
              <p v-if="storyVerdict.ok" class="us-verdict-ok" data-testid="us-verdict-ok">
                ✓ AI: 形骸化なし・ゴール整合。起票できます。
              </p>
              <ul v-else class="us-verdict-issues">
                <li v-for="(iss, i) in storyVerdict.issues" :key="i"
                    :class="['us-issue', iss.severity]" :data-testid="`us-issue-${iss.kind}`">
                  <span class="us-issue-kind">{{ iss.kind === 'boilerplate' ? '形骸化' : 'ゴール適合' }}</span>
                  {{ iss.message }}
                </li>
              </ul>
              <p v-if="storyVerdict.suggestion" class="us-suggestion">{{ storyVerdict.suggestion }}</p>
            </div>
          </div>
        </template>

        <!-- 非 US (incident/bug/task/spike): タイトル直接入力 -->
        <div v-else class="field">
          <label class="label" for="ssl-new-title">タイトル <span class="req">*</span></label>
          <input
            id="ssl-new-title"
            v-model="newTitle"
            data-testid="new-ticket-title"
            type="text"
            class="text-input"
            maxlength="200"
            placeholder="例: ログイン画面の入力 validation を追加"
          />
        </div>
        <div v-if="!isStory && suggestSpike" class="spike-hint">
          <span>💡 調査系のタイトルです。Spike にしますか?</span>
          <button type="button" class="spike-btn" data-testid="suggest-spike" @click="applySpike">Spike にする</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="label" for="ssl-new-priority">優先度</label>
            <select id="ssl-new-priority" v-model="newPriority" data-testid="new-ticket-priority" class="select-input">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="ssl-new-section">起票先</label>
            <select id="ssl-new-section" v-model="newSection" data-testid="new-ticket-section" class="select-input">
              <option v-for="o in sectionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div v-if="newType === 'spike'" class="field">
            <label class="label" for="ssl-new-timebox">Timebox (時間)</label>
            <input
              id="ssl-new-timebox"
              v-model.number="newTimebox"
              data-testid="new-ticket-timebox"
              type="number"
              class="text-input"
              min="0"
              max="80"
              placeholder="4"
            />
          </div>
        </div>
        <p v-if="createError" class="msg-error" data-testid="create-error">{{ createError }}</p>
      </div>
      <div class="dialog-foot">
        <button class="btn-cancel" @click="showCreateDialog = false">キャンセル</button>
        <button class="btn-primary" data-testid="submit-create" :disabled="createLoading" @click="submitCreate">
          {{ createLoading ? '作成中…' : '作成' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 分割ダイアログ (story → 子チケット。子は parentTicketId で親に紐付く) -->
  <div v-if="showSplitDialog" class="dialog-overlay" data-testid="split-dialog" @click.self="showSplitDialog = false">
    <div class="dialog split-dialog">
      <div class="dialog-head">
        <h2 class="dialog-title">{{ splitChildLabel }}</h2>
        <button class="close-btn" @click="showSplitDialog = false">×</button>
      </div>
      <div class="dialog-body">
        <p v-if="splitParent" class="split-parent">
          親: <span class="t-mono">{{ splitParent.id }}</span> {{ splitParent.title }}
        </p>
        <!-- child-story 分割で親に epicId が無い場合の親 Epic セレクタ (案A: 子 Story も親 Epic 必須) -->
        <div v-if="splitNeedsEpic" class="field">
          <label class="label" for="ssl-split-epic">子 Story の親 Epic <span class="req">*</span></label>
          <select id="ssl-split-epic" v-model="splitEpicId" data-testid="split-epic" class="select-input">
            <option value="" disabled>親 Epic を選択</option>
            <option v-for="e in selectableEpics" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
          <p v-if="selectableEpics.length === 0" class="us-epic-empty" data-testid="split-epic-empty">
            選択できる Epic がありません。先に Epic を作成してください。
          </p>
          <p v-else class="us-epic-empty">この Story は親 Epic 未設定です。分割で作る子 Story の親 Epic を選んでください。</p>
        </div>
        <div class="split-rows">
          <div v-for="(row, i) in splitRows" :key="i" class="split-row">
            <input v-model="row.title" :data-testid="`split-row-${i}`" type="text" class="text-input"
                   maxlength="160" :placeholder="splitMode === 'task-spike' ? '例: API エンドポイントを実装' : '例: 最小のゴール提案 1 案を返す'" />
            <select v-if="splitMode === 'task-spike'" v-model="row.type"
                    :data-testid="`split-type-${i}`" class="select-input split-type">
              <option v-for="ct in splitChildTypes" :key="ct" :value="ct">{{ ct }}</option>
            </select>
            <button type="button" class="split-row-del" :disabled="splitRows.length <= 1"
                    title="この行を削除" @click="removeSplitRow(i)">×</button>
          </div>
        </div>
        <button type="button" class="split-add" data-testid="split-add-row" @click="addSplitRow">
          <Icon name="plus" /> 行を追加
        </button>
        <p v-if="splitError" class="msg-error" data-testid="split-error">{{ splitError }}</p>
      </div>
      <div class="dialog-foot">
        <button class="btn-cancel" :disabled="splitBusy" @click="showSplitDialog = false">キャンセル</button>
        <button class="btn-primary" data-testid="split-submit" :disabled="splitBusy" @click="submitSplit">
          {{ splitBusy ? '分割中…' : '分割して作成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-msg {
  padding: 12px 16px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
}

/* クロス区画ドラッグ中のドロップ先ハイライト (どこに落ちるかの可視フィードバック) */
.backlog-section.drop-target {
  background: var(--accent-bg, #fff3ee);
  box-shadow: inset 0 0 0 1.5px var(--accent);
  border-radius: var(--radius);
}

/* 行内「分割」ボタン (story のみ。poker-btn と同系だが outline 調で区別) */
.split-btn {
  padding: 4px 10px;
  background: transparent;
  color: var(--accent);
  border: var(--hairline) solid var(--accent-dim, var(--line-2));
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
}
.split-btn:hover { background: var(--accent-bg, #fff3ee); }

/* User Story 3 欄フォーム — プレビュー + AI 品質チェック */
.us-preview {
  margin: 0;
  font-size: 12px;
  color: var(--ink-2);
  font-family: var(--sans);
}
.us-preview b { color: var(--ink-0); }
.us-check { display: flex; flex-direction: column; gap: 10px; }
.us-check-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  background: var(--accent-bg, #fff3ee);
  color: var(--accent);
  border: var(--hairline) solid var(--accent-dim, var(--line-2));
  border-radius: var(--radius);
  font-family: var(--sans); font-size: 12.5px; font-weight: 500; cursor: pointer;
}
.us-check-btn:hover:not(:disabled) { background: var(--accent); color: #FBF8F2; }
.us-check-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.us-verdict {
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--bg-0);
}
.us-verdict-ok { margin: 0; font-size: 12.5px; color: var(--ok); font-family: var(--sans); }
.us-verdict-issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.us-issue { font-size: 12.5px; line-height: 1.5; color: var(--ink-1); font-family: var(--sans); }
.us-issue.warn { color: var(--ink-0); }
.us-issue-kind {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em;
  background: var(--accent); color: #FBF8F2;
}
.us-issue.info .us-issue-kind { background: var(--ink-3); }
.us-suggestion { margin: 8px 0 0; font-size: 12px; color: var(--ink-2); font-family: var(--sans); }
/* 親 Epic セレクタ補助文 (create / split 共通): 候補ゼロ or 継承不能時の案内 */
.us-epic-empty { margin: 0; font-size: 12px; color: var(--ink-2); font-family: var(--sans); }
/* 親 Epic セレクタ + 「+ 新規 Epic」を横並び。インライン Epic 作成フォーム */
.epic-select-row { display: flex; gap: 8px; align-items: center; }
.epic-select-row .select-input { flex: 1; }
.epic-new-btn {
  flex: 0 0 auto; padding: 8px 12px; white-space: nowrap;
  background: transparent; color: var(--accent);
  border: var(--hairline) solid var(--accent-dim, var(--line-2)); border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; cursor: pointer;
}
.epic-new-btn:hover { background: var(--accent-bg, #fff3ee); }
.epic-create {
  margin-top: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;
  border: var(--hairline) dashed var(--accent-dim, var(--line-2)); border-radius: var(--radius);
  background: var(--bg-0);
}
.epic-create-foot { display: flex; justify-content: flex-end; }

/* 分割ダイアログ */
.split-dialog { max-width: 560px; }
.split-parent { margin: 0; font-size: 12.5px; color: var(--ink-1); font-family: var(--sans); }
.split-parent .t-mono { color: var(--ink-3); margin-right: 6px; }
.split-rows { display: flex; flex-direction: column; gap: 8px; }
.split-row { display: flex; gap: 8px; align-items: center; }
.split-row .text-input { flex: 1; }
.split-type { flex: 0 0 96px; }
.split-row-del {
  flex: 0 0 28px; height: 32px;
  background: transparent; border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  color: var(--ink-2); font-size: 16px; cursor: pointer;
}
.split-row-del:hover:not(:disabled) { background: var(--bg-2); color: var(--err); }
.split-row-del:disabled { opacity: 0.4; cursor: not-allowed; }
.split-add {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 12px; background: transparent;
  border: var(--hairline) dashed var(--line-2); border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; color: var(--ink-2); cursor: pointer;
}
.split-add:hover { border-color: var(--accent); color: var(--accent); }

/* ダイアログ (BacklogScreen と同系。scoped で持つ) */
.dialog-overlay {
  position: fixed; inset: 0;
  background: rgba(8, 8, 8, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}
.dialog {
  background: var(--bg-1);
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  width: 100%; max-width: 480px;
  box-shadow: 0 8px 32px rgba(8, 8, 8, 0.12);
  /* 縦に長いダイアログ (US 3欄 + AI 診断) が viewport を超えてもヘッダ/フッタを保持し
     本文だけスクロールさせる。フッタの作成/キャンセルが画面外に出ないようにする。 */
  display: flex; flex-direction: column;
  max-height: calc(100vh - 80px);
}
.dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--hairline) solid var(--line-1);
}
.dialog-title { font-family: var(--display); font-size: 20px; font-weight: 600; margin: 0; }
.close-btn { background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--ink-2); }
/* min-height:0 は flex 子で overflow を効かせるため必須。本文だけスクロール。 */
.dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; min-height: 0; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }
.label { font-family: var(--mono); font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; text-transform: uppercase; }
.req { color: var(--accent); }
.spike-hint {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--accent-dim);
  background: var(--accent-bg);
  border-radius: var(--radius);
  font-size: 12px; color: var(--ink-1);
}
.spike-btn {
  margin-left: auto;
  padding: 4px 10px;
  background: var(--accent); color: #FBF8F2;
  border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 12px; cursor: pointer;
  white-space: nowrap;
}
.text-input, .select-input {
  padding: 10px 12px;
  border: var(--hairline) solid var(--line-2);
  border-radius: var(--radius);
  background: var(--bg-0);
  font-family: var(--sans); font-size: 14px;
}
.text-input:focus, .select-input:focus { outline: none; border-color: var(--accent); }
.msg-error { color: var(--err); font-size: 12px; margin: 0; }
.dialog-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 16px 20px;
  border-top: var(--hairline) solid var(--line-1);
}
.btn-cancel {
  padding: 8px 16px; background: transparent;
  border: var(--hairline) solid var(--line-2); border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; cursor: pointer;
}
.btn-primary {
  padding: 8px 20px; background: var(--ink-0); color: var(--bg-0);
  border: none; border-radius: var(--radius);
  font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: var(--ink-1); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
