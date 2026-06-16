# 合成 d&d ハーネス (Chrome DevTools MCP `evaluate_script` 用)

vue-draggable-plus (SortableJS / `force-fallback`) を **合成 PointerEvent 列**で駆動する。Playwright 実マウスが使えない Chrome DevTools MCP 環境で、a11y に出ないドラッグハンドル (`.trow-drag-grab`) を本物っぽく掴む。2026-06-16 の d&d 検証で確立。

## ハマりどころ (これを外すと drop が確定しない / 区画跨ぎが効かない)

1. **pointer + mouse を両方 dispatch** — SortableJS は supportPointer 環境で `pointerup` を待つが、保険で `mouseup` も投げる。`pointerup` だけだと `_onDrop` に届かず `.sortable-fallback` クローンが残る (drop 未確定)。
2. **ドラッグ中 `.sortable-fallback` / `.sortable-drag` の `pointer-events:none`** — fallback クローンが `elementFromPoint` を奪うと drop 先を見失う。毎 move 前に無効化する。
3. **行間 (内部) ターゲットを狙う** — 「最下行の `after` (= リスト下端ピクセル)」は区画境界の隙間に落ちて **no-op**。`A を B の下へ` は「B の下端-数px」でなく「B と次行の間 = B の bottom 寄り内部」を狙う。2件リストは特に外しやすい。
4. **区画が画面外なら zoom で全可視化** — `document.documentElement.style.zoom='0.5'`。off-screen 座標は `elementFromPoint` が null を返し drop が確定しない (上方向の跨ぎは効くのに下方向が効かない時はコレ)。
5. **区画コンテナ中央狙いが堅い** — 跨ぎ移動は移動先の **行ではなく区画コンテナ** (`[data-section="next"]`) の中央へ落とすと安定 (行 `after` は境界隙間に外れやすい)。空区画も同コンテナを狙う。
6. **settle 待ち** — drop 後の reorder は network 往復 + Vue 再描画。`pointerup` 後に DOM が変わるまで poll (~120ms×25) してから assert。

## 動くヘルパ (注入してから `window.__belvDrag` を呼ぶ)

```js
() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rowOf = (id) => [...document.querySelectorAll(`[data-ticket-id="${id}"]`)].find(r => !r.className.includes('sortable-fallback'));
  const mk = (C, t, x, y, e) => new C(t, Object.assign({ clientX:x, clientY:y, screenX:x, screenY:y, bubbles:true, cancelable:true, composed:true, view:window }, e));
  const fire = (tg, pt, mt, x, y, b) => {
    tg.dispatchEvent(mk(PointerEvent, pt, x, y, { pointerId:1, isPrimary:true, pointerType:'mouse', button:b.button, buttons:b.buttons }));
    tg.dispatchEvent(mk(MouseEvent,   mt, x, y, { button:b.button, buttons:b.buttons }));
  };
  window.__belvOrder = (s) => [...document.querySelectorAll(`[data-section="${s}"] .trow:not(.sortable-fallback)[data-ticket-id]`)].map(r => r.getAttribute('data-ticket-id'));
  // target = ticketId(行) | { section:'next' }(区画コンテナ) ; place = 'before'|'after'|'mid'
  const destFn = (target, place) => { let last = null; return () => {
    try {
      if (typeof target === 'object' && target.section) { const c = document.querySelector(`[data-section="${target.section}"]`); if (c){ const b=c.getBoundingClientRect(); last={x:b.x+b.width/2, y:b.y+Math.max(16,b.height/2)}; } }
      else { const r = rowOf(target); if (r){ const b=r.getBoundingClientRect(); const y = place==='after'?b.bottom-4 : place==='before'?b.top+4 : b.y+b.height/2; last={x:b.x+b.width/2, y}; } }
    } catch(e){}
    return last;
  }; };
  async function drag(fromId, target, place, dwell, steps) {
    const fr = rowOf(fromId); if (!fr) return { ok:false, err:'from '+fromId };
    const h = fr.querySelector('.trow-drag-grab') || fr; const hb = h.getBoundingClientRect();
    const sx = hb.x+hb.width/2, sy = hb.y+hb.height/2; const dest = destFn(target, place); const d0 = dest(); if (!d0) return { ok:false, err:'dest' };
    fire(h, 'pointerdown', 'mousedown', sx, sy, { button:0, buttons:1 }); await sleep(45);
    fire(document, 'pointermove', 'mousemove', sx, sy+10, { button:-1, buttons:1 }); await sleep(30);
    for (let i=1;i<=steps;i++){ const d=dest()||d0; const x=sx+(d.x-sx)*i/steps, y=(sy+10)+(d.y-(sy+10))*i/steps;
      document.querySelectorAll('.sortable-fallback,.sortable-drag').forEach(el => el.style.pointerEvents='none');
      fire(document, 'pointermove', 'mousemove', x, y, { button:-1, buttons:1 }); await sleep(20); }
    for (let j=0;j<dwell;j++){ const d=dest()||d0; document.querySelectorAll('.sortable-fallback,.sortable-drag').forEach(el => el.style.pointerEvents='none');
      fire(document, 'pointermove', 'mousemove', d.x+(j%2?2:-2), d.y, { button:-1, buttons:1 }); await sleep(55); }
    const d = dest()||d0; fire(document, 'pointerup', 'mouseup', d.x, d.y, { button:0, buttons:0 }); return { ok:true };
  }
  window.__belvDrag  = (f, t, p='after') => drag(f, t, p, 2, 12);   // 区画内
  window.__belvDragX = (f, t, p='mid')   => drag(f, t, p, 8, 16);   // 区画跨ぎ (dwell 多め)
  return { installed: true };
}
```

## 使い方 (例)

```js
// 区画内: WC-105 を WC-101 の下へ
await window.__belvDrag('WC-105', 'WC-101', 'after');
// 区画跨ぎ: WC-102 を NEXT 区画へ (コンテナ狙い)
await window.__belvDragX('WC-102', { section: 'next' }, 'mid');
// 検証
const order = window.__belvOrder('current');
```

settle 待ち + API 永続 + reload は SKILL.md の手順4参照。
