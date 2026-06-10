#!/usr/bin/env bash
# Hook: PostToolUse on Bash
# git push を検知したら、5 秒後に最新の GitHub Actions run の状態を取得して
# Claude に表示する。push 後の CI 状態確認漏れを構造的に防ぐ (2026-06-10 制定)。
#
# 背景: 2026-06-10 に apps/e2e 追加で ci.yml が巻き込まれて失敗したのに
# Claude が気付かずユーザーに先回りされた経緯。再発防止策。
#
# 動作:
# - Bash の tool_input.command に "git push" が含まれる場合のみ発火
# - 5 秒 sleep して GitHub Actions が起動するのを待つ
# - gh run list で最新 1-2 件を取得して JSON で表示
# - Claude が状況を理解して、必要に応じて gh run watch を即時実行できる
#
# 対象外:
# - dry-run (--dry-run フラグ) は skip
# - git push --no-verify でも発火 (CI は走るので確認は必要)
# - gh コマンド未インストールなら静かに無視

INPUT=$(cat)

# tool_input.command を抽出 (python3 で安全に JSON 解析)
COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {}) or {}
    print(ti.get('command') or '')
except Exception:
    print('')
")

LOG="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/.hooks.log"
TS=$(date '+%Y-%m-%dT%H:%M:%S')

# git push 検知 (--dry-run は除外)
if ! echo "$COMMAND" | grep -qE '\bgit\s+push\b'; then
  exit 0
fi
if echo "$COMMAND" | grep -qE '\-\-dry-run\b'; then
  echo "[$TS] post-push-check: skipped (--dry-run)" >> "$LOG"
  exit 0
fi

# gh コマンドの有無確認
if ! command -v gh >/dev/null 2>&1; then
  echo "[$TS] post-push-check: skipped (gh CLI not installed)" >> "$LOG"
  exit 0
fi

echo "[$TS] post-push-check: triggered for command: $COMMAND" >> "$LOG"

# CI が起動するまで少し待つ (GitHub の workflow_run 検知 + queue まで通常 3-8 秒)
sleep 5

# 最新 3 件の run を取得 (push トリガで複数 workflow が起動するため)
RUNS=$(gh run list --limit 3 --json status,conclusion,databaseId,workflowName,createdAt 2>/dev/null)

if [ -z "$RUNS" ] || [ "$RUNS" = "[]" ]; then
  echo "[$TS] post-push-check: gh run list empty or failed" >> "$LOG"
  exit 0
fi

# Claude に表示するメッセージを stderr に出す
# (PostToolUse hook の stderr は Claude の context に伝わる)
{
  echo "🔄 [post-push] git push 検知 → 5 秒後の GitHub Actions 状態:"
  echo ""
  echo "$RUNS" | python3 -c "
import sys, json
runs = json.load(sys.stdin)
for r in runs[:3]:
    status = r.get('status', '?')
    conclusion = r.get('conclusion', '') or ''
    name = r.get('workflowName', '?')
    db_id = r.get('databaseId', '?')
    icon = '⏳' if status == 'in_progress' or status == 'queued' else ('✅' if conclusion == 'success' else '❌' if conclusion == 'failure' else '🟡')
    print(f'  {icon} {name:30s}  status={status:12s} conclusion={conclusion:10s} id={db_id}')
"
  echo ""
  echo "📌 in_progress なら必ず確認: gh run watch <id> --exit-status"
  echo "📌 failure があれば即対処、ユーザーに先回りされる前に"
} >&2

exit 0
