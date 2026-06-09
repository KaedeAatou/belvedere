// Mock LLM 役割判定ガード (Phase 1-B 末 / 2026-06-09)。
// system prompt から英語 Agent 名を拾って role を切り替える挙動は
// 5 儀式 + Orchestrator のデモ全体が依存する基盤。
// この正規表現が壊れると `pnpm demo` も Phase 2 配線も連鎖崩壊するため、
// 全 role × 固有マーカーで担保する。
// 関連: prompts.ts の英語 Agent 名は agent-prompt-sync skill が並行で守る。

import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/mock';
import type { LLMMessage, LLMRequest } from '../src/provider';

const callMock = async (systemPrompt: string): Promise<string> => {
  const req: LLMRequest = {
    model: 'mock-model',
    messages: [
      { role: 'system', content: systemPrompt } satisfies LLMMessage,
      { role: 'user', content: 'execute the ceremony' } satisfies LLMMessage,
    ],
    // tools 未指定 → planToolCalls をスキップして即 final text
  };
  const res = await new MockLLMProvider().generate(req);
  expect(res.stop.type).toBe('stop');
  return res.text;
};

describe('MockLLMProvider role detection (system prompt → role)', () => {
  const cases: ReadonlyArray<{ role: string; systemPrompt: string; marker: string }> = [
    { role: 'planner',       systemPrompt: 'You are Planner Agent. Plan the sprint.',                marker: '【プランニング補助 (Planner / Mock)】' },
    { role: 'refinement',    systemPrompt: 'You are Refinement Agent. Refine the backlog.',         marker: '【バックログリファインメント診断 (Refinement / Mock)】' },
    { role: 'daily',         systemPrompt: 'You are Daily Agent. Run the daily standup.',           marker: '【デイリースクラム要約 (Daily / Mock)】' },
    { role: 'reviewer',      systemPrompt: 'You are Reviewer Agent. Support the sprint review.',    marker: '【スプリントレビュー支援 (Reviewer / Mock)】' },
    { role: 'retrospective', systemPrompt: 'You are Retrospective Agent. Extract tries from retro.', marker: '【ふりかえり Try 抽出 (Retrospective / Mock)】' },
    { role: 'orchestrator',  systemPrompt: 'You are Orchestrator. Route to specialized agents.',    marker: '【Orchestrator 判定 (Mock)】' },
  ];

  for (const { role, systemPrompt, marker } of cases) {
    it(`detects ${role} via "${marker.slice(1, 10)}..."`, async () => {
      const text = await callMock(systemPrompt);
      expect(text).toContain(marker);
    });
  }

  it('falls back to unknown when no role keyword is present', async () => {
    const text = await callMock('You are a generic helpful assistant.');
    expect(text).toContain('【未識別エージェント (Mock)】');
  });

  it('Planner Agent prio over Refinement Agent (regex order matters)', async () => {
    // detectRole は Planner Agent を最初にマッチさせる。両方混在しても planner と判定される
    const text = await callMock('You are Planner Agent and partially Refinement Agent.');
    expect(text).toContain('【プランニング補助 (Planner / Mock)】');
  });
});
