#!/usr/bin/env node
// Belvedere — CLI demo
// 使い方:
//   pnpm --filter @belvedere/cli dev demo                          # Plannerデモを実行
//   pnpm --filter @belvedere/cli dev plan       "Sprint 13の議題を作って"
//   pnpm --filter @belvedere/cli dev daily      "..."
//   pnpm --filter @belvedere/cli dev refinement "..."
//   pnpm --filter @belvedere/cli dev review     "..."
//   pnpm --filter @belvedere/cli dev retro      "..."

import { runAgent, buildSystemPrompt, buildRegistry } from '@belvedere/agent';
import { createLLMProvider } from '@belvedere/llm';
import { buildTools } from '@belvedere/tools';
import { createRepoContainer } from '@belvedere/repo';
import type { AgentName } from '@belvedere/shared';

type Cmd = 'demo' | 'plan' | 'daily' | 'refinement' | 'review' | 'retro' | 'help';

const argv = process.argv.slice(2);
const cmd = (argv[0] ?? 'demo') as Cmd;
const userInput = argv.slice(1).join(' ');

function header(title: string): void {
  const line = '━'.repeat(Math.max(20, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}\n`);
}

async function runFor(agent: AgentName, prompt: string): Promise<void> {
  const llm = createLLMProvider(process.env.LLM_PROVIDER);
  const repo = createRepoContainer(process.env.REPO_BACKEND);
  const tools = buildRegistry(buildTools(repo));

  header(`Belvedere ▸ ${agent} agent`);
  console.log(`provider: ${llm.name} / model: gemini-2.5-pro (mocked)`);
  console.log(`prompt  : ${prompt}\n`);

  const run = await runAgent(
    {
      agentName: agent,
      llm,
      model: 'gemini-2.5-pro',
      systemPrompt: buildSystemPrompt(agent),
      tools,
      trigger: 'human',
      onStep: (step) => {
        switch (step.type) {
          case 'tool_call':
            console.log(`  → tool_call    ${step.toolName}  ${JSON.stringify(step.content)}`);
            break;
          case 'tool_result': {
            const preview = JSON.stringify(step.content);
            console.log(`  ← tool_result  ${step.toolName}  ${preview.slice(0, 120)}${preview.length > 120 ? '…' : ''}`);
            break;
          }
          case 'thought':
            // 静かに
            break;
          case 'output':
            // 後でまとめて表示
            break;
        }
      },
    },
    prompt,
  );

  header('Final output');
  console.log(run.outputArtifacts?.summary ?? '(no output)');

  console.log('\n[run summary]');
  console.log(`  status     : ${run.status}`);
  console.log(`  steps      : ${run.steps.length}`);
  console.log(`  llm tokens : in=${run.llmUsage.inputTokens} out=${run.llmUsage.outputTokens}`);
  console.log(`  cost       : $${run.llmUsage.costUsd.toFixed(4)}`);
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'demo':
      await runFor(
        'planner',
        userInput ||
          'Sprint 13 のプランニング会議の議題ドラフトを作ってください。バックログのチケット品質 (DoD/SP/US紐付け) を診断して、不足があれば候補を提示すること。',
      );
      break;
    case 'plan':
      await runFor('planner', userInput || 'プランニング議題を生成してください。');
      break;
    case 'daily':
      await runFor('daily', userInput || 'Sprint 13 のデイリースクラム要約を作ってください。');
      break;
    case 'refinement':
      await runFor(
        'refinement',
        userInput ||
          '次スプリント候補のバックログをリファインメント観点 (粒度 / 依存 / valueImpact / priority↔valueImpact / SP分散) で診断してください。',
      );
      break;
    case 'review':
      await runFor('reviewer', userInput || 'Sprint 13 のレビュー会用デモシナリオを作ってください。');
      break;
    case 'retro':
      await runFor('retrospective', userInput || 'Sprint 12 のふりかえりからTryを抽出してください。');
      break;
    case 'help':
    default:
      console.log(`
Belvedere — CLI

  pnpm demo                                       Plannerのデモ実行 (デフォルト)
  pnpm --filter @belvedere/cli dev plan       "プロンプト"
  pnpm --filter @belvedere/cli dev daily      "プロンプト"
  pnpm --filter @belvedere/cli dev refinement "プロンプト"
  pnpm --filter @belvedere/cli dev review     "プロンプト"
  pnpm --filter @belvedere/cli dev retro      "プロンプト"

env:
  LLM_PROVIDER=mock     (デフォルト)。gemini/vertex は GCP 接続後に実装。
`);
      break;
  }
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
