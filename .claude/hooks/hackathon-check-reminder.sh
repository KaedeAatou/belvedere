#!/usr/bin/env bash
# Hook: SessionStart
# 最終ハッカソン要件チェックから 7日 以上経っていたら、Claude にリマインドする。
#
# 仕組み:
#   - 最終チェック日付は .claude/.last-hackathon-check に touch 時刻で保存
#   - 経過日数を計算し、7日超えなら additionalContext で /hackathon-check 実行を促す
#   - 7日以内なら静かに終了
#
# 最終チェック日付は /hackathon-check Skill の内部で touch して更新する

REPO="/Users/kagayayuuki/Projects/ai-agent-hackathon"
STAMP="$REPO/.claude/.last-hackathon-check"
LOG="$REPO/.claude/.hooks.log"
THRESHOLD_DAYS=7

# 最終チェックが無い (= まだ一度も走っていない) → 即リマインド
if [ ! -f "$STAMP" ]; then
  echo "$(date -u +%FT%TZ) [hackathon-check-reminder] FIRED reason=never-run" >> "$LOG"
  printf '\033[33m🏁 [hackathon-check-reminder]\033[0m never run, prompting /hackathon-check\n' >&2
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "${HACKATHON_REMINDER_EVENT:-SessionStart}",
    "additionalContext": "🌬 ハッカソン要件チェックがまだ一度も走っていません。今のセッション中に \`/hackathon-check\` を実行することを推奨します。HACKATHON_COMPLIANCE.md / memory/hackathon_compliance.md を一次情報の Notion と突き合わせて、🟢/🟡/🔴 のステータスを更新してください。"
  }
}
EOF
  exit 0
fi

# 経過日数 (macOS の date 互換)
NOW_S=$(date +%s)
LAST_S=$(stat -f %m "$STAMP" 2>/dev/null || stat -c %Y "$STAMP" 2>/dev/null)
DIFF=$(( (NOW_S - LAST_S) / 86400 ))

if [ "$DIFF" -ge "$THRESHOLD_DAYS" ]; then
  echo "$(date -u +%FT%TZ) [hackathon-check-reminder] FIRED reason=stale-${DIFF}days" >> "$LOG"
  printf '\033[33m🏁 [hackathon-check-reminder]\033[0m %d days since last check, prompting /hackathon-check\n' "$DIFF" >&2
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "${HACKATHON_REMINDER_EVENT:-SessionStart}",
    "additionalContext": "🌬 ハッカソン要件の最終チェックから ${DIFF} 日経過しました (閾値: ${THRESHOLD_DAYS} 日)。応募方法や審査基準が更新されている可能性があります。今のセッション中に \`/hackathon-check\` を実行して HACKATHON_COMPLIANCE.md を最新化してください。"
  }
}
EOF
fi

exit 0
