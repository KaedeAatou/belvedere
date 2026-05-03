---
paths:
  - "**/*.py"
---
# Python Rules

## Principles

- Future annotations (`from __future__ import annotations` を全モジュール先頭に必須、forward reference を簡素化)
- Strict mypy + ruff (`tool.mypy.strict = true` / `ruff lint select = E F I N W B UP`、line-length 100)
- Literal types for closed enums (Status / Priority / Ritual / AgentName は `Literal[...]` で制約、`str` ではない)
- TS schema sync via Pydantic alias (TS の camelCase キー (例 `projectId`) を `Field(alias=...)` で受ける、両層で同じ JSON shape を保つ)

## Examples

When in doubt: ./python.examples.md
