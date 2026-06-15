// Pointer ベースの d&d 並び替え/区画移動コンポーザブル (2026-06-15 root-cause 改修)。
//
// 背景 (なぜ実機で動かずデグレ再発したか — 根本原因):
//   旧実装は pointerdown → document の pointermove/pointerup を張るだけで
//   **setPointerCapture を一切呼んでいなかった**。capture が無いと、ドラッグ中に
//   元行 (.trow.dragging{opacity:0.4}、pointer-events 生存) の半透明テキスト/Icon 上を
//   カーソルが滑った瞬間、Chrome がネイティブのテキスト選択ドラッグへ遷移し、
//   document の pointermove/pointerup ストリームが分断され pointercancel が飛ぶ。
//   結果 onMove は冒頭 `if (!draggingId) return` で全捨てし、onUp も dropTarget=null の
//   まま確定経路に届かない → 「掴む手は出るが 1px も動かない / 区画移動も並び替えも不発」。
//   さらに初動のテキスト選択を抑止していなかったため、掴んで動かすと行テキストが複数行に
//   跨って範囲選択され「3 チケット全部が選択されたように見える」(実体は native text 選択で、
//   アプリの複数選択 state ではない)。
//   この遷移は合成 PointerEvent を撃つ e2e には起きないため「テスト緑/実機赤」を生んでいた。
//
// 本実装の堅牢化 (4 点):
//   1. setPointerCapture(pointerId) をハンドル要素に張る → 以降の pointer ストリームが
//      確実にそのポインタへ束縛され、native 選択ドラッグへの遷移を防ぐ。
//   2. selectstart を preventDefault + body.userSelect='none' で初動テキスト選択を完全抑止
//      (preventDefault(pointerdown) だけでは選択は止まらないため selectstart が正攻法)。
//   3. ドラッグ閾値 (>THRESHOLD px) を超えるまで本ドラッグへ昇格しない → クリック(行select)と
//      ドラッグを分離し、誤確定/誤選択を防ぐ。
//   4. ドラッグ確定後の trailing click を 1 回だけ握り潰す → ドロップ先行が select されない。
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

/** これ以上動かしたら「クリック」ではなく「ドラッグ」とみなす移動量 (px)。 */
const DRAG_THRESHOLD = 4;

export function usePointerReorder(opts: PointerReorderOptions) {
  const draggingId = ref<string | null>(null);
  const originSection = ref<string | null>(null);
  const dropTargetId = ref<string | null>(null);
  const dropEdge = ref<'before' | 'after' | null>(null);
  const hoverSection = ref<string | null>(null);

  // pointerdown 直後の保留状態。閾値を超えた最初の pointermove で本ドラッグへ昇格する。
  let pending: {
    section: string;
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    handle: HTMLElement;
  } | null = null;
  // 本ドラッグへ昇格済みか (閾値超え)。クリックとの判別に使う。
  let engaged = false;

  /** 行 id に対する現在のドロップインジケータ (before/after ライン)。 */
  function dropEdgeFor(id: string): 'before' | 'after' | null {
    return dropTargetId.value === id ? dropEdge.value : null;
  }

  function resetState(): void {
    draggingId.value = null;
    originSection.value = null;
    dropTargetId.value = null;
    dropEdge.value = null;
    hoverSection.value = null;
  }

  // ドラッグ中の native テキスト選択を完全に殺す (症状「3 チケット全選択に見える」の直接対策)。
  function onSelectStart(e: Event): void {
    e.preventDefault();
  }

  function teardown(): void {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('selectstart', onSelectStart, true);
    document.body.style.userSelect = '';
    if (pending) {
      try {
        pending.handle.releasePointerCapture(pending.pointerId);
      } catch {
        // capture が既に外れている/未設定でも無視。
      }
    }
  }

  // 閾値を超えた瞬間に本ドラッグへ昇格 (ここで初めて draggingId を立てる)。
  function engage(): void {
    if (!pending) return;
    engaged = true;
    draggingId.value = pending.id;
    originSection.value = pending.section;
    document.body.style.userSelect = 'none';
  }

  function onMove(e: PointerEvent): void {
    if (!pending) return;
    if (!engaged) {
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return; // 閾値未満はまだクリック候補
      engage();
    }
    // テキスト選択やスクロールの既定動作を抑止 (ドラッグ操作を優先)。
    e.preventDefault();
    const dragged = draggingId.value;
    if (!dragged) return;
    const hit = opts.resolveAt(e.clientX, e.clientY, dragged);
    hoverSection.value = hit.section;
    if (hit.id && hit.id !== dragged) {
      dropTargetId.value = hit.id;
      dropEdge.value = hit.edge;
    } else {
      dropTargetId.value = null;
      dropEdge.value = null;
    }
    opts.autoScroll?.(e.clientX, e.clientY);
  }

  async function onUp(): Promise<void> {
    const wasEngaged = engaged;
    const draggedId = draggingId.value;
    const origin = originSection.value;
    // hoverSection が無ければ発生区画扱い (= 同区画内のどこか)。
    const targetSection = hoverSection.value ?? origin;
    const targetId = dropTargetId.value;
    const edge = dropEdge.value;
    teardown();
    pending = null;
    engaged = false;
    resetState();
    // 閾値未満で離した = ただのクリック。並び替えはせず、行の select は通常クリックに委ねる。
    if (!wasEngaged) return;
    // ドラッグ直後に発火する trailing click が行を select するのを 1 回だけ握り潰す。
    suppressNextClick();
    if (draggedId && origin && targetSection) {
      await opts.commit({ draggedId, originSection: origin, targetSection, targetId, edge });
    }
  }

  function onCancel(): void {
    teardown();
    pending = null;
    engaged = false;
    resetState();
  }

  // ドラッグ確定の直後に来る click を 1 回だけ capture phase で握り潰す。
  function suppressNextClick(): void {
    const handler = (ev: Event): void => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    document.addEventListener('click', handler, { capture: true, once: true });
    // click が来なかった場合に備え短時間で解除 (リスナの取り残し防止)。
    setTimeout(() => document.removeEventListener('click', handler, true), 300);
  }

  /** ドラッグ開始。TicketRow のハンドル @pointerdown から呼ぶ。 */
  function start(section: string, id: string, e: PointerEvent): void {
    if (e.button !== 0) return; // 主ボタンのみ
    const handle = e.currentTarget as HTMLElement | null;
    if (!handle) return;
    // ★ setPointerCapture: 以降の pointermove/up/cancel をこのポインタへ束縛し、
    //   native テキスト選択ドラッグへの遷移でストリームが切れるのを防ぐ (根本対策)。
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 古いブラウザ等で未対応でも document リスナで動作は継続する。
    }
    pending = { section, id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, handle };
    engaged = false;
    // capture 済みでも document に張ればイベントは bubble して確実に届く (行の再描画にも頑健)。
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('selectstart', onSelectStart, true);
    e.preventDefault();
  }

  // アンマウント時にドラッグ中でもリスナを確実に外す。
  onUnmounted(teardown);

  return { draggingId, dropTargetId, dropEdge, hoverSection, dropEdgeFor, start };
}
