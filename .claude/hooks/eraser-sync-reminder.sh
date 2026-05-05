#!/usr/bin/env bash
# UserPromptSubmit: マーカーがあれば Claude に Eraser 同期を促す additionalContext を注入
# Claude は「自動で同期する」指示として解釈し、次のターンで /eraser-arch-sync を実行する想定

set -euo pipefail

MARKER="$CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending"
LOG="$CLAUDE_PROJECT_DIR/.claude/.hooks.log"

if [[ ! -f "$MARKER" ]]; then
  exit 0
fi

# 編集されたファイル一覧 (1ファイル1行)
files=$(tr '\n' ', ' < "$MARKER" | sed 's/, $//')

echo "$(date -u +%FT%TZ) [eraser-sync-reminder] FIRED files=$files" >> "$LOG"
printf '\033[35m📐 [eraser-sync-reminder]\033[0m injecting Claude prompt for: %s\n' "$files" >&2

# additionalContext 経由で Claude に同期実行を指示
# 注: hookSpecificOutput.hookEventName は spec で必要、additionalContext でテキスト注入
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "📐 [eraser-auto-sync] アーキ関連ドキュメント (${files}) が前回以降に編集されました。\n\n**自動同期実行**: ユーザーの今回の指示と並行/前後で、以下を**自動的に実行してください**:\n\n1. 編集された内容が Eraser 図 (https://app.eraser.io/workspace/qDqUGUjPxoBCq8nP6bKa) の構造 (5儀式 / Agent 体系 / GCP 採用技術 / データ階層) に影響するか判定\n2. 影響あり → mcp__eraser__update で diagram と file を最新内容に同期 (skill: /eraser-arch-sync 参照)\n3. 影響なし (typo・小さな表現修正のみ) → スキップ\n4. いずれの場合も完了後 \\\`rm $CLAUDE_PROJECT_DIR/.claude/.eraser-sync-pending\\\` で marker をクリア\n\nユーザーへの報告は1-2行で簡潔に。同期を skipped した場合もその理由を1行で。"
  }
}
EOF
exit 0
