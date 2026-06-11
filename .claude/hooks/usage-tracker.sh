#!/usr/bin/env bash
# Hook: PreToolUse on Agent|Task|Skill
# subagent (Agent tool / 旧称 Task tool) と skill (Skill tool) の起動を
# .claude/.usage.log に記録する。usage-audit.sh が SessionStart で読み、未使用機能を検出する。
#
# 2026-06-12 修正: subagent 起動ツールが Task → Agent にリネームされており、
# matcher も case も旧名のままだったため起動が一切記録されず、usage-audit が
# 「全 subagent 未使用」と偽陽性を出していた。両対応にする。

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
  Agent|Task)
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
