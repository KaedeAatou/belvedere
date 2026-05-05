#!/usr/bin/env bash
# UserPromptSubmit: 長セッション中も hackathon-check リマインドを 24h に 1 回まで走らせる
# hackathon-check-reminder.sh の本体ロジックを呼び、24h 以内ならスキップする。
# (本体は最終チェックから 7 日経過判定を持っている)

set -u

# stdin (UserPromptSubmit JSON) は捨てる
cat > /dev/null

REPO="${CLAUDE_PROJECT_DIR:-/Users/kaede/Projects/ai-agent-hackathon}"
RATE_LIMIT="$REPO/.claude/.last-hackathon-reminder"
THRESHOLD=14400  # 4h in seconds (1日 6 回上限)

if [ -f "$RATE_LIMIT" ]; then
  LAST_S=$(stat -f %m "$RATE_LIMIT" 2>/dev/null || stat -c %Y "$RATE_LIMIT" 2>/dev/null)
  NOW_S=$(date +%s)
  DIFF=$(( NOW_S - LAST_S ))
  if [ "$DIFF" -lt "$THRESHOLD" ]; then
    exit 0  # 24h 以内、スキップ
  fi
fi

# 24h 経過 (or 初回) → reminder 本体を UserPromptSubmit イベントとして呼ぶ
HACKATHON_REMINDER_EVENT=UserPromptSubmit "$REPO/.claude/hooks/hackathon-check-reminder.sh"
touch "$RATE_LIMIT"
