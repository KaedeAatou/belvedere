#!/usr/bin/env bash
# UserPromptSubmit: 長セッション中も usage-audit を 24h に 1 回走らせる rate limiter
# usage-audit.sh の本体ロジックを呼び、24h 以内ならスキップする。

set -u

# stdin (UserPromptSubmit JSON) は捨てる
cat > /dev/null

REPO="${CLAUDE_PROJECT_DIR:-/Users/kagayayuuki/Projects/ai-agent-hackathon}"
LAST="$REPO/.claude/.last-usage-audit"
THRESHOLD=14400  # 4h in seconds (1日 6 回上限)

if [ -f "$LAST" ]; then
  LAST_S=$(stat -f %m "$LAST" 2>/dev/null || stat -c %Y "$LAST" 2>/dev/null)
  NOW_S=$(date +%s)
  DIFF=$(( NOW_S - LAST_S ))
  if [ "$DIFF" -lt "$THRESHOLD" ]; then
    exit 0  # 24h 以内、スキップ
  fi
fi

# 24h 経過 (or 初回) → usage-audit を UserPromptSubmit イベントとして呼ぶ
USAGE_AUDIT_EVENT=UserPromptSubmit "$REPO/.claude/hooks/usage-audit.sh"
# usage-audit が `.usage.log` 無しで early exit するケースも含めて、
# rate-limit を確実に効かせるため必ずここで touch する
touch "$LAST"
