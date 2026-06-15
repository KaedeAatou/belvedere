#!/usr/bin/env bash
# ローカル無認証 dev 環境 (d&d 等の UI を実ブラウザ / Chrome DevTools MCP で検証するため)。
#
# なぜスクリプト方式か:
#   deployed app は Firebase Auth (Google OAuth) で自動化ブラウザが弾かれ、実 pointer 経路を
#   誰も踏めない = 「テスト緑 / 実機赤」の温床。そこで web+api をローカルで無認証起動し、
#   実コンポーネント + 実 seed を Chrome から直接操作して再現/検証する。
#
# 安全設計 (重要):
#   認証バイパスは **本番/コミット済コードには一切残さない**。本スクリプトが実行時だけ
#   env ゲート (DEV_NO_AUTH / devNoAuth、いずれも default OFF) を 3 ファイルへ差し込み、
#   終了時 (Ctrl+C / kill) に `git checkout` で確実に元へ戻す。Cloud Run へバイパスが
#   デプロイされる経路は存在しない。
#
# 使い方:
#   ./scripts/dev-local-noauth.sh        # 起動 → http://localhost:3000 (無認証)
#   Ctrl+C                                # 停止 + 認証コードを自動復元
#
# 復元の手動確認: 終了後 `git status` で auth.ts / auth.global.ts / nuxt.config.ts が
# clean (変更なし) になっていること。

set -euo pipefail
cd "$(dirname "$0")/.."

AUTH=apps/api/src/middleware/auth.ts
MW=apps/web/middleware/auth.global.ts
CFG=apps/web/nuxt.config.ts

API_PID=""
WEB_PID=""

cleanup() {
  echo ""
  echo "[dev-local-noauth] 停止中… サーバ kill + 認証コード復元"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  pkill -f "nuxt dev" 2>/dev/null || true
  pkill -f "tsx watch src/index.ts" 2>/dev/null || true
  # 認証バイパスを元に戻す (本番コードにバイパスを残さない)
  git checkout -- "$AUTH" "$MW" "$CFG" 2>/dev/null || true
  echo "[dev-local-noauth] 復元完了。git status で clean を確認してください。"
}
trap cleanup EXIT INT TERM

# 念のため: 開始時点でこの 3 ファイルに未コミット変更があれば中断 (誤って上書きしないため)
if ! git diff --quiet -- "$AUTH" "$MW" "$CFG"; then
  echo "[dev-local-noauth] 中断: $AUTH / $MW / $CFG に未コミット変更があります。先に commit/stash してください。" >&2
  trap - EXIT INT TERM
  exit 1
fi

echo "[dev-local-noauth] env ゲート (default OFF / 実行時のみ) を差し込み…"

# 1) API authMiddleware: DEV_NO_AUTH=1 のとき seed owner (kaede / ws-belvedere) として通す
perl -0pi -e 's/(export const authMiddleware: MiddlewareHandler = async \(c, next\) => \{\n)/$1  if (process.env.DEV_NO_AUTH === '"'"'1'"'"') { c.set('"'"'user'"'"', { userId: '"'"'kaede'"'"', email: '"'"'kaede\@example.com'"'"' }); await next(); return; }\n/ unless /DEV_NO_AUTH/' "$AUTH"

# 2) web auth.global: NUXT_PUBLIC_DEV_NO_AUTH=1 のとき login gate を外す
perl -0pi -e 's/(export default defineNuxtRouteMiddleware\(\(to\) => \{\n)/$1  if (useRuntimeConfig().public.devNoAuth === '"'"'1'"'"') return;\n/ unless /devNoAuth/' "$MW"

# 3) nuxt.config runtimeConfig.public に devNoAuth を宣言 (NUXT_PUBLIC_DEV_NO_AUTH で上書き可)
perl -0pi -e "s/(apiBaseUrl: 'https:\/\/belvedere-api-dev-cpszmcqmuq-an\.a\.run\.app',\n)/\$1      devNoAuth: '',\n/ unless /devNoAuth/" "$CFG"

# 差し込み確認
if ! grep -q DEV_NO_AUTH "$AUTH" || ! grep -q devNoAuth "$MW" || ! grep -q devNoAuth "$CFG"; then
  echo "[dev-local-noauth] env ゲートの差し込みに失敗 (anchor 不一致)。手動確認してください。" >&2
  exit 1
fi
echo "[dev-local-noauth] OK。API(:8080 memory+seed, 無認証) と web(:3000 → local API) を起動…"

DEV_NO_AUTH=1 REPO_BACKEND=memory pnpm --filter @belvedere/api dev > /tmp/belv-api.log 2>&1 &
API_PID=$!
NUXT_PUBLIC_API_BASE_URL=http://localhost:8080 NUXT_PUBLIC_DEV_NO_AUTH=1 pnpm --filter @belvedere/web dev > /tmp/belv-web.log 2>&1 &
WEB_PID=$!

echo "[dev-local-noauth] 起動待ち… (初回 Nuxt ビルドに ~20s)"
echo "[dev-local-noauth]   web : http://localhost:3000  (無認証 / seed owner=kaede)"
echo "[dev-local-noauth]   api : http://localhost:8080  (memory backend + seed)"
echo "[dev-local-noauth]   ログ: /tmp/belv-web.log  /tmp/belv-api.log"
echo "[dev-local-noauth] Ctrl+C で停止 + 認証コード自動復元。"
wait
