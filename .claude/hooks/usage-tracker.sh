#!/usr/bin/env bash
# Hook: PreToolUse on Task|Skill
# subagent (Task tool) と skill (Skill tool) の起動を .claude/.usage.log に記録する。
# このログを usage-audit.sh が SessionStart で読み、未使用機能を検出する。

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', ''))
except Exception:
    print('')
")

LOG="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/.usage.log"
TS=$(date -u +%FT%TZ)

case "$TOOL_NAME" in
  Task)
    NAME=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {}) or {}
    print(ti.get('subagent_type', '?'))
except Exception:
    print('?')
")
    echo "$TS subagent=$NAME" >> "$LOG"
    printf '\033[36m📋 [usage-tracker]\033[0m subagent=%s\n' "$NAME" >&2
    ;;
  Skill)
    NAME=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {}) or {}
    print(ti.get('skill', '?'))
except Exception:
    print('?')
")
    echo "$TS skill=$NAME" >> "$LOG"
    printf '\033[36m📋 [usage-tracker]\033[0m skill=%s\n' "$NAME" >&2
    ;;
esac

exit 0
