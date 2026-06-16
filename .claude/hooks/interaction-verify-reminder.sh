#!/usr/bin/env bash
# PostToolUse: Edit|Write|MultiEdit (非ブロック / 常に exit 0)
#  (1) .vue 編集 → .vue-typecheck-pending マーカを作る (Stop hook vue-typecheck-stop.sh が回収)
#  (2) UI/インタラクション or 並び順の純粋関数・ハンドラ編集 → 実機検証 + 直接テストの注意喚起
#
# 由来: 単体・e2e 緑なのに d&d 並び替えバグが流出 (2026-06-16)。実機操作と純粋関数の直接テストを
# 構造的に呼び忘れないための非ブロック nudge。判定は人/AI に委ねる (止めない)。

set -euo pipefail
input=$(cat)
fp=$(printf '%s' "$input" | /usr/bin/python3 -c '
import sys, json
try:
    d = json.load(sys.stdin); ti = d.get("tool_input", {}) or {}
    print(ti.get("file_path") or ti.get("path") or "")
except Exception:
    print("")
' 2>/dev/null || echo "")

[ -z "$fp" ] && exit 0
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
LOG="$PROJ/.claude/.hooks.log"
mkdir -p "$PROJ/.claude"

# (1) .vue マーカ
case "$fp" in
  *.vue)
    echo "$fp" >> "$PROJ/.claude/.vue-typecheck-pending"
    sort -u "$PROJ/.claude/.vue-typecheck-pending" -o "$PROJ/.claude/.vue-typecheck-pending" 2>/dev/null || true
    ;;
esac

# (2) インタラクション/並び順 トリガ判定 (path or 内容)
trigger=0
case "$fp" in
  */SprintSectionedList.vue|*/screens/*Screen.vue|*/primitives/TicketRow.vue) trigger=1 ;;
  *orderIndex*|*useTickets*|*usePointerReorder*) trigger=1 ;;
  */shared/src/utils.ts) trigger=1 ;;
esac
if [ "$trigger" = 0 ] && [ -f "$fp" ]; then
  if grep -qiE 'VueDraggable|SortableJS|sortable-|trow-drag|onDragEnd|@end=|pointerdown|compareTicketOrder|orderBetween|reorderTickets' "$fp" 2>/dev/null; then
    trigger=1
  fi
fi

if [ "$trigger" = 1 ]; then
  echo "$(date -u +%FT%TZ) [interaction-verify-reminder] FIRED file=${fp##*/}" >> "$LOG"
  {
    printf '\033[36m🖐  [interaction-verify-reminder]\033[0m %s はインタラクション/並び順に関わる変更です。\n' "${fp##*/}"
    printf '   ① 実機確認: \033[1m/local-ui-verify\033[0m (= scripts/dev-local-noauth.sh + Chrome DevTools) で d&d 等を実操作 (単体・e2e 緑でも実機赤の温床)\n'
    printf '   ② 直接テスト: 触れた純粋関数 (比較/並び順) とハンドラに undefined/等値/端の直接テストがあるか (.claude/rules/testing.md)\n'
  } >&2
fi
exit 0
