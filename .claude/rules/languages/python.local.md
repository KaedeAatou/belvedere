---
paths:
  - "**/*.py"
---
# Python — Project-specific patterns

## Project-specific patterns

- `Status = Literal["backlog","todo","in-progress","review","done"]` - TS 側 `Status` と同期
- `Ritual = Literal["planning","daily","refinement","review","retrospective"]` - 5儀式 (Refinement 含む)
- `AgentName = Literal["orchestrator","planner","daily","refinement","reviewer","retrospective"]` - 5 + Orchestrator
- `Field(alias="projectId")` / `Field(alias="idPrefix")` - Pydantic で TS の camelCase キーを受ける
- `INSTRUCTIONS: dict[str, str]` - agent 指示文の一元管理 (`apps/orchestrator-py/src/orchestrator/agents.py`)
- `build_agents(use_real_adk: bool)` - `False` でスタブ dict / `True` で `NotImplementedError` (ADK は GCP セットアップ後)
- `USE_REAL_ADK` env - `false` (default) / `true` で本物の Gemini 推論。silent fallback せず明示的に分岐
- `COMMON_RULES` 文字列 - 5 agent INSTRUCTION で共有する制約 (出力日本語 / source ID 引用 / L2 で人間確認 / 造語禁止)
- `kazaguruma-orchestrator` - pyproject の package name (TS workspace の `@kazaguruma/*` と内部識別子を揃える、再ブランド過渡期)
- `google-adk` / `google-genai` / `google-cloud-aiplatform` / `google-cloud-firestore` / `google-cloud-secret-manager` - GCP SDK 依存 (実装は接続後)

## Examples

When in doubt: ./python.examples.md
