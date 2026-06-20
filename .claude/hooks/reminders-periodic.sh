#!/usr/bin/env bash
# UserPromptSubmit: 長セッション中も reminders-check を 4h に 1 回走らせる rate limiter。
# (usage-audit-periodic.sh / hackathon-check-periodic.sh と同型)

set -u

# stdin (UserPromptSubmit JSON) は捨てる
cat > /dev/null

REPO="${CLAUDE_PROJECT_DIR:-/Users/kagayayuuki/Projects/ai-agent-hackathon}"
LAST="$REPO/.claude/.last-reminders-check"
THRESHOLD=14400  # 4h in seconds (1日 6 回上限)

if [ -f "$LAST" ]; then
  LAST_S=$(stat -f %m "$LAST" 2>/dev/null || stat -c %Y "$LAST" 2>/dev/null)
  NOW_S=$(date +%s)
  DIFF=$(( NOW_S - LAST_S ))
  if [ "$DIFF" -lt "$THRESHOLD" ]; then
    exit 0  # 4h 以内、スキップ
  fi
fi

# 4h 経過 (or 初回) → reminders-check を UserPromptSubmit イベントとして呼ぶ
REMINDERS_EVENT=UserPromptSubmit "$REPO/.claude/hooks/reminders-check.sh"
touch "$LAST"
