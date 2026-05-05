#!/usr/bin/env bash
# PostToolUse: ARCHITECTURE 関連ファイル編集時に Eraser 同期マーカーを作る
# 対象: ARCHITECTURE.md / DATA_MODEL.md / AGENT_DESIGN.md / PRODUCT_BRIEF.md / CLAUDE.md

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || echo "")

LOG="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/.hooks.log"

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  */ARCHITECTURE.md|*/DATA_MODEL.md|*/AGENT_DESIGN.md|*/PRODUCT_BRIEF.md|*/CLAUDE.md)
    mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
    basename_file="${file_path##*/}"
    echo "$basename_file" >> "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending"
    sort -u "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending" -o "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending"
    echo "$(date -u +%FT%TZ) [eraser-arch-watcher] MARKED file=$basename_file" >> "$LOG"
    printf '\033[35m📐 [eraser-arch-watcher]\033[0m MARKED %s (next prompt → /eraser-arch-sync 推奨)\n' "$basename_file" >&2
    ;;
esac
exit 0
