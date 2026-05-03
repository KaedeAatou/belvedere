---
paths:
  - "**/*.vue"
---
# Vue 3 — Project-specific patterns

## Project-specific patterns

- `<Icon name="search" />` - 30+ アイコンを 1 SFC で集約 (`apps/web/components/primitives/Icon.vue`、サブコンポーネント分割しない)
- `<TicketRow :t="ticket"><template #extra>...</template></TicketRow>` - 行のオプション列はスロット
- `<Avatar :user="userId" />` - `user` は `string | null | undefined`、`null` で ghost avatar
- `<StoryPoints :value="t.sp" :critical="t.sp == null" />` - SP 未設定時は `critical` で amber 表示
- `<FlagPill :flag="flag" mini />` - `mini` は label 非表示の icon-only 表示
- `<StatusDot :status="t.status" />` - `Status` Literal Union を直接渡す
- `useDemoData()` - `{ tickets, moveTicket }` を返す composable (Designer 由来 demo data)
- `buildChecks(screen, tickets) → AICheck[]` / `screenIntro(screen) → string` - AI Integrity Panel の signal 生成 (`apps/web/composables/useChecks.ts`)
- `ScreenId = 'backlog' \| 'planning' \| 'daily' \| 'review' \| 'retro'` - 5 screen state (儀式と Backlog)
- `CEREMONIES` array - 4 ceremonies (Planning/Daily/Review/Retro) を含む (Backlog は別、Designer 仕様で Refinement は Backlog 統合扱い)

## Examples

When in doubt: ./vue.examples.md
