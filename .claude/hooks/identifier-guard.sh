#!/usr/bin/env bash
# Hook: PreToolUse on Edit|Write|MultiEdit|Bash
# 会社識別子・秘密情報の混入を書き込み時点でブロックする (2026-06-12 制定)。
#
# 背景: 2026-06-12 の hackathon-compliance 監査で、negative test とガードライン記述に
# 会社メアドのフル文字列がハードコードされ公開 repo に露出していたことを検出 (🔴)。
# 手動検出に頼らず、機械的に書き込み自体を止める再発防止策。
#
# 検出パターン:
# 1. 汎用シークレット (このファイルに直書きして良いもの):
#    - PEM 秘密鍵ブロック / Google API key (AIza...) / AWS Access Key (AKIA...)
# 2. プロジェクト固有の会社識別子:
#    - パターン文字列自体が公開 repo に載ると本末転倒なので、リポジトリ外の
#      ~/.claude/belvedere-guard-patterns.txt (1 行 1 パターン, grep -E 形式) から読む。
#      ファイルが無い環境ではスキップ (fail-open: 汎用パターンのみ適用)。
#
# 対象:
# - Edit/Write/MultiEdit: 書き込まれる content / new_string をスキャン
# - Bash: command に "git commit" を含む場合のみ、staged diff の追加行をスキャン
#   (heredoc 等 Edit/Write を経由しない書き込みも commit 時点で必ず捕まえる)
#
# ブロック時: exit 2 + 理由を stderr (Claude に表示され、修正を促す)

INPUT=$(cat)

PATTERN_FILE="$HOME/.claude/belvedere-guard-patterns.txt"

# 検査対象テキストを抽出
TEXT=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool = d.get('tool_name', '')
ti = d.get('tool_input', {}) or {}
out = []
if tool in ('Edit', 'Write'):
    out.append(ti.get('content', '') or '')
    out.append(ti.get('new_string', '') or '')
elif tool == 'MultiEdit':
    for e in ti.get('edits', []) or []:
        out.append(e.get('new_string', '') or '')
elif tool == 'Bash':
    cmd = ti.get('command', '') or ''
    if 'git commit' in cmd:
        print('__SCAN_STAGED__')
        sys.exit(0)
    sys.exit(0)
print('\n'.join(out))
")

[ -z "$TEXT" ] && exit 0

if [ "$TEXT" = "__SCAN_STAGED__" ]; then
  # commit 直前: staged diff の追加行だけを検査 (削除行で過去の混入を消す操作は通す)
  TEXT=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" diff --cached 2>/dev/null | grep '^+' | grep -v '^+++' || true)
  [ -z "$TEXT" ] && exit 0
fi

block() {
  printf '\033[31m🛑 [identifier-guard]\033[0m %s\n' "$1" >&2
  printf '   公開 repo への混入を防ぐためブロックしました。表現を一般化するか、リポジトリ外に置いてください。\n' >&2
  exit 2
}

# 1. 汎用シークレットパターン
printf '%s' "$TEXT" | grep -qE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' && block "PEM 秘密鍵ブロックを検出"
printf '%s' "$TEXT" | grep -qE 'AIza[0-9A-Za-z_-]{35}' && block "Google API key (AIza...) を検出"
printf '%s' "$TEXT" | grep -qE 'AKIA[0-9A-Z]{16}' && block "AWS Access Key (AKIA...) を検出"

# 2. プロジェクト固有パターン (repo 外ファイルから)
if [ -f "$PATTERN_FILE" ]; then
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    if printf '%s' "$TEXT" | grep -qiE -- "$pat"; then
      block "会社識別子パターンに一致 (~/.claude/belvedere-guard-patterns.txt)"
    fi
  done < "$PATTERN_FILE"
fi

exit 0
