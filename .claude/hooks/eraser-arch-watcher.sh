#!/usr/bin/env bash
# PostToolUse: ARCHITECTURE 関連ファイル編集時に Eraser 同期マーカーを作る
# 対象: ARCHITECTURE.md / DATA_MODEL.md / AGENT_DESIGN.md / PRODUCT_BRIEF.md / CLAUDE.md

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || echo "")

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  */ARCHITECTURE.md|*/DATA_MODEL.md|*/AGENT_DESIGN.md|*/PRODUCT_BRIEF.md|*/CLAUDE.md)
    mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
    # 編集されたファイル名をマーカーに記録 (複数編集の追跡用)
    basename_file="${file_path##*/}"
    echo "$basename_file" >> "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending"
    # 重複削除
    sort -u "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending" -o "$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending"
    echo "[eraser-arch-watcher] アーキ関連 $basename_file 編集を検知 → 次回ユーザー入力時に Eraser 同期推奨" >&2
    ;;
esac
exit 0
