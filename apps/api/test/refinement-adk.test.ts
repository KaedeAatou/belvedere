// Refinement-ADK 経路 + A2A failover の単体テスト (2026-06-25 / AI 観点 A6)。
// flag OFF/未設定で TS 経路 (null) / A2A 成功で AgentRun 合成 / A2A 失敗で TS へ fallback (null) を固定する。

import { describe, it, expect } from 'vitest';
import { tryRefinementViaAdk } from '../src/config/refinement-adk';
import type { A2AInvokeResult } from '@belvedere/tools';

const WS = 'ws-belvedere';
const NOW = '2026-06-25T09:00:00Z';

describe('tryRefinementViaAdk (flag ルート + A2A failover)', () => {
  it('flag OFF (enabled=false) は null (= TS 経路へ)', async () => {
    const run = await tryRefinementViaAdk('refine', WS, { enabled: false, peerUrl: 'https://orch' });
    expect(run).toBeNull();
  });

  it('peerUrl 未設定は null (= TS 経路へ)', async () => {
    const run = await tryRefinementViaAdk('refine', WS, { enabled: true, peerUrl: '' });
    expect(run).toBeNull();
  });

  it('A2A 成功 → AgentRun を合成して返す (status succeeded / output に応答 / via adk-a2a)', async () => {
    const invoke = async (): Promise<A2AInvokeResult> => ({ ok: true, text: '6観点で5件: WC-106 ほか' });
    const run = await tryRefinementViaAdk('refine', WS, { enabled: true, peerUrl: 'https://orch', invoke, now: NOW });
    expect(run).not.toBeNull();
    if (!run) return;
    expect(run.agentName).toBe('refinement');
    expect(run.status).toBe('succeeded');
    expect(run.workspaceId).toBe(WS);
    expect(run.inputContext.via).toBe('adk-a2a');
    expect(run.steps[0]?.type).toBe('output');
    expect(run.steps[0]?.content).toContain('WC-106');
    expect(run.outputArtifacts?.summary).toContain('6観点');
    expect(run.id).toMatch(/^AR-/);
  });

  it('A2A 失敗 (ok:false) → null で TS runAgent へ自動 fallback (退避路 / 本番 Refinement を止めない)', async () => {
    const invoke = async (): Promise<A2AInvokeResult> => ({ ok: false, text: '', error: 'ECONNREFUSED' });
    const run = await tryRefinementViaAdk('refine', WS, { enabled: true, peerUrl: 'https://orch', invoke, now: NOW });
    expect(run).toBeNull();
  });
});
