---
paths:
  - "**/*.vue"
---
# Vue 3 Rules

## Principles

- Composition API only (Options API は使わない、`<script setup lang="ts">` を全 SFC で使用)
- Generic-typed props/emits (`defineProps<{ ... }>()` / `defineEmits<{ ... }>()` で TypeScript generics、`PropType` ベースは使わない)
- Inline `:style` for design tokens (CSS variables `var(--accent)` 等を `:style="{ color: 'var(--accent)' }"` で参照、scoped CSS で再宣言しない)
- Slot for layout flexibility (構造的な部品 (Shell / Card 等) はスロット、props で children を受けない)
- v-model for two-way state (state を持つ親が `v-model:screen` 形式で渡す、`update:xxx` emit と組み合わせ)

## Examples

When in doubt: ./vue.examples.md
