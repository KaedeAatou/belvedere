// evaluateSprintSmart handler の単体テスト (SMART 実評価 / WC-14)。
// memory backend (seed) + Mock LLM 経由で 5観点の契約と主要ヒューリスティック (goal 空 / 測定可能 /
// 過剰計画) を確認する。story-quality-handlers.test.ts と同じ流儀。
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { MockLLMProvider } from '@belvedere/llm';
import type { LLMProvider, LLMRequest } from '@belvedere/llm';
import type { Sprint } from '@belvedere/shared';
import { evaluateSprintSmart } from '../src/handlers/smart-eval-handlers';

const CTX = { workspaceId: 'ws-belvedere', user: { userId: 'u', email: 'u@example.com' }, role: 'admin' as const };

async function activeSprint(repo: RepoContainer): Promise<Sprint> {
  const sprints = await repo.sprints.list({ workspaceId: 'ws-belvedere' });
  const active = sprints.find((s) => s.status === 'active');
  if (!active) throw new Error('setup: seed に active sprint が無い');
  return active;
}

describe('evaluateSprintSmart (WC-14)', () => {
  let repo: RepoContainer;
  let llm: MockLLMProvider;
  beforeEach(() => {
    repo = createMemoryRepoContainer();
    llm = new MockLLMProvider();
  });

  it('常に S/M/A/R/T の 5 観点を返し、T は満たす', async () => {
    const res = await evaluateSprintSmart(repo, llm, CTX);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.criteria.map((c) => c.letter)).toEqual(['S', 'M', 'A', 'R', 'T']);
    expect(res.body.criteria.find((c) => c.letter === 'T')?.ok).toBe(true);
  });

  it('測定可能な指標を含むゴールは M=ok', async () => {
    const active = await activeSprint(repo);
    await repo.sprints.upsert({ ...active, goal: '決済完了率を95%に引き上げる' });
    const res = await evaluateSprintSmart(repo, llm, CTX);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.goal).toContain('95%');
    expect(res.body.criteria.find((c) => c.letter === 'M')?.ok).toBe(true);
  });

  it('指標の無い曖昧なゴールは M=weak (改善提案 note が付く)', async () => {
    const active = await activeSprint(repo);
    await repo.sprints.upsert({ ...active, goal: 'いい感じにする' });
    const res = await evaluateSprintSmart(repo, llm, CTX);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const m = res.body.criteria.find((c) => c.letter === 'M')!;
    expect(m.ok).toBe(false);
    expect(m.note.length).toBeGreaterThan(0);
  });

  it('ゴール未設定 (空) は S/M/R が weak', async () => {
    const active = await activeSprint(repo);
    await repo.sprints.upsert({ ...active, goal: '' });
    const res = await evaluateSprintSmart(repo, llm, CTX);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.goal).toBe('');
    for (const letter of ['S', 'M', 'R'] as const) {
      expect(res.body.criteria.find((c) => c.letter === letter)?.ok).toBe(false);
    }
  });

  it('計画 SP が velocity を超過すると A=weak (過剰計画)', async () => {
    // seed の velocity に依存しないよう、専用の空 workspace で active/completed/tickets を完全制御する。
    const WS = 'ws-smart-over';
    const ctx = { ...CTX, workspaceId: WS };
    const now = new Date().toISOString();
    await repo.sprints.upsert({ id: 'SP-active', workspaceId: WS, number: 1, startsAt: now, endsAt: now, goal: '決済MVPを完成させ完了率90%を達成する', capacity: 0, status: 'active' });
    await repo.sprints.upsert({ id: 'SP-past', workspaceId: WS, number: 0, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-14T00:00:00Z', goal: 'past', capacity: 0, velocity: 5, status: 'completed' });
    await repo.tickets.upsert({ id: 'WC-big1', workspaceId: WS, title: 'big', status: 'todo', priority: 'medium', sprintId: 'SP-active', estimatePt: 8, createdAt: now, updatedAt: now, createdBy: 'human' });
    const res = await evaluateSprintSmart(repo, llm, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.criteria.find((c) => c.letter === 'A')?.ok).toBe(false); // 8SP > velocity5
  });

  it('velocity 実績が無ければ A は判定保留で ok (過剰計画にしない)', async () => {
    const WS = 'ws-smart-novel';
    const ctx = { ...CTX, workspaceId: WS };
    const now = new Date().toISOString();
    await repo.sprints.upsert({ id: 'SP-a', workspaceId: WS, number: 1, startsAt: now, endsAt: now, goal: '決済MVPを完成させ完了率90%を達成する', capacity: 0, status: 'active' });
    await repo.tickets.upsert({ id: 'WC-b', workspaceId: WS, title: 'big', status: 'todo', priority: 'medium', sprintId: 'SP-a', estimatePt: 100, createdAt: now, updatedAt: now, createdBy: 'human' });
    const res = await evaluateSprintSmart(repo, llm, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.criteria.find((c) => c.letter === 'A')?.ok).toBe(true); // velocity 実績なし → 保留
  });

  // R=Relevant は Product Goal (Workspace.productGoal) 依存 (WC-23)。
  it('Product Goal + Sprint Goal が両方あると R=ok', async () => {
    const WS = 'ws-smart-r';
    const ctx = { ...CTX, workspaceId: WS };
    const now = new Date().toISOString();
    await repo.workspaces.upsert({ id: WS, name: 'R', slug: 'r', productGoal: '決済プラットフォームを本番リリース', ownerId: 'u', createdAt: now });
    await repo.sprints.upsert({ id: 'SP-r', workspaceId: WS, number: 1, startsAt: now, endsAt: now, goal: '決済完了率を95%にする', capacity: 0, status: 'active' });
    const res = await evaluateSprintSmart(repo, llm, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.criteria.find((c) => c.letter === 'R')?.ok).toBe(true);
  });

  // F-21 (2026-07-08): SMART 評価が同一入力で判定をブレさせた。原因は temperature 未指定
  // (Gemini デフォルト高温度)。agent ループ (0.2) より厳しく 0 に固定して決定化する。
  it('LLM 呼び出しは temperature=0 で行う (F-21 非決定性の根治)', async () => {
    const calls: LLMRequest[] = [];
    const spy: LLMProvider = {
      name: 'spy:mock',
      generate: async (r) => {
        calls.push(structuredClone(r));
        return llm.generate(r);
      },
    };
    const res = await evaluateSprintSmart(repo, spy, CTX);
    expect(res.ok).toBe(true);
    expect(calls[0]?.temperature).toBe(0);
  });

  // F-30 (2026-07-08): 画面が「+11 SP OVER」を表示している同じ状態で、LLM が A=Attainable を
  // 「velocity 内に収まっている」と ok 判定した。算術判定 (plannedSP vs velocity) は LLM に
  // 任せず handler が決定的に上書きする。
  it('LLM が A=ok と誤答しても plannedSP > velocity なら A=weak に上書きされる (F-30)', async () => {
    const WS = 'ws-smart-override';
    const ctx = { ...CTX, workspaceId: WS };
    const now = new Date().toISOString();
    await repo.sprints.upsert({ id: 'SP-o', workspaceId: WS, number: 1, startsAt: now, endsAt: now, goal: '決済完了率を95%にする', capacity: 0, status: 'active' });
    await repo.sprints.upsert({ id: 'SP-op', workspaceId: WS, number: 0, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-14T00:00:00Z', goal: 'past', capacity: 0, velocity: 5, status: 'completed' });
    await repo.tickets.upsert({ id: 'WC-o', workspaceId: WS, title: 'big', status: 'todo', priority: 'medium', sprintId: 'SP-o', estimatePt: 8, createdAt: now, updatedAt: now, createdBy: 'human' });
    // 全観点 ok=true (A も ok) を返す「誤答する LLM」。
    const wrong: LLMProvider = {
      name: 'wrong-llm',
      generate: async () => ({
        text: JSON.stringify({
          criteria: ['S', 'M', 'A', 'R', 'T'].map((letter) => ({ letter, name: letter, ok: true, note: 'looks fine' })),
        }),
        stop: { type: 'stop' as const },
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      }),
    };
    const res = await evaluateSprintSmart(repo, wrong, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = res.body.criteria.find((c) => c.letter === 'A')!;
    expect(a.ok).toBe(false); // 8SP > velocity5 → LLM が何と言おうと weak
    expect(a.note).toContain('超過');
  });

  it('Product Goal 未設定なら R=weak (Sprint Goal があっても)', async () => {
    const WS = 'ws-smart-nopg';
    const ctx = { ...CTX, workspaceId: WS };
    const now = new Date().toISOString();
    // workspace doc を作らない (= productGoal 空)。
    await repo.sprints.upsert({ id: 'SP-n', workspaceId: WS, number: 1, startsAt: now, endsAt: now, goal: '決済完了率を95%にする', capacity: 0, status: 'active' });
    const res = await evaluateSprintSmart(repo, llm, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.body.criteria.find((c) => c.letter === 'R')!;
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/Product Goal/);
  });
});
