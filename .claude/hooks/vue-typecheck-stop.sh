#!/usr/bin/env bash
# Stop hook: このセッションで .vue を編集していたら、終了時に **1 回だけ** web (vue-tsc) を typecheck する。
# 由来: ts-typecheck.sh は .ts/.tsx のみ対象で .vue script の型エラーが CI まで見逃される。
# per-edit の重さ (nuxt prepare + vue-tsc ~30s) を避け、コミット直前 (= Stop) に 1 回だけ捕捉する。
#
# marker (.vue-typecheck-pending) は interaction-verify-reminder.sh が .vue 編集時に作る。
# 成功 → marker クリア + exit 0 (静かに終了許可)。失敗 → marker 保持 + exit 2 (ci-watchdog と同様にブロックして可視化)。

set -uo pipefail
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
MARKER="$PROJ/.claude/.vue-typecheck-pending"
LOG="$PROJ/.claude/.hooks.log"

[ -f "$MARKER" ] || exit 0

OUT=/tmp/belv-vue-typecheck.log
printf '\033[34m🔎 [vue-typecheck-stop]\033[0m .vue を編集したので web (vue-tsc) を typecheck 中…\n' >&2

cd "$PROJ" || exit 0
if pnpm --filter @belvedere/web typecheck >"$OUT" 2>&1; then
  echo "$(date -u +%FT%TZ) [vue-typecheck-stop] OK" >> "$LOG"
  printf '\033[32m🔎 [vue-typecheck-stop]\033[0m ✅ .vue typecheck OK\n' >&2
  rm -f "$MARKER"
  exit 0
else
  echo "$(date -u +%FT%TZ) [vue-typecheck-stop] FAILED" >> "$LOG"
  {
    printf '\033[31m🔎 [vue-typecheck-stop]\033[0m ❌ .vue typecheck 失敗。修正してから終了してください:\n'
    echo "----- last 30 lines (vue-tsc) -----"
    tail -30 "$OUT"
  } >&2
  exit 2
fi
