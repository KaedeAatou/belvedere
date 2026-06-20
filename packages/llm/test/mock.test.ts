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
    { role: 'orchestrator',  systemPrompt: 'COMMON\n\nYour role: Orchestrator (gemini-2.5-flash 相当)\nYour responsibility: ...', marker: '【Orchestrator 協議統括 (Mock)】' },
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

describe('MockLLMProvider Agent-Id anchor (一次 anchor / R1 二段化 / 2026-06-18)', () => {
  // buildSystemPrompt は 1 行目に機械可読 `Agent-Id: <name>` を埋める。Gemini フェーズで
  // 人間向け `Your role:` 文を編集しても役割判定が壊れないことを固定する (1 段目を直接踏む)。
  it('routes via Agent-Id alone even when no Your role: line exists', async () => {
    // `Your role:` 行が存在しなくても Agent-Id だけで refinement に到達する。
    const text = await callMock('Agent-Id: refinement\n<responsibility>Backlog Refinement 支援。</responsibility>');
    expect(text).toContain('【バックログリファインメント診断 (Refinement / Mock)】');
  });

  it('Agent-Id wins over a conflicting Your role: line (一次 anchor 優先)', async () => {
    // 機械可読 anchor を一次ソースにするので、矛盾時は Agent-Id (planner) が Your role (Daily) に勝つ。
    const text = await callMock('Agent-Id: planner\nYour role: Daily Agent\n責務...');
    expect(text).toContain('【プランニング補助 (Planner / Mock)】');
    expect(text).not.toContain('【デイリースクラム要約 (Daily / Mock)】');
  });

  it('Agent-Id mid-line (行頭でない) は誤検出しない → Your role: fallback に落ちる', async () => {
    // 行頭限定 (^...m flag) なので、散文中の "Agent-Id:" では 1 段目をスキップし 2 段目で判定する。
    const text = await callMock('Note: the Agent-Id: daily field is set elsewhere.\nYour role: Reviewer Agent');
    expect(text).toContain('【スプリントレビュー支援 (Reviewer / Mock)】');
    expect(text).not.toContain('【デイリースクラム要約 (Daily / Mock)】');
  });
});

describe('MockLLMProvider tool-call decision tree (C3: deferred branches)', () => {
  const fakeTools = [
    { name: 'ticket.list', description: '', parameters: {} },
    { name: 'sprint.get', description: '', parameters: {} },
    { name: 'epic.list', description: '', parameters: {} },
    { name: 'ticket.quality.check', description: '', parameters: {} },
  ];

  // alreadyCalled / markCalled の動作担保。
  // 同じ sessionKey (= req.messages.length) で 2 度目に呼ばれた時、planToolCalls が
  // 同じ tool を再発行しないこと。
  it('does not re-issue the same tool calls when sessionKey is unchanged', async () => {
    const provider = new MockLLMProvider();
    const req: LLMRequest = {
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Your role: Planner Agent\nYour responsibility: Planning 支援。' },
        { role: 'user', content: 'plan it' },
      ],
      tools: fakeTools,
    };
    // 1 回目: tool_calls を返す
    const first = await provider.generate(req);
    expect(first.stop.type).toBe('tool_calls');
    if (first.stop.type !== 'tool_calls') return;
    const firstToolNames = first.stop.calls.map((c) => c.name);
    expect(firstToolNames.length).toBeGreaterThan(0);

    // 2 回目: 全く同じ messages → 同じ sessionKey → markCalled 済の tool は除外 → calls 空 → final text へ
    const second = await provider.generate(req);
    expect(second.stop.type).toBe('stop');
    // unknown role の fallback ではなく Planner の最終応答に到達している
    expect(second.text).toContain('【プランニング補助 (Planner / Mock)】');
  });

  // responseSchema 経路: JSON で返ること
  it('returns structured JSON when responseSchema is provided (no tools)', async () => {
    const provider = new MockLLMProvider();
    const res = await provider.generate({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Your role: Refinement Agent\nYour responsibility: Refinement 支援。' },
        { role: 'user', content: 'refine' },
      ],
      responseSchema: { type: 'object' },
      // tools 未指定 → planToolCalls 経路を抜けて即 composeFinalAnswer (構造化分岐)
    });
    expect(res.stop.type).toBe('stop');
    // JSON parseable
    const parsed = JSON.parse(res.text) as { summary?: string; findings?: unknown[] };
    expect(parsed).toBeTypeOf('object');
    // Refinement の構造化出力には findings 配列があるはず (mock.ts getStructuredOutput より)
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  // justGotToolResult 分岐: 直前 message が tool ならツール呼び出しをスキップして即 final
  it('returns final answer immediately when last message is a tool result', async () => {
    const provider = new MockLLMProvider();
    const res = await provider.generate({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Your role: Planner Agent\nYour responsibility: Planning 支援。' },
        { role: 'user', content: 'plan' },
        { role: 'assistant', content: '' },
        // 直前が tool result → justGotToolResult=true → planToolCalls スキップ
        { role: 'tool', content: '[]', toolCallId: 'call_x', toolName: 'ticket.list' },
      ],
      tools: fakeTools,
    });
    expect(res.stop.type).toBe('stop');
    expect(res.text).toContain('【プランニング補助 (Planner / Mock)】');
  });

  // phase 3: Orchestrator=単一窓口=協議統括。agent.invoke が渡されたら儀式 agent を子として招集する。
  it('orchestrator は agent.invoke が渡されると儀式 agent を子として招集する (協議統括)', async () => {
    const provider = new MockLLMProvider();
    const res = await provider.generate({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Your role: Orchestrator (gemini-2.5-flash 相当)\nYour responsibility: 協議統括。' },
        { role: 'user', content: 'まとめて' },
      ],
      tools: [{ name: 'agent.invoke', description: '', parameters: {} }],
    });
    expect(res.stop.type).toBe('tool_calls');
    if (res.stop.type !== 'tool_calls') return;
    const invokes = res.stop.calls.filter((c) => c.name === 'agent.invoke');
    expect(invokes.length).toBeGreaterThan(0);
    // 招集先は儀式 agent (CEREMONY_AGENTS) のみ。orchestrator 自身は招集しない (自己参照しない)。
    const ceremony = ['planner', 'daily', 'refinement', 'reviewer', 'retrospective'];
    for (const c of invokes) {
      expect(ceremony).toContain((c.arguments as { agentName?: string }).agentName);
    }
  });

  it('orchestrator は agent.invoke が無ければ儀式作業をせず即統括出力へ (素の buildTools = 深さ1)', async () => {
    const provider = new MockLLMProvider();
    const res = await provider.generate({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Your role: Orchestrator (gemini-2.5-flash 相当)' },
        { role: 'user', content: 'まとめて' },
      ],
      tools: [{ name: 'ticket.list', description: '', parameters: {} }], // agent.invoke 無し
    });
    // agent.invoke が無いので base tool (ticket.list) を呼ばず即終了 = 窓口は儀式作業を自分でしない
    expect(res.stop.type).toBe('stop');
    expect(res.text).toContain('【Orchestrator 協議統括 (Mock)】');
  });
});

describe('MockLLMProvider knowledge.search 配線 (RAG / Stage2 / 2026-06-20)', () => {
  // prompts.ts の COMMON_KNOWLEDGE_STEP は Refinement / Planner / Retrospective にのみ付与され、
  // mock.ts はこの 3 ロールで knowledge.search を tryCall する。tryCall は toolNames ガード付きなので、
  // searcher 未注入 (本番 SEARCH_BACKEND=none) では発火しない = ここを回帰固定する。
  const firstCallNames = async (role: string, includeKnowledge: boolean): Promise<string[]> => {
    const toolNames = [
      'ticket.list', 'sprint.get', 'epic.list', 'project.list',
      'ticket.quality.check', 'backlog.refinement.check', 'member.list',
    ];
    if (includeKnowledge) toolNames.push('knowledge.search');
    const tools = toolNames.map((name) => ({ name, description: '', parameters: {} }));
    const res = await new MockLLMProvider().generate({
      model: 'mock-model',
      messages: [
        { role: 'system', content: `Agent-Id: ${role}` },
        { role: 'user', content: 'go' },
      ],
      tools,
    });
    return res.stop.type === 'tool_calls' ? res.stop.calls.map((c) => c.name) : [];
  };

  for (const role of ['refinement', 'planner', 'retrospective'] as const) {
    it(`${role} は knowledge.search が利用可能なら呼ぶ`, async () => {
      expect(await firstCallNames(role, true)).toContain('knowledge.search');
    });
    it(`${role} は knowledge.search が無ければ呼ばない (toolNames ガード / 本番無害)`, async () => {
      expect(await firstCallNames(role, false)).not.toContain('knowledge.search');
    });
  }

  it('daily / reviewer / orchestrator は knowledge.search を呼ばない (knowledge-heavy 3 ロール限定)', async () => {
    for (const role of ['daily', 'reviewer', 'orchestrator'] as const) {
      expect(await firstCallNames(role, true)).not.toContain('knowledge.search');
    }
  });
});

describe('MockLLMProvider seed consistency (C2 fix: avoid fabricated values)', () => {
  // ピッチデモで Web UI が seed の値 (Sprint 12 velocity=27pt / US-201 等) を表示する横で、
  // Mock LLM 応答が異なる数値や fabricated ID を吐くと矛盾露呈する。本テストは
  // 過去の不一致を回帰させないための seed parity guard。
  it('Planner 応答の velocity は seed の 27pt (sprint-12) と一致する (容量/fabricated 値を回帰防止)', async () => {
    const text = await callMock('Your role: Planner Agent\nYour responsibility: Sprint Planning 支援。');
    expect(text).toContain('velocity 27pt');
    expect(text).not.toContain('Capacity 32pt');
  });

  it('Planner 応答は WC-104 → US-201 を提案する (旧 US-401 は seed にも PRODUCT_BRIEF にも存在しない)', async () => {
    const text = await callMock('Your role: Planner Agent\nYour responsibility: Sprint Planning 支援。');
    expect(text).toContain('US-201');
    expect(text).not.toContain('US-401');
  });
});

describe('MockLLMProvider callCount LRU cap (memory leak prevention)', () => {
  it('does not exceed MAX_CALLCOUNT_ENTRIES (200) regardless of session count', async () => {
    // module singleton として長時間動作する Cloud Run instance を模した負荷シナリオ:
    // 300 個の異なる sessionKey で planToolCalls を発火させ、Map が 200 を超えないことを担保
    const provider = new MockLLMProvider();
    const fakeTools = [
      { name: 'ticket.list', description: '', parameters: {} },
      { name: 'sprint.get', description: '', parameters: {} },
    ];
    for (let i = 0; i < 300; i++) {
      // sessionKey は req.messages.length なので message 数を変えて毎回ユニークにする
      const messages = Array.from({ length: i + 2 }, (_, j) => ({
        role: 'user' as const,
        content: `m${j}`,
      }));
      messages.unshift({ role: 'user' as const, content: 'Your role: Planner Agent\nYour responsibility: ...' });
      // 最初の system message として差し込み (provider.ts の LLMMessage 型に従う)
      const sysMsg = { role: 'system' as const, content: 'Your role: Planner Agent\nYour responsibility: ...' };
      await provider.generate({
        model: 'mock-model',
        messages: [sysMsg, ...messages.slice(1)],
        tools: fakeTools,
      });
    }
    // FIFO eviction で 200 件を上限に維持されている
    expect(provider._callCountSize()).toBeLessThanOrEqual(200);
  });
});
