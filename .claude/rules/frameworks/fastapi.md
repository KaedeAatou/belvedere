---
paths:
  - "apps/orchestrator-py/**/*.py"
---
# FastAPI Rules

## Principles

- Real/stub toggle via env (`USE_REAL_ADK=false` でスタブ応答 / `true` で `NotImplementedError`、production-ready 経路だけが silent fallback しない)
- Pydantic body models (`InvokeBody(BaseModel)` で request body を型付け、生 dict は使わない)
- Endpoint name reflects domain (`POST /agents/{name}/invoke` のように domain noun を URL に出す、`/api/v1/...` 慣習よりも明示的)

## Examples

When in doubt: ./fastapi.examples.md
