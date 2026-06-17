// 診断系 純粋関数の直接 unit test (2026-06-17)。
//
// .claude/rules/testing.md §1: 複数層 (Agent Tool / HTTP API / MCP) で共有される純粋関数は、
// その関数自体を import した直接テストを必ず持つ。ハンドラ/API 経由の間接テストで満足しない。
// §1 退化入力必須: undefined / 欠落キー / 等値 / 端 (最小・最大・空) を含める。

import { describe, it, expect } from 'vitest';
import type { Ticket, Epic, Sprint, EstimationSession } from '@belvedere/shared';
import { checkTicketQuality } from '../src/quality';
import { checkBacklogRefinement } from '../src/refinement';

const NOW = '2026-06-17T09:00:00Z';

function ticket(over: Partial<Ticket> & { id: string }): Ticket {
  return {
    workspaceId: 'ws-belvedere',
    title: 't',
    status: 'todo',
    priority: 'medium',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    createdBy: 'human',
    ...over,
  };
}

function epic(over: Partial<Epic> & { id: string }): Epic {
  return {
    workspaceId: 'ws-belvedere',
    name: 'E',
    status: 'active',
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('checkTicketQuality (純粋関数 / 直接)', () => {
  it('全充足 (AC + SP + US 紐付け) → ok:true / issues 空 / qualityRate 1', () => {
    const r = checkTicketQuality(
      ticket({ id: 'WC-1', acceptanceCriteria: ['done when X'], estimatePt: 3, parentTicketId: 'US-101' }),
    );
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.qualityRate).toBe(1);
  });

  it('全欠落 (AC なし / SP undefined / parent なし) → 3 issues / ok:false', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-2' }));
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBe(3);
  });

  it('退化: acceptanceCriteria が空配列 → DoD issue が立つ', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-3', acceptanceCriteria: [], estimatePt: 1, parentTicketId: 'US-1' }));
    expect(r.issues.some((i) => i.includes('DoD'))).toBe(true);
  });

  it('退化: estimatePt = 0 は「未定」ではない (0 は有効な見積もり)', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-4', acceptanceCriteria: ['x'], estimatePt: 0, parentTicketId: 'US-1' }));
    expect(r.issues.some((i) => i.includes('Story Point'))).toBe(false);
  });

  it('退化: parentTicketId が US- 始まりでない → US 紐付け issue が立つ', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-5', acceptanceCriteria: ['x'], estimatePt: 2, parentTicketId: 'WC-99' }));
    expect(r.issues.some((i) => i.includes('User Story'))).toBe(true);
  });
});

describe('checkBacklogRefinement (純粋関数 / 直接)', () => {
  function input(over: { tickets?: Ticket[]; epics?: Epic[]; sprints?: Sprint[]; estimations?: EstimationSession[] }) {
    return {
      tickets: over.tickets ?? [],
      epics: over.epics ?? [],
      sprints: over.sprints ?? [],
      estimations: over.estimations ?? [],
      now: NOW,
    };
  }
  const sig = (r: ReturnType<typeof checkBacklogRefinement>, s: string, id?: string) =>
    r.findings.some((f) => f.signal === s && (!id || f.ticketId === id));

  it('退化: 空入力 → findings 0 / scanned 0 / ruleFindings 0', () => {
    const r = checkBacklogRefinement(input({}));
    expect(r.findingCount).toBe(0);
    expect(r.scanned).toBe(0);
    expect(r.scannedEpics).toBe(0);
    expect(r.ruleFindings).toEqual([]);
  });

  it('oversize_story: SP>8 で発火 / 端 SP=8 では発火しない', () => {
    const over = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', estimatePt: 13, valueImpact: 'high' })] }));
    expect(sig(over, 'oversize_story', 'WC-1')).toBe(true);
    const edge = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-2', estimatePt: 8, valueImpact: 'high' })] }));
    expect(sig(edge, 'oversize_story', 'WC-2')).toBe(false);
  });

  it('unstructured_dependency: blockedBy も US 親も無いと発火 / US 親があれば発火しない', () => {
    const bad = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', valueImpact: 'high' })] }));
    expect(sig(bad, 'unstructured_dependency', 'WC-1')).toBe(true);
    const good = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-2', valueImpact: 'high', parentTicketId: 'US-1' })] }),
    );
    expect(sig(good, 'unstructured_dependency', 'WC-2')).toBe(false);
  });

  it('value_impact_missing: valueImpact undefined で発火', () => {
    const r = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', parentTicketId: 'US-1' })] }));
    expect(sig(r, 'value_impact_missing', 'WC-1')).toBe(true);
  });

  it('priority↔valueImpact: urgent+low / low+high / medium+high(soft) を検出', () => {
    const r = checkBacklogRefinement(
      input({
        tickets: [
          ticket({ id: 'A', priority: 'urgent', valueImpact: 'low', parentTicketId: 'US-1' }),
          ticket({ id: 'B', priority: 'low', valueImpact: 'high', parentTicketId: 'US-1' }),
          ticket({ id: 'C', priority: 'medium', valueImpact: 'high', parentTicketId: 'US-1' }),
        ],
      }),
    );
    expect(sig(r, 'priority_value_mismatch', 'A')).toBe(true);
    expect(sig(r, 'priority_value_mismatch', 'B')).toBe(true);
    expect(sig(r, 'priority_value_mismatch_soft', 'C')).toBe(true);
  });

  it('strategic_intent_missing: Epic.rationale 空で発火 / 埋まっていれば発火しない', () => {
    const r = checkBacklogRefinement(
      input({ epics: [epic({ id: 'EP-3', rationale: '   ' }), epic({ id: 'EP-1', rationale: 'なぜ重要か' })] }),
    );
    expect(sig(r, 'strategic_intent_missing', 'EP-3')).toBe(true);
    expect(sig(r, 'strategic_intent_missing', 'EP-1')).toBe(false);
  });

  it('filter.sprintId: 候補 6観点は scope 内のみ / ruleFindings は全 ticket 対象', () => {
    const r = checkBacklogRefinement(
      input({
        tickets: [
          ticket({ id: 'IN', sprintId: 'sprint-14', estimatePt: 13, valueImpact: 'high' }), // oversize
          ticket({ id: 'OUT', sprintId: 'sprint-13', estimatePt: 13, valueImpact: 'high' }), // scope 外
        ],
      }),
      { sprintId: 'sprint-14' },
    );
    expect(r.scanned).toBe(1);
    expect(sig(r, 'oversize_story', 'IN')).toBe(true);
    expect(sig(r, 'oversize_story', 'OUT')).toBe(false); // 6観点は filter 内のみ
  });

  it('filter.projectId: Epic も projectId で絞られる', () => {
    const r = checkBacklogRefinement(
      input({
        epics: [
          epic({ id: 'EP-A', projectId: 'PRJ-x', rationale: '' }),
          epic({ id: 'EP-B', projectId: 'PRJ-y', rationale: '' }),
        ],
      }),
      { projectId: 'PRJ-x' },
    );
    expect(r.scannedEpics).toBe(1);
    expect(sig(r, 'strategic_intent_missing', 'EP-A')).toBe(true);
    expect(sig(r, 'strategic_intent_missing', 'EP-B')).toBe(false);
  });
});
