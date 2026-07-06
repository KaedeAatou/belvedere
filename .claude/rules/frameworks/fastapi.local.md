---
paths:
  - "apps/orchestrator-py/**/*.py"
---
# FastAPI — Project-specific patterns

## Project-specific patterns

- `app = FastAPI(title="Belvedere Orchestrator", version="0.0.1")` - app instance (logger は `belvedere.orchestrator`)
- `POST /agents/{name}/invoke` - agent 起動エンドポイント。`InvokeBody { prompt, sprint_id? }` を受ける
- `GET /health` → `{ status, agents: list[str], use_real_adk, gcp_project }` - 監視用 (Cloud Run health check 想定)
- `if not USE_REAL_ADK: return { stub: True, instruction_excerpt, echo_prompt, note }` - 開発時スタブ応答 (実際の Gemini を呼ばない)
- `if USE_REAL_ADK: app = _build_a2a_app()` - 実 `LlmAgent`(Refinement) を `to_a2a` で A2A 公開 (Agent Card + JSON-RPC)
- `INSTRUCTIONS[name].strip().splitlines()[1]` - 各 agent INSTRUCTION の責務行を抜き出してスタブ応答に含める

## Examples

When in doubt: ./fastapi.examples.md
