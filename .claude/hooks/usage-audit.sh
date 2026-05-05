#!/usr/bin/env bash
# Hook: SessionStart
# .claude/.usage.log を読んで、過去 N 日に一度も起動されていない
# subagent / skill を検出し、Claude に判定を依頼する。
#
# 判定の選択肢 (Claude が会話履歴と frontmatter description を照らして決める):
#   1. 削除候補 — 用途がなくなった
#   2. frontmatter description 改善 — 認識されておらず Claude が呼び忘れている
#   3. 維持 — 使う場面はまだ来ていない (時期未到来)

set -u

REPO="${CLAUDE_PROJECT_DIR:-/Users/kaede/Projects/ai-agent-hackathon}"
LOG="$REPO/.claude/.usage.log"
THRESHOLD_DAYS=14

# usage.log がまだ存在しない初回はスキップ (= 記録始まったばかり)
if [ ! -f "$LOG" ]; then
  exit 0
fi

# 全 subagent / skill のリスト
SUBAGENTS=()
for f in "$REPO"/.claude/agents/*.md; do
  [ -f "$f" ] || continue
  name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
  SUBAGENTS+=("$name")
done

SKILLS=()
for f in "$REPO"/.claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  name=$(grep -m1 '^name:' "$f" | sed 's/^name: //')
  SKILLS+=("$name")
done

# 各々の起動回数を集計 (過去 全期間)
unused_subagents=()
for n in "${SUBAGENTS[@]}"; do
  count=$(grep -c "subagent=$n$" "$LOG" 2>/dev/null) || count=0
  if [ "$count" -eq 0 ]; then
    unused_subagents+=("$n")
  fi
done

unused_skills=()
for n in "${SKILLS[@]}"; do
  count=$(grep -c "skill=$n$" "$LOG" 2>/dev/null) || count=0
  if [ "$count" -eq 0 ]; then
    unused_skills+=("$n")
  fi
done

if [ "${#unused_subagents[@]}" -eq 0 ] && [ "${#unused_skills[@]}" -eq 0 ]; then
  exit 0
fi

# 整形 (subagent と skill を別々に)
sub_list=""
skill_list=""
for n in "${unused_subagents[@]}"; do
  sub_list="${sub_list}- subagent: ${n}\\n"
done
for n in "${unused_skills[@]}"; do
  skill_list="${skill_list}- skill: ${n}\\n"
done

# additionalContext で Claude に判定依頼
# hookEventName は 呼び元 hook (SessionStart or UserPromptSubmit) で切替え可能
EVENT="${USAGE_AUDIT_EVENT:-SessionStart}"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "$EVENT",
    "additionalContext": "📋 [usage-audit] 以下の subagent/skill は \`.claude/.usage.log\` に起動記録がありません:\\n\\n${sub_list}${skill_list}\\n判定してください (会話履歴 + 各 frontmatter description を照らし合わせて):\\n\\n1. **削除候補**: 該当機能を使う場面が今後ないと判断できる場合 → ユーザーに削除提案\\n2. **frontmatter 改善**: 起動されるべきなのに Claude (私) が認識せず呼び忘れている場合 → description を「Use this when X is edited」のような明確なトリガ条件付きに修正、または \`disable-model-invocation: false\` (skills のみ) で自動起動させる\\n3. **維持**: 使う場面がまだ来ていない (時期未到来) 場合 → 何もしない\\n\\n判定結果はユーザーに 1-2 行で報告してください。即座に削除や frontmatter 書き換えを行わず、判定理由を共有して合意を取ること。"
  }
}
EOF

# 走った時刻を記録 (rate-limit 用)
touch "$REPO/.claude/.last-usage-audit"

exit 0
