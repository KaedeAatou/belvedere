#!/usr/bin/env bash
# PostToolUse: Edit|Write|MultiEdit (非ブロック / 常に exit 0)
#
# 核となる純粋関数 / *-handlers.ts / *.vue を編集したのに、未コミット変更 (modified + 新規
# untracked) に *.test.ts / *.spec.ts が 1 つも無いとき warn する。「核ロジックを触ったのに
# 直接テストを書き忘れた」を機械判定で構造的に検出する nudge。
#
# 由来: 単体・e2e 緑なのに d&d 並び替えバグが流出 (2026-06-16)。testing.md §1 (共有純粋関数は
# 退化入力含めて直接テスト) / §3 (バグ修正は再現テスト先行) の呼び忘れを止めない範囲で促す。
# 「赤→緑を踏んだか」は機械判定できないので skill 運用 (local-ui-verify / belvedere-commit) に委ねる。

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

# テストファイル自身の編集は対象外 (テストを書いている最中に自分を急かさない)。
case "$fp" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) exit 0 ;;
esac

# 監視対象: 直接テストを伴わせたい「核ロジック」のファイル群。
watch=0
case "$fp" in
  *-handlers.ts) watch=1 ;;                                       # api ハンドラ (契約/IDOR/副作用)
  *.vue) watch=1 ;;                                               # コンポーネント (配線/state/emit)
  */packages/shared/src/sections.ts) watch=1 ;;                   # 区画分類 (純粋)
  */packages/shared/src/order.ts) watch=1 ;;                      # 並び替え算術 (純粋)
  */packages/shared/src/utils.ts) watch=1 ;;                      # compareTicketOrder 等 (純粋)
  */packages/tools/src/ticket-rules.ts) watch=1 ;;                # ルールエンジン
  */packages/tools/src/refinement.ts) watch=1 ;;                  # 6観点診断
  */packages/repo/src/query.ts) watch=1 ;;                        # 等値フィルタ (純粋)
  */packages/repo/src/memory.ts) watch=1 ;;                       # backend list
esac
[ "$watch" = 0 ] && exit 0

# 未コミット変更 (modified tracked + 新規 untracked) に test/spec が 1 つでもあれば nudge 不要。
# PostToolUse 時点で編集は working tree に反映済。新規テストは git diff に出ないため
# ls-files --others も併せて見る (Edit/Write 直後の untracked test を拾う)。
cd "$PROJ" 2>/dev/null || exit 0
changed=$({ git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null || true)
if printf '%s\n' "$changed" | grep -qE '\.(test|spec)\.(ts|tsx)$'; then
  exit 0
fi

echo "$(date -u +%FT%TZ) [pure-fn-test-guard] FIRED file=${fp##*/}" >> "$LOG"
{
  printf '\033[33m🧪 [pure-fn-test-guard]\033[0m %s を編集しましたが、未コミット変更に *.test.ts / *.spec.ts がありません。\n' "${fp##*/}"
  printf '   核ロジック (純粋関数/ハンドラ/コンポーネント) の変更には直接テストを伴わせてください:\n'
  printf '   ・共有純粋関数は退化入力 (undefined/等値/端) を直接テスト (.claude/rules/testing.md §1)\n'
  printf '   ・バグ修正は再現テスト先行 (赤→修正→緑 / §3)。配線は component unit、物理 d&d は /local-ui-verify\n'
} >&2
exit 0
