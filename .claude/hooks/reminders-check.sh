#!/usr/bin/env bash
# Hook: SessionStart
# 将来イベントのリマインダーレジストリ (.claude/reminders.tsv) を走査し、期日が近い/到達
# または条件型の未対応イベントがあれば、Claude にレジストリ確認 + 自発対応を促す。
#
# 設計方針: 動的内容 (タイトル/アクション) は additionalContext に埋め込まず、
# 「件数 + ファイルを読め」だけ surface する (JSON エスケープ事故を避ける = 堅牢)。
# 詳細は Claude が .claude/reminders.tsv を読んで判断・行動する。
#
# レジストリ書式 (タブ区切り / 行頭 # は無効化・完了):
#   <due>\t<id>\t<owner>\t<title>\t<action>
#   due  = ISO 日付 (YYYY-MM-DD) または when:<条件文>
#   owner= claude (Claude が実行) / user (Claude は手順を促す)

REPO="/Users/kaede/Projects/ai-agent-hackathon"
REG="$REPO/.claude/reminders.tsv"
LOG="$REPO/.claude/.hooks.log"
LEAD_DAYS=3   # 期日の何日前から surface するか

[ -f "$REG" ] || exit 0
NOW_S=$(date +%s)

# YYYY-MM-DD → epoch 秒 (macOS / Linux 互換)。失敗時は空文字。
to_epoch() { date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null || date -d "$1" +%s 2>/dev/null; }

DUE=0
COND=0
while IFS=$'\t' read -r due id owner title action; do
  case "$due" in
    ''|'#'*) continue ;;   # 空行・コメント/完了行
  esac
  if [ "${due#when:}" != "$due" ]; then
    COND=$(( COND + 1 ))   # 条件型
  else
    due_s=$(to_epoch "$due")
    [ -n "$due_s" ] || continue
    if [ "$NOW_S" -ge $(( due_s - LEAD_DAYS * 86400 )) ]; then
      DUE=$(( DUE + 1 ))   # 期日が LEAD_DAYS 以内に接近 or 到達
    fi
  fi
done < "$REG"

TOTAL=$(( DUE + COND ))
[ "$TOTAL" -gt 0 ] || exit 0

echo "$(date -u +%FT%TZ) [reminders-check] FIRED due=${DUE} cond=${COND}" >> "$LOG"
printf '\033[33m⏰ [reminders-check]\033[0m %d future-event reminder(s) need attention\n' "$TOTAL" >&2

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "${REMINDERS_EVENT:-SessionStart}",
    "additionalContext": "⏰ 将来イベントのリマインダーが ${TOTAL} 件あります (期日接近/到達 ${DUE} 件 / 条件型 ${COND} 件)。\`.claude/reminders.tsv\` を読み、各行の owner=claude は実行を提案/実行し、owner=user は具体的な手順を促してください。対応が済んだ行は行頭に # を付けて完了化します。"
  }
}
EOF

exit 0
