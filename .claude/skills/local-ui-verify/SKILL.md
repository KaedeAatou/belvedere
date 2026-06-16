---
name: local-ui-verify
description: UI/インタラクション (d&d / drag / pointer / SortableJS / クリック / .vue 操作) の変更を、無認証ローカル環境 + Chrome DevTools MCP で実際に操作して検証する。Use this skill whenever the user says 実機で確かめて / ブラウザで操作して / d&d を試して / UI を動かして確認 / local-ui-verify、または d&d・並び替え・drag・pointer・SortableJS・VueDraggable・儀式画面のインタラクションを変更した時。単体・e2e が緑でも実機で操作しないと残るバグ (d&d 並び替えバグ 2026-06-16) を捕まえる。**auth バイパス足場は自作しない** — 既存 scripts/dev-local-noauth.sh を使う。
color: cyan
---

# local-ui-verify — 実機 UI 操作検証

単体・e2e が緑でも、**実ブラウザで実際に操作**しないと UI/d&d のバグは残る。deployed app は Firebase Auth (Google OAuth) で自動化ブラウザが弾かれるため、**無認証ローカル環境**を立てて Chrome DevTools MCP で実 seed 上を操作する。

> ⚠️ **自作の auth バイパス足場を毎回組まない**。`scripts/dev-local-noauth.sh` が「3 ファイルに DEV_NO_AUTH を実行時だけ注入 → 終了時 `git checkout` で復元」を安全に行う。これを使う (2026-06-16: 知らずに同じものを再発明した反省)。

## 手順

### 1. 無認証ローカル起動 (background)
```bash
./scripts/dev-local-noauth.sh
```
- `run_in_background: true` で起動 (script は `wait` で常駐)。`browser-host-guard.sh` が Chrome を localhost/dev に限定するので localhost は許可。
- web `:3000` (無認証 / seed owner=kaede / ws-belvedere) + api `:8080` (memory backend + seed)。初回 Nuxt ビルド ~20s。
- ready 確認: `curl -s localhost:8080/health` が `{"status":"ok",...}` / `curl -s -o /dev/null -w "%{http_code}" localhost:3000/` が 200。
- **前提**: `auth.ts` / `auth.global.ts` / `nuxt.config.ts` に未コミット変更があると script は中断する。先に commit/stash。

### 2. Chrome DevTools MCP で開く
- `new_page` / `navigate_page` で `http://localhost:3000/`。`evaluate_script` で `location.pathname` を見てログイン画面に飛んでいない (= 無認証で入れた) ことを確認。
- 必要なら `localStorage.setItem('belvedere.workspaceId','ws-belvedere')`。
- seed の WC-101..112 が描画されることを確認 (`[data-section="current"] [data-ticket-id]`)。

### 3. 実操作する
- d&d は **`references/dnd-harness.md` の合成 PointerEvent ハーネス**を `evaluate_script` で注入して駆動する (SortableJS/force-fallback を本物の pointer 列で踏む)。クリック等は `click` / `fill` ツール。
- **区画が画面外**なら `document.documentElement.style.zoom='0.5'` で全可視化 (off-screen は `elementFromPoint` が null になり drop が確定しない)。

### 4. 結果を assert (3 点セット)
1. **DOM 順**: 操作後の `[data-section=...] [data-ticket-id]` 配列が期待どおり。
2. **API 永続**: `fetch('http://localhost:8080/api/tickets',{headers:{'X-Workspace-Id':'ws-belvedere'}})` で orderIndex/sprintId が期待どおり (全件 distinct/monotonic 等)。
3. **リロード保持**: `navigate_page reload` 後も順序が保たれる (DOM 順 == API 順)。

### 5. 停止 + 復元確認 (必須)
- 起動した background プロセスを停止 (script に SIGINT/SIGTERM → trap が `git checkout` で 3 ファイル復元)。確実を期すため停止後に必ず:
```bash
git status --short    # auth.ts / auth.global.ts / nuxt.config.ts が clean (出てこない) ことを確認
```
- 残っていたら手動復元: `git checkout -- apps/api/src/middleware/auth.ts apps/web/middleware/auth.global.ts apps/web/nuxt.config.ts`
- **バイパスをコミットに含めない** (Cloud Run へ漏らさない)。

## テストケースの洗い出し (d&d の例)
網羅すべき軸 (本セッションで実証):
- **区画内**: 先頭 / 中間 / 末尾を起点。1つ移動・1つ飛ばし・連続移動。
- **区画跨ぎ**: Backlog↔Current↔Next の全方向 (sprintId 変化を API で確認) + 跨ぎ後に移動先で再並べ。
- **永続**: リロード後も保たれる。
- **報告症状の再現**: 先頭ジャンプ / 1つ下移動で復帰 が起きないこと。

> 「無反応 (no-op)」と「戻り (revert)」を区別する。no-op は合成ドラッグが行端ピクセルを外しただけのことが多い (`references/dnd-harness.md` の「行間ターゲット」参照)。revert はバグ。
