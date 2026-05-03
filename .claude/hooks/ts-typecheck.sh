#!/usr/bin/env bash
# Hook: PostToolUse on Edit/Write/MultiEdit
# packages/* または apps/* 配下の .ts/.tsx を編集した後、pnpm typecheck を流す。
# strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes の網に引っかかる
# ミスを即座に検出する。
#
# テストファイル (.test.ts / .spec.ts) は対象外。
# .claude/ や ui-mockups/ の編集も対象外。

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {}) or {}
    print(ti.get('file_path') or ti.get('path') or '')
except Exception:
    print('')
")

# 対象判定
is_ts_or_tsx() {
  case "$1" in
    *.ts|*.tsx) return 0 ;;
    *) return 1 ;;
  esac
}
is_in_pkg_or_apps() {
  case "$1" in
    */packages/*|*/apps/*) return 0 ;;
    *) return 1 ;;
  esac
}
is_test_file() {
  case "$1" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 0 ;;
    *) return 1 ;;
  esac
}

if ! is_ts_or_tsx "$FILE_PATH"; then exit 0; fi
if ! is_in_pkg_or_apps "$FILE_PATH"; then exit 0; fi
if is_test_file "$FILE_PATH"; then exit 0; fi

REPO_ROOT="/Users/kagayayuuki/Projects/ai-agent-hackathon"
LOG=/tmp/kaza-typecheck.log

cd "$REPO_ROOT" || exit 0

if pnpm typecheck >"$LOG" 2>&1; then
  echo "[ts-typecheck] ✅ OK after $(basename "$FILE_PATH")"
else
  {
    echo "[ts-typecheck] ❌ FAILED after $(basename "$FILE_PATH")"
    echo "----- last 30 lines -----"
    tail -30 "$LOG"
  } >&2
  exit 2
fi
