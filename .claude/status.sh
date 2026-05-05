#!/usr/bin/env bash
# .claude/ オートメーション状況の可視化
# 使い方: ./.claude/status.sh または ! ./.claude/status.sh

set -u

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG="$REPO/.claude/.hooks.log"

# ANSI
R='\033[31m'
G='\033[32m'
Y='\033[33m'
B='\033[34m'
M='\033[35m'
C='\033[36m'
W='\033[37m'
X='\033[0m'    # reset
BOLD='\033[1m'

printf "${BOLD}=== Belvedere .claude/ status ===${X}\n\n"

# ===== Hooks =====
printf "${BOLD}Hooks (settings.local.json で配線)${X}\n"
printf "  ${R}🛡️  seed-guard${X}                  PreToolUse Edit/Write/MultiEdit  → packages/seed/src/* を block\n"
printf "  ${B}🔍 ts-typecheck${X}                 PostToolUse Edit/Write/MultiEdit → .ts/.tsx 編集後 pnpm typecheck\n"
printf "  ${M}📐 eraser-arch-watcher${X}          PostToolUse Edit/Write/MultiEdit → アーキ md → marker\n"
printf "  ${M}📐 eraser-sync-reminder${X}         UserPromptSubmit                 → marker → Claude promptに /eraser-arch-sync 注入\n"
printf "  ${Y}🏁 hackathon-check-reminder${X}     SessionStart                     → 7日経過時に /hackathon-check 推奨\n"

# ===== Subagents =====
printf "\n${BOLD}Subagents (.claude/agents/*.md)${X}\n"
for f in "$REPO"/.claude/agents/*.md; do
  [ -f "$f" ] || continue
  name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
  color=$(grep -m1 '^color:' "$f" 2>/dev/null | sed 's/^color: //')
  desc=$(grep -m1 '^description:' "$f" | sed 's/^description: //' | cut -c1-60)
  case "$color" in
    red)    c="$R" ;;
    blue)   c="$B" ;;
    green)  c="$G" ;;
    yellow) c="$Y" ;;
    purple) c="$M" ;;
    cyan)   c="$C" ;;
    *)      c="$W" ;;
  esac
  printf "  ${c}●${X} %-40s [%-7s] %s...\n" "$name" "${color:-none}" "$desc"
done

# ===== Skills =====
printf "\n${BOLD}Skills (.claude/skills/*/SKILL.md)${X}\n"
for f in "$REPO"/.claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
  color=$(grep -m1 '^color:' "$f" 2>/dev/null | sed 's/^color: //')
  desc=$(grep -m1 '^description:' "$f" | sed 's/^description: //' | cut -c1-60)
  case "$color" in
    red)    c="$R" ;;
    blue)   c="$B" ;;
    green)  c="$G" ;;
    yellow) c="$Y" ;;
    purple) c="$M" ;;
    cyan)   c="$C" ;;
    *)      c="$W" ;;
  esac
  printf "  ${c}●${X} %-40s [%-7s] %s...\n" "$name" "${color:-none}" "$desc"
done

# ===== Pending markers =====
printf "\n${BOLD}Pending markers${X}\n"
for marker in "$REPO"/.claude/.eraser-sync-pending "$REPO"/.claude/.last-hackathon-check; do
  if [ -f "$marker" ]; then
    name=$(basename "$marker")
    mtime=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$marker" 2>/dev/null || stat -c "%y" "$marker" 2>/dev/null | cut -c1-16)
    if [[ "$name" == ".eraser-sync-pending" ]]; then
      content=$(tr '\n' ' ' < "$marker")
      printf "  ${Y}⚠ %s${X}  (%s)  files: %s\n" "$name" "$mtime" "$content"
    else
      printf "  ${G}✓ %s${X} (last: %s)\n" "$name" "$mtime"
    fi
  fi
done

# ===== Recent hook history =====
printf "\n${BOLD}Recent hook firings (.claude/.hooks.log last 15)${X}\n"
if [ -f "$LOG" ]; then
  tail -15 "$LOG" | while read -r line; do
    case "$line" in
      *"[seed-guard]"*"BLOCKED"*)            printf "  ${R}%s${X}\n" "$line" ;;
      *"[seed-guard]"*"BYPASS"*)             printf "  ${Y}%s${X}\n" "$line" ;;
      *"[ts-typecheck]"*"OK"*)               printf "  ${G}%s${X}\n" "$line" ;;
      *"[ts-typecheck]"*"FAILED"*)           printf "  ${R}%s${X}\n" "$line" ;;
      *"[eraser"*)                            printf "  ${M}%s${X}\n" "$line" ;;
      *"[hackathon"*)                         printf "  ${Y}%s${X}\n" "$line" ;;
      *) printf "  %s\n" "$line" ;;
    esac
  done
else
  printf "  (.hooks.log がまだ存在しません — hook が一度も走っていない)\n"
fi

# ===== Subagent / Skill usage stats =====
USAGE_LOG="$REPO/.claude/.usage.log"
printf "\n${BOLD}Subagent / Skill usage (.claude/.usage.log)${X}\n"
if [ -f "$USAGE_LOG" ]; then
  printf "  ${BOLD}Subagents:${X}\n"
  for f in "$REPO"/.claude/agents/*.md; do
    [ -f "$f" ] || continue
    name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
    count=$(grep -c "subagent=$name$" "$USAGE_LOG" 2>/dev/null) || count=0
    last=$(grep "subagent=$name$" "$USAGE_LOG" | tail -1 | awk '{print $1}')
    if [ "$count" -eq 0 ]; then
      printf "    ${R}● %-40s 0 calls${X}\n" "$name"
    else
      printf "    ${G}● %-40s ${count} calls${X} (last: %s)\n" "$name" "${last:-?}"
    fi
  done
  printf "  ${BOLD}Skills:${X}\n"
  for f in "$REPO"/.claude/skills/*/SKILL.md; do
    [ -f "$f" ] || continue
    name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
    count=$(grep -c "skill=$name$" "$USAGE_LOG" 2>/dev/null) || count=0
    last=$(grep "skill=$name$" "$USAGE_LOG" | tail -1 | awk '{print $1}')
    if [ "$count" -eq 0 ]; then
      printf "    ${R}● %-40s 0 calls${X}\n" "$name"
    else
      printf "    ${G}● %-40s ${count} calls${X} (last: %s)\n" "$name" "${last:-?}"
    fi
  done
else
  printf "  (.usage.log がまだ存在しません — subagent/skill が起動されてない)\n"
fi

printf "\n"
