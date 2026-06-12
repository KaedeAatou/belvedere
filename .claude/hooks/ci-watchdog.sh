#!/usr/bin/env bash
# Hook: Stop
# CI の結果を確認しないままターンを終了するのを構造的に防ぐ番犬 (2026-06-12 制定)。
#
# 背景: push 後に別作業へ移って CI 失敗 (ruff E501 6 連敗) を見落とし、ユーザーに
# デプロイ失敗メールで先に気付かれた。post-push-check (push 直後の状態表示) だけでは
# 「最終結果の確認」を保証できないため、Stop 時にゲートを設ける。
#
# 動作:
# - 直近 30 分以内の main の run に queued / in_progress / failure があれば exit 2 で
#   ターン終了をブロックし、gh run watch での確認 (失敗なら CI 修正ループ) を指示する。
# - 例外 (ack): 失敗を意図的に持ち越す場合は run ID を .claude/.ci-ack に追記すると
#   その run はブロック対象から除外される (理由をユーザーに報告すること)。
# - gh 未認証 / オフライン時は静かにスキップ (fail-open)。
# - 無限ループ防止: stop_hook_active が true なら何もしない。

INPUT=$(cat)

ACTIVE=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    print(str(json.load(sys.stdin).get('stop_hook_active', False)).lower())
except Exception:
    print('false')
")
[ "$ACTIVE" = "true" ] && exit 0

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
ACK_FILE="$PROJ/.claude/.ci-ack"

RUNS=$(cd "$PROJ" && gh run list --branch main --limit 6 \
  --json databaseId,name,status,conclusion,createdAt 2>/dev/null) || exit 0
[ -z "$RUNS" ] && exit 0

# 注意: パイプ + heredoc は stdin を取り合うため、run 一覧は env 変数で渡す
RESULT=$(RUNS_JSON="$RUNS" python3 - "$ACK_FILE" <<'PYEOF'
import sys, os, json, datetime

ack_path = sys.argv[1]
try:
    acked = set(open(ack_path).read().split())
except Exception:
    acked = set()

now = datetime.datetime.now(datetime.timezone.utc)
problems = []
for r in json.loads(os.environ["RUNS_JSON"]):
    rid = str(r["databaseId"])
    if rid in acked:
        continue
    created = datetime.datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00"))
    age_min = (now - created).total_seconds() / 60
    if age_min > 30:
        continue
    if r["status"] in ("queued", "in_progress"):
        problems.append(f"🟡 進行中: {r['name']} (run {rid})")
    elif r.get("conclusion") == "failure":
        problems.append(f"❌ 失敗: {r['name']} (run {rid})")
print("\n".join(problems))
PYEOF
)

[ -z "$RESULT" ] && exit 0

{
  printf '\033[33m🐶 [ci-watchdog]\033[0m main の CI が未確認です。確認してから終了してください:\n'
  printf '%s\n' "$RESULT"
  printf '→ 進行中: gh run watch <id> で完了まで待つ / 失敗: CI 修正ループ (autonomous-run skill 参照)\n'
  printf '→ 意図的に持ち越す場合のみ: echo <runId> >> .claude/.ci-ack して理由をユーザーに報告\n'
} >&2
exit 2
