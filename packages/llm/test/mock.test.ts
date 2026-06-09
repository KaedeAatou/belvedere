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
  // buildSystemPrompt (packages/agent/src/prompts.ts) は `Your role: <Role>` 形式で role を埋め込む。
  // 本テストはその anchor 仕様に従って system prompt を組み立てる。
  const cases: ReadonlyArray<{ role: string; systemPrompt: string; marker: string }> = [
    { role: 'planner',       systemPrompt: 'COMMON\n\nYour role: Planner Agent\nYour responsibility: ...',           marker: '【プランニング補助 (Planner / Mock)】' },
    { role: 'refinement',    systemPrompt: 'COMMON\n\nYour role: Refinement Agent\nYour responsibility: ...',        marker: '【バックログリファインメント診断 (Refinement / Mock)】' },
    { role: 'daily',         systemPrompt: 'COMMON\n\nYour role: Daily Agent\nYour responsibility: ...',             marker: '【デイリースクラム要約 (Daily / Mock)】' },
    { role: 'reviewer',      systemPrompt: 'COMMON\n\nYour role: Reviewer Agent\nYour responsibility: ...',          marker: '【スプリントレビュー支援 (Reviewer / Mock)】' },
    { role: 'retrospective', systemPrompt: 'COMMON\n\nYour role: Retrospective Agent\nYour responsibility: ...',     marker: '【ふりかえり Try 抽出 (Retrospective / Mock)】' },
    { role: 'orchestrator',  systemPrompt: 'COMMON\n\nYour role: Orchestrator (gemini-2.5-flash 相当)\nYour responsibility: ...', marker: '【Orchestrator 判定 (Mock)】' },
  ];

  for (const { role, systemPrompt, marker } of cases) {
    it(`detects ${role}`, async () => {
      const text = await callMock(systemPrompt);
      expect(text).toContain(marker);
    });
  }

  it('falls back to unknown when no Your role: anchor is present', async () => {
    const text = await callMock('You are a generic helpful assistant.');
    expect(text).toContain('【未識別エージェント (Mock)】');
  });

  it('falls back to unknown when role anchor is missing even if agent name appears in prose', async () => {
    // 'Planner Agent' / 'Daily Agent' という文字列があっても、'Your role: ' anchor が無いと判定しない。
    // これが旧 unanchored 正規表現での誤ルーティング (Reviewer prompt 中の incidental Agent mention) を防ぐ要。
    const text = await callMock('Please note that Planner Agent or Daily Agent may be involved later.');
    expect(text).toContain('【未識別エージェント (Mock)】');
  });

  it('incidental mention of other agents in Reviewer prompt routes to reviewer (NOT misrouted to daily)', async () => {
    // Reviewer の system prompt が本文中で 'Daily Agent' に言及しても、
    // anchor は 'Your role: Reviewer Agent' なので reviewer と判定される。
    const text = await callMock(
      'Your role: Reviewer Agent\nYour responsibility: Sprint Review 支援。\nNote: 必要に応じて Daily Agent との連携を取りつつ進めること。',
    );
    expect(text).toContain('【スプリントレビュー支援 (Reviewer / Mock)】');
    expect(text).not.toContain('【デイリースクラム要約 (Daily / Mock)】');
  });
});
