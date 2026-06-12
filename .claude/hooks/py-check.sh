#!/usr/bin/env bash
# Hook: PostToolUse on Edit|Write|MultiEdit
# .py ファイル編集後に ruff + mypy を自動実行する (2026-06-12 制定)。
#
# 背景: agents.py 編集時に TS 側の typecheck/test だけ検証して Python lint を
# 回し忘れ、ruff E501 で CI が 6 連敗した (edc73f6 で修正)。ts-typecheck.sh の
# Python 版が無かったのが構造的原因。
#
# 動作: 編集対象が apps/orchestrator-py/**/*.py の場合のみ、
#       uv run ruff check + mypy を実行。失敗時は exit 2 で Claude に修正を促す。

INPUT=$(cat)

FILE=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print((d.get('tool_input', {}) or {}).get('file_path', ''))
except Exception:
    print('')
")

case "$FILE" in
  *.py) ;;
  *) exit 0 ;;
esac

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$FILE" in
  "$PROJ"/apps/orchestrator-py/*) DIR="$PROJ/apps/orchestrator-py" ;;
  *) exit 0 ;;  # orchestrator-py 以外の .py (スクリプト等) は対象外
esac

printf '\033[34m🐍 [py-check]\033[0m running ruff + mypy for %s ...\n' "$(basename "$FILE")" >&2

OUT=$(cd "$DIR" && uv run ruff check . 2>&1) || {
  printf '\033[31m🐍 [py-check]\033[0m ❌ ruff FAILED\n%s\n' "$OUT" >&2
  exit 2
}
OUT=$(cd "$DIR" && uv run mypy src 2>&1) || {
  printf '\033[31m🐍 [py-check]\033[0m ❌ mypy FAILED\n%s\n' "$OUT" >&2
  exit 2
}

printf '\033[32m🐍 [py-check]\033[0m ✅ ruff + mypy clean\n' >&2
exit 0
