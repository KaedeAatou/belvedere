---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript Rules

## Principles

- Strict null/index handling (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 全プロジェクトで有効)
- Conditional spread for optional fields (`...(x !== undefined && { key: x })` パターン、`| undefined` を直接渡さない)
- Pluggable abstractions (LLM provider / RepoContainer / Tool factory で実装差し替え可能、未実装は throw して signpost)
- Literal Union for domain enums (`Status` / `Priority` / `Ritual` / `AgentName` などは `string` ではなく Literal Union)
- No silent fallback for unimplemented backends (`gemini` / `vertex` / `firestore` は throw、デフォルトに勝手に落とさない)

## Examples

When in doubt: ./typescript.examples.md
