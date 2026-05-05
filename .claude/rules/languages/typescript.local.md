---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript — Project-specific patterns

## Project-specific patterns

- `import { ... } from './types'` - **`.js` 拡張子なし** で内部 import (Nuxt/Nitro の workspace 解決制約。`from './types.js'` は使わない)
- `import { ... } from '@belvedere/<pkg>'` - workspace パッケージ参照 (内部識別子は `@belvedere/*` に統一済 / 旧 `@kazaguruma/*` は混入禁止)
- `LLMProvider` interface - `mock` 以外は throw する factory (`packages/llm/src/factory.ts`)
- `RepoContainer` interface - `tickets` / `sprints` / `projects` / `epics` / `stories` / `members` / `ceremonies` / `agentRuns` / `ceremonyHealth` の集約点 (`packages/repo/src/types.ts`)
- `buildTools(repo: RepoContainer): AgentTool[]` factory - グローバルな `allDefaultTools` 配列を作らない (storage 非依存性のため)
- `runAgent({ agentName, llm, model, systemPrompt, tools, trigger, onStep }, prompt)` - Agent 実行ループ (thought → tool_call → tool_result → output、`AgentRun` として記録)
- `buildSystemPrompt(name: AgentName)` - Agent prompt 生成 (Mock LLM の `detectRole` が依存する英語 Agent 名を保持)
- `Ritual = 'planning' \| 'daily' \| 'refinement' \| 'review' \| 'retrospective'` - 5儀式 (Refinement 含む)
- `AgentName = 'orchestrator' \| 'planner' \| 'daily' \| 'refinement' \| 'reviewer' \| 'retrospective'` - 5 ceremony agents + Orchestrator
- `ValueImpact = 'low' \| 'medium' \| 'high'` - プロダクトゴール貢献度 (priority と独立した軸)
- `Project { id, workspaceId, name, idPrefix, ... }` - Jira プロジェクト相当、配下 Epic/Story/Ticket は `${idPrefix}-${number}`
- `Ticket.projectId?` / `Epic.projectId?` / `UserStory.projectId?` - 省略時は default project (`PRJ-belvedere-core`)
- `seedTickets` / `seedSprints` / `seedEpics` / `seedProjects` / `seedMembers` - **immutable** demo fixture (PITCH/UI/mockup から参照されるため変更しない)
- `DEFAULT_PROJECT_ID = 'PRJ-belvedere-core'` - default project の ID 定数 (`packages/seed/src/projects.ts`)
- `LLM_PROVIDER` env: `mock` (default) / `gemini` / `vertex` - GCP 接続後に `gemini` / `vertex` 実装、それまで throw
- `REPO_BACKEND` env: `memory` (default) / `firestore` - Firestore 実装は GCP 接続後

## Examples

When in doubt: ./typescript.examples.md
