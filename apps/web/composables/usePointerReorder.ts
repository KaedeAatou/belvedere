// Pointer ベースの d&d 並び替え/区画移動コンポーザブル (2026-06-14, 更新 2026-06-15)。
//
// 背景: HTML5 ネイティブ DnD (draggable + dragstart/dragover/drop/dragend) は実ブラウザで
// drop/dragend の確定が高頻度に取りこぼされ、「ドラッグでオレンジは出るが離しても移動しない」
// が再発した。合成 DragEvent を撃つ e2e では確定経路が通ってしまい (テスト緑/実機赤)、原因が
// 見えなかった。そこで native DnD を捨て、pointerdown → pointermove(document) → pointerup の
// pointer イベントで実装する。これは全ブラウザで確実に発火し、Playwright の実マウス
// (mouse.down/move/up) で忠実にテストできる (Linear 等の本番アプリと同方式)。
//
// 使う側 (consumer) が DOM 解決 (resolveAt) と確定 (commit) を渡す。本コンポーザブルは
// ポインタ追跡と状態 (draggingId / dropTarget / hoverSection) の管理だけを担う。

export interface ReorderHit {
  /** カーソル下のチケット行 id (無ければ null)。 */
  id: string | null;
  /** カーソル下の区画キー (無ければ null)。単一リストなら固定の section 名を返す。 */
  section: string | null;
  /** 対象行に対する before/after (行が無ければ null)。 */
  edge: 'before' | 'after' | null;
}

export interface PointerReorderOptions {
  /** clientX/Y からカーソル下の行・区画・edge を解決する (consumer が DOM を見て返す)。 */
  resolveAt: (clientX: number, clientY: number, draggedId: string) => ReorderHit;
  /** 確定。targetSection!==originSection なら区画移動、同区画なら orderIndex 並び替え。 */
  commit: (c: {
    draggedId: string;
    originSection: string;
    targetSection: string;
    targetId: string | null;
    edge: 'before' | 'after' | null;
  }) => void | Promise<void>;
  /** ドラッグ中の自動スクロール (任意)。 */
  autoScroll?: (clientX: number, clientY: number) => void;
}

export function usePointerReorder(opts: PointerReorderOptions) {
  const draggingId = ref<string | null>(null);
  const originSection = ref<string | null>(null);
  const dropTargetId = ref<string | null>(null);
  const dropEdge = ref<'before' | 'after' | null>(null);
  const hoverSection = ref<string | null>(null);

  /** 行 id に対する現在のドロップインジケータ (before/after ライン)。 */
  function dropEdgeFor(id: string): 'before' | 'after' | null {
    return dropTargetId.value === id ? dropEdge.value : null;
  }

  function reset(): void {
    draggingId.value = null;
    originSection.value = null;
    dropTargetId.value = null;
    dropEdge.value = null;
    hoverSection.value = null;
  }

  function teardown(): void {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.body.style.userSelect = '';
  }

  function onMove(e: PointerEvent): void {
    if (!draggingId.value) return;
    // テキスト選択やスクロールの既定動作を抑止 (ドラッグ操作を優先)。
    e.preventDefault();
    const hit = opts.resolveAt(e.clientX, e.clientY, draggingId.value);
    hoverSection.value = hit.section;
    if (hit.id && hit.id !== draggingId.value) {
      dropTargetId.value = hit.id;
      dropEdge.value = hit.edge;
    } else {
      dropTargetId.value = null;
      dropEdge.value = null;
    }
    opts.autoScroll?.(e.clientX, e.clientY);
  }

  async function onUp(): Promise<void> {
    teardown();
    const draggedId = draggingId.value;
    const origin = originSection.value;
    // hoverSection が無ければ発生区画扱い (= 同区画内のどこか)。
    const targetSection = hoverSection.value ?? origin;
    const targetId = dropTargetId.value;
    const edge = dropEdge.value;
    reset();
    if (draggedId && origin && targetSection) {
      await opts.commit({ draggedId, originSection: origin, targetSection, targetId, edge });
    }
  }

  function onCancel(): void {
    teardown();
    reset();
  }

  /** ドラッグ開始。TicketRow のハンドル @pointerdown から呼ぶ。 */
  function start(section: string, id: string, e: PointerEvent): void {
    if (e.button !== 0) return; // 主ボタンのみ
    e.preventDefault();
    draggingId.value = id;
    originSection.value = section;
    dropTargetId.value = null;
    dropEdge.value = null;
    hoverSection.value = null;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.body.style.userSelect = 'none';
  }

  // アンマウント時にドラッグ中でもリスナを確実に外す。
  onUnmounted(teardown);

  return { draggingId, dropTargetId, dropEdge, hoverSection, dropEdgeFor, start };
}
