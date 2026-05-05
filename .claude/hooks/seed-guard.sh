#!/usr/bin/env bash
# Hook: PreToolUse on Edit/Write/MultiEdit
# packages/seed/ 配下の編集を警告で止める。
# EP-1..4 (Epic) / WC-101..112 (Task) / US-101..US-402 (Story) はピッチ・採用UI・PRODUCT_BRIEF.md から参照されており、
# 不用意に変更すると整合が崩れる。
# どうしても変更したいときは CLAUDE_FORCE_SEED_EDIT=1 を立てて再実行する。

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

LOG="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/.hooks.log"

case "$FILE_PATH" in
  */packages/seed/src/*)
    if [ -z "$CLAUDE_FORCE_SEED_EDIT" ]; then
      echo "$(date -u +%FT%TZ) [seed-guard] BLOCKED file=${FILE_PATH##*/}" >> "$LOG"
      printf '\033[31m🛡️  [seed-guard]\033[0m BLOCKED %s (CLAUDE_FORCE_SEED_EDIT=1 で迂回)\n' "${FILE_PATH##*/}" >&2
      cat >&2 <<EOF
[seed-fixture-guard] BLOCKED: $FILE_PATH

packages/seed/src/ は不変デモfixtureです。
EP-1..4 (Epic) / WC-101..112 (Task) / US-101..US-402 (Story、apps/web/lib/data.ts 側) は以下から参照されています:
  - PITCH.md (3分ピッチ)
  - PRODUCT_BRIEF.md (プロダクト説明)
  - AGENT_DESIGN.md / DATA_MODEL.md (型・責務記述)
  - ui-mockups-v3/cases/13-hand-digital.html (採用UI)
  - apps/web (Nuxt 3, Epic > Story > Task 表示)
  - apps/cli, apps/api のデモ動作
  - packages/llm/src/mock.ts (Mock LLM の引用ID)

新規追加なら別ファイルで、既存変更なら CLAUDE_FORCE_SEED_EDIT=1 を立てて再実行してください。
ピッチ素材・採用UI・Mock LLM 出力まで影響範囲を確認することを強く推奨します。
EOF
      exit 2
    else
      echo "$(date -u +%FT%TZ) [seed-guard] BYPASS file=${FILE_PATH##*/} (CLAUDE_FORCE_SEED_EDIT=1)" >> "$LOG"
      printf '\033[33m🛡️  [seed-guard]\033[0m BYPASS %s (forced)\n' "${FILE_PATH##*/}" >&2
    fi
    ;;
esac
exit 0
