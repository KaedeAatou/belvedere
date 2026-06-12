#!/usr/bin/env bash
# Hook: PreToolUse on mcp__chrome-devtools__.*
# ブラウザ MCP (chrome-devtools) のページ遷移先を「開発サイトのみ」に制限する (2026-06-12 制定)。
#
# 目的: ユーザー要望「開発しているサイト以外は許可したくない」。
#       Claude が任意の URL を開いて回遊するのを機械的に止める。
#       navigate_page / new_page など url 引数を持つ chrome-devtools ツールが対象。
#       url を持たないツール (click / screenshot / snapshot / evaluate 等) は素通し。
#
# 許可ホスト (これ以外への navigate はブロック):
#   - belvedere-web-dev-cpszmcqmuq-an.a.run.app  (本番 dev Web / Cloud Run)
#   - localhost / 127.0.0.1                        (ローカル Nuxt dev)
#   - about:blank                                  (空ページ)
#
# 注意: ユーザーが Chrome ウィンドウで手動操作する Google ログイン等の遷移 (click 起因の
#       リダイレクト) はこの hook の対象外 (url 引数を伴う navigate ツールのみを検査するため)。
#       将来 preview revision URL 等を許可したくなったら ALLOW_SUFFIXES に追加する。

INPUT=$(cat)

RESULT=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
from urllib.parse import urlparse

ALLOW_HOSTS = {'belvedere-web-dev-cpszmcqmuq-an.a.run.app', 'localhost', '127.0.0.1'}

try:
    d = json.load(sys.stdin)
except Exception:
    print('OK'); sys.exit(0)

ti = d.get('tool_input', {}) or {}
# url を持つフィールドを総当り (navigate_page=url / new_page=url 等)
url = ti.get('url') or ti.get('href') or ''
if not url:
    print('OK'); sys.exit(0)

if url.strip().lower() in ('about:blank', ''):
    print('OK'); sys.exit(0)

host = (urlparse(url).hostname or '').lower()
if host in ALLOW_HOSTS:
    print('OK')
else:
    print('BLOCK ' + (host or url))
")

case "$RESULT" in
  OK*) exit 0 ;;
  BLOCK*)
    HOST="${RESULT#BLOCK }"
    printf '\033[31m🌐 [browser-host-guard]\033[0m 許可外ホストへの遷移をブロック: %s\n' "$HOST" >&2
    printf '   開発サイト (belvedere-web-dev / localhost) 以外は開けません。\n' >&2
    exit 2
    ;;
  *) exit 0 ;;
esac
