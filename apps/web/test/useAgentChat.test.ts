// useAgentChat の ④ feature flag 送信先解決 (resolveAgentName) の直接 unit テスト (2026-06-19)。
//
// AI パネルの送信先が flag (useOrchestratorWindow) で切り替わる配線を純粋関数で固定する:
// - OFF (既定): 画面に対応する儀式 agent (backlog/refinement→refinement, planning→planner 等)。
// - ON: 画面に依らず Orchestrator (単一窓口=協議統括) に集約。
// ※ Nuxt の useRuntimeConfig を mock すると router plugin が壊れるため、ロジックを純粋関数に切り出して直接踏む。

import { describe, it, expect } from 'vitest';
import type { ScreenId } from '~/composables/useUiMeta';
import type { Sprint } from '@belvedere/shared';
import { resolveAgentName, buildAgentContext } from '~/composables/useAgentChat';

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

const sp = (over: Partial<Sprint> & { id: string; status: Sprint['status'] }): Sprint => ({
  workspaceId: 'ws', number: 1, startsAt: '', endsAt: '', goal: '', capacity: 0, ...over,
});

describe('buildAgentContext (WC-39/29 — スプリント文脈の自動付与)', () => {
  it('active スプリントの id / ゴール + velocity 実績平均を文脈に含める', () => {
    const ctx = buildAgentContext([
      sp({ id: 's1', status: 'active', number: 5, goal: 'G', name: 'Sprint5' }),
      sp({ id: 's0', status: 'completed', number: 4, velocity: 10 }),
    ]);
    expect(ctx).toContain('id=s1');
    expect(ctx).toContain('G');
    expect(ctx).toContain('velocity 実績');
    expect(ctx).toContain('= 10'); // 完了スプリントの velocity 平均 (画面 PLANNED/VELOCITY の分母)
  });

  it('active + planned の両方を含める', () => {
    const ctx = buildAgentContext([
      sp({ id: 's1', status: 'active' }),
      sp({ id: 's2', status: 'planned', number: 6 }),
    ]);
    expect(ctx).toContain('id=s1');
    expect(ctx).toContain('id=s2');
  });

  it('velocity 実績なし / ゴール未設定はフォールバック表記', () => {
    const ctx = buildAgentContext([sp({ id: 's1', status: 'active' })]);
    expect(ctx).toContain('(実績なし)');
    expect(ctx).toContain('(未設定)');
  });

  it('該当スプリント (active/planned) が無ければ undefined を返す (payload に載せない)', () => {
    expect(buildAgentContext([])).toBeUndefined();
    expect(buildAgentContext([sp({ id: 'c', status: 'completed' })])).toBeUndefined();
  });
});
