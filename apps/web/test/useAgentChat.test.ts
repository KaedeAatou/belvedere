// useAgentChat の ④ feature flag 送信先解決 (resolveAgentName) の直接 unit テスト (2026-06-19)。
//
// AI パネルの送信先が flag (useOrchestratorWindow) で切り替わる配線を純粋関数で固定する:
// - OFF (既定): 画面に対応する儀式 agent (backlog/refinement→refinement, planning→planner 等)。
// - ON: 画面に依らず Orchestrator (単一窓口=協議統括) に集約。
// ※ Nuxt の useRuntimeConfig を mock すると router plugin が壊れるため、ロジックを純粋関数に切り出して直接踏む。

import { describe, it, expect } from 'vitest';
import type { ScreenId } from '~/composables/useUiMeta';
import type { Sprint, Ticket } from '@belvedere/shared';
import { resolveAgentName, buildAgentContext, isFlagEnabled, chatStorageKey, type AgentContextInput } from '~/composables/useAgentChat';

const ALL_SCREENS: ScreenId[] = ['backlog', 'refinement', 'planning', 'daily', 'review', 'retro'];

describe('resolveAgentName (④ orchestrator window flag)', () => {
  it('OFF (既定): 画面に対応する儀式 agent に解決する', () => {
    expect(resolveAgentName('backlog', false)).toBe('refinement');
    expect(resolveAgentName('refinement', false)).toBe('refinement');
    expect(resolveAgentName('planning', false)).toBe('planner');
    expect(resolveAgentName('daily', false)).toBe('daily');
    expect(resolveAgentName('review', false)).toBe('reviewer');
    expect(resolveAgentName('retro', false)).toBe('retrospective');
  });

  it('ON: 全画面で Orchestrator (単一窓口) に集約する', () => {
    for (const s of ALL_SCREENS) {
      expect(resolveAgentName(s, true)).toBe('orchestrator');
    }
  });
});

// F-02 (2026-07-08): localStorage キーが 'belv:ai-chat:v1' 固定で workspace 非スコープだったため、
// Workspace 切替 (location.reload) 後も前 WS の会話が残留した。キーを workspace 単位に分離する。
describe('chatStorageKey (F-02 — 会話の localStorage キーを workspace 単位に分離)', () => {
  it('workspace ごとに別キーになる (切替で前 WS の会話が漏れない)', () => {
    expect(chatStorageKey('ws-a')).not.toBe(chatStorageKey('ws-b'));
    expect(chatStorageKey('ws-a')).toContain('ws-a');
    expect(chatStorageKey('ws-b')).toContain('ws-b');
  });

  it('退化入力: workspaceId 不明 (null / undefined / 空文字) は旧来の共通キーに落ちる', () => {
    // WS 未選択 (onboarding 前 / SSR) では会話をどの WS にも帰属させられないため旧キーを使う。
    expect(chatStorageKey(null)).toBe('belv:ai-chat:v1');
    expect(chatStorageKey(undefined)).toBe('belv:ai-chat:v1');
    expect(chatStorageKey('')).toBe('belv:ai-chat:v1');
  });
});

describe('isFlagEnabled (env flag の厳密 boolean 化)', () => {
  it('true / "true" のみ有効。false / "false" / undefined は無効', () => {
    expect(isFlagEnabled(true)).toBe(true);
    expect(isFlagEnabled('true')).toBe(true);
    expect(isFlagEnabled(false)).toBe(false);
    expect(isFlagEnabled('false')).toBe(false); // Boolean("false")===true の事故を防ぐ
    expect(isFlagEnabled(undefined)).toBe(false);
  });
});

const sp = (over: Partial<Sprint> & { id: string; status: Sprint['status'] }): Sprint => ({
  workspaceId: 'ws', number: 1, startsAt: '', endsAt: '', goal: '', capacity: 0, ...over,
});

const tk = (over: Partial<Ticket> & { id: string }): Ticket => ({
  workspaceId: 'ws', title: 't', status: 'todo', priority: 'medium',
  createdAt: '', updatedAt: '', createdBy: 'human', ...over,
});

const ctxInput = (over: Partial<AgentContextInput> = {}): AgentContextInput => ({
  sprints: [], screen: 'planning', tickets: [], selectedTicketId: null, ...over,
});

describe('buildAgentContext (P2 — 画面 + スプリント + チケット文脈の自動付与)', () => {
  it('画面名を必ず含める (スプリントが無くても文脈は空にならない)', () => {
    expect(buildAgentContext(ctxInput({ screen: 'daily' }))).toContain('現在の画面: Daily Scrum');
  });

  it('active スプリントの id / ゴール + velocity 実績平均を文脈に含める', () => {
    const ctx = buildAgentContext(ctxInput({
      sprints: [
        sp({ id: 's1', status: 'active', number: 5, goal: 'G', name: 'Sprint5' }),
        sp({ id: 's0', status: 'completed', number: 4, velocity: 10 }),
      ],
    }));
    expect(ctx).toContain('id=s1');
    expect(ctx).toContain('G');
    expect(ctx).toContain('velocity 実績');
    expect(ctx).toContain('= 10'); // 完了スプリントの velocity 平均 (画面 PLANNED/VELOCITY の分母)
  });

  it('active + planned の両方を含める', () => {
    const ctx = buildAgentContext(ctxInput({
      sprints: [sp({ id: 's1', status: 'active' }), sp({ id: 's2', status: 'planned', number: 6 })],
    }));
    expect(ctx).toContain('id=s1');
    expect(ctx).toContain('id=s2');
  });

  it('velocity 実績なし / ゴール未設定はフォールバック表記', () => {
    const ctx = buildAgentContext(ctxInput({ sprints: [sp({ id: 's1', status: 'active' })] }));
    expect(ctx).toContain('(実績なし)');
    expect(ctx).toContain('(未設定)');
  });

  it('選択中チケットを id・title・status・SP で含める', () => {
    const ctx = buildAgentContext(ctxInput({
      tickets: [tk({ id: 'WC-1', title: '決済フォーム', status: 'in-progress', estimatePt: 3 })],
      selectedTicketId: 'WC-1',
    }));
    expect(ctx).toContain('選択中チケット: WC-1');
    expect(ctx).toContain('決済フォーム');
    expect(ctx).toContain('SP=3');
  });

  it('表示中チケットを一覧化し、上限 20 件で丸める', () => {
    const many = Array.from({ length: 25 }, (_, i) => tk({ id: `WC-${i}`, title: `t${i}` }));
    const ctx = buildAgentContext(ctxInput({ tickets: many }));
    expect(ctx).toContain('表示中のチケット (20/25 件)');
    expect(ctx).toContain('WC-19:');
    expect(ctx).not.toContain('WC-20:'); // 21 件目以降は載せない
  });

  // F-24/F-36 (2026-07-08): 20 件上限で切られたチケットを AI が「存在しない」と断定していた。
  // 上限超過時は「一覧は一部」であることと ticket.get での存在確認を context に明記する。
  it('20 件超のとき「一覧は一部 / ticket.get で確認」の注意書きを付ける (F-24)', () => {
    const many = Array.from({ length: 25 }, (_, i) => tk({ id: `WC-${i}`, title: `t${i}` }));
    const ctx = buildAgentContext(ctxInput({ tickets: many }));
    expect(ctx).toContain('一覧は一部');
    expect(ctx).toContain('ticket.get');
  });

  it('20 件以下なら注意書きは付けない', () => {
    const few = Array.from({ length: 3 }, (_, i) => tk({ id: `WC-${i}`, title: `t${i}` }));
    const ctx = buildAgentContext(ctxInput({ tickets: few }));
    expect(ctx).not.toContain('一覧は一部');
  });

  it('選択中チケットが 21 件目以降でも「選択中チケット」行に必ず載る (F-36)', () => {
    const many = Array.from({ length: 25 }, (_, i) => tk({ id: `WC-${i}`, title: `t${i}` }));
    const ctx = buildAgentContext(ctxInput({ tickets: many, selectedTicketId: 'WC-24' }));
    expect(ctx).toContain('選択中チケット: WC-24');
  });
});
