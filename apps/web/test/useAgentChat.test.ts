// useAgentChat の ④ feature flag 送信先解決 (resolveAgentName) の直接 unit テスト (2026-06-19)。
//
// AI パネルの送信先が flag (useOrchestratorWindow) で切り替わる配線を純粋関数で固定する:
// - OFF (既定): 画面に対応する儀式 agent (backlog/refinement→refinement, planning→planner 等)。
// - ON: 画面に依らず Orchestrator (単一窓口=協議統括) に集約。
// ※ Nuxt の useRuntimeConfig を mock すると router plugin が壊れるため、ロジックを純粋関数に切り出して直接踏む。

import { describe, it, expect } from 'vitest';
import type { ScreenId } from '~/composables/useUiMeta';
import { resolveAgentName } from '~/composables/useAgentChat';

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
