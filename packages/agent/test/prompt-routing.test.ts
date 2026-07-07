// buildSystemPrompt → Mock LLM detectRole 結合テスト (R1 / 2026-06-18)。
//
// なぜ実出力で踏むか: mock.test.ts は system prompt を手書きリテラルで組むため、
// buildSystemPrompt (packages/agent/src/prompts.ts) 側の anchor が変わっても気付けない。
// 本テストは **実際の buildSystemPrompt 出力** を MockLLMProvider に食わせて 6 role が
// 正しい儀式応答に到達することを固定し、prompt 編集による静かな役割判定崩壊を捕まえる。
//
// Gemini フェーズで人間向け prompt 文を触ったときの保険 = R1 (Agent-Id anchor 導入) の主目的。

import { describe, it, expect } from 'vitest';
import type { AgentName } from '@belvedere/shared';
import { MockLLMProvider } from '@belvedere/llm';
import { buildSystemPrompt } from '../src/prompts';

// getNaturalOutput (packages/llm/src/mock.ts) の儀式別マーカー。役割が取り違われると別マーカーになる。
const ROLE_MARKERS: Record<AgentName, string> = {
  planner: '【プランニング補助 (Planner / Mock)】',
  refinement: '【バックログリファインメント診断 (Refinement / Mock)】',
  daily: '【デイリースクラム要約 (Daily / Mock)】',
  reviewer: '【スプリントレビュー支援 (Reviewer / Mock)】',
  retrospective: '【ふりかえり Try 抽出 (Retrospective / Mock)】',
  orchestrator: '【Orchestrator 協議統括 (Mock)】',
};

describe('prompt routing: 実 buildSystemPrompt 出力 → Mock detectRole', () => {
  const llm = new MockLLMProvider();

  for (const [name, marker] of Object.entries(ROLE_MARKERS) as [AgentName, string][]) {
    it(`routes ${name} from real buildSystemPrompt output`, async () => {
      const sys = buildSystemPrompt(name);
      // tools 未指定 → planToolCalls をスキップして即 final text (mock.test.ts と同じ流儀)。
      const res = await llm.generate({
        model: 'mock-model',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: 'execute the ceremony' },
        ],
      });
      expect(res.stop.type).toBe('stop');
      expect(res.text).toContain(marker);
    });
  }

  it('全 role の出力先頭に Agent-Id <name> anchor が存在する (detectRole の一次 anchor 保全)', () => {
    for (const name of Object.keys(ROLE_MARKERS) as AgentName[]) {
      const firstLine = buildSystemPrompt(name).split('\n', 1)[0];
      expect(firstLine).toBe(`Agent-Id: ${name}`);
    }
  });

  it('全 role の system prompt に会話規律 (COMMON_CONVERSATION) が儀式手順より前に入る', () => {
    // AI パネルはチャット窓口。挨拶や短い質問に定型診断を返さないよう、対話規律を
    // retro_try_step (「実行の最初に retro.tries.list を呼べ」) より前に置いて優先させる。
    for (const name of Object.keys(ROLE_MARKERS) as AgentName[]) {
      const sys = buildSystemPrompt(name);
      expect(sys).toContain('<conversation>');
      expect(sys).toContain('まずユーザーの発話');
      const convIdx = sys.indexOf('<conversation>');
      const retroIdx = sys.indexOf('<retro_try_step>');
      expect(retroIdx).toBeGreaterThanOrEqual(0);
      expect(convIdx).toBeLessThan(retroIdx);
    }
  });
});
