// 診断系 純粋関数の直接 unit test (2026-06-17)。
//
// .claude/rules/testing.md §1: 複数層 (Agent Tool / HTTP API / MCP) で共有される純粋関数は、
// その関数自体を import した直接テストを必ず持つ。ハンドラ/API 経由の間接テストで満足しない。
// §1 退化入力必須: undefined / 欠落キー / 等値 / 端 (最小・最大・空) を含める。

import { describe, it, expect } from 'vitest';
import type { Ticket, Epic, Sprint, EstimationSession } from '@belvedere/shared';
import { checkTicketQuality } from '../src/quality';
import {
  checkBacklogRefinement,
  detectOversizeStory,
  detectUnstructuredDependency,
  detectValueImpactMissing,
  detectPriorityValueMismatch,
  detectSpVariance,
  detectStrategicIntentMissing,
} from '../src/refinement';

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

  // F-07/F-11 (2026-07-08): 親紐付けの基準は種別で異なる。旧実装は全種別に parentTicketId の
  // US- 前方一致を求め、全 story を「User Story 紐付けなし」と誤指摘していた (ドッグフード F-07 の真因)。
  it('非 story は親 (parentTicketId) が WC- 形式でも親紐付け issue は立たない (F-07)', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-5', type: 'task', acceptanceCriteria: ['x'], estimatePt: 2, parentTicketId: 'WC-99' }));
    expect(r.issues.some((i) => i.includes('紐付け'))).toBe(false);
  });
  it('非 story で親が全く無い → 「親 Story 紐付けなし」issue が立つ', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-6', type: 'task', acceptanceCriteria: ['x'], estimatePt: 2 }));
    expect(r.issues.some((i) => i.includes('親 Story 紐付けなし'))).toBe(true);
  });
  it('story は epicId が有れば親紐付け issue なし / 「User Story」issue は決して出ない (F-07 category confusion)', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-7', type: 'story', acceptanceCriteria: ['x'], estimatePt: 2, epicId: 'EP-1' }));
    expect(r.issues.some((i) => i.includes('紐付け'))).toBe(false);
    expect(r.issues.some((i) => i.includes('User Story'))).toBe(false);
  });
  it('story は epicId が無ければ「親 Epic 紐付けなし」(「User Story 紐付けなし」ではない / F-07)', () => {
    const r = checkTicketQuality(ticket({ id: 'WC-8', type: 'story', acceptanceCriteria: ['x'], estimatePt: 2 }));
    expect(r.issues.some((i) => i.includes('親 Epic 紐付けなし'))).toBe(true);
    expect(r.issues.some((i) => i.includes('User Story'))).toBe(false);
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

  // F-35: 完了済 (done) チケットは 6 観点診断の対象外 (scanned にも数えない・ruleFindings にも出さない)。
  it('done チケットは診断対象外: 6 観点・scanned・ruleFindings のいずれにも出ない (F-35)', () => {
    const doneStory = ticket({ id: 'WC-1', type: 'story', status: 'done', estimatePt: 13 }); // 未完了なら oversize + valueImpact 等が立つ
    const r = checkBacklogRefinement(input({ tickets: [doneStory] }));
    expect(r.scanned).toBe(0);
    expect(sig(r, 'oversize_story', 'WC-1')).toBe(false);
    expect(r.ruleFindings.some((f) => f.ticketId === 'WC-1')).toBe(false);
    // 対照: 同じチケットが todo なら 6 観点が発火する (除外は done 限定である証拠)
    const active = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', type: 'story', status: 'todo', estimatePt: 13 })] }));
    expect(sig(active, 'oversize_story', 'WC-1')).toBe(true);
  });

  it('unstructured_dependency: task は親 (parentTicketId) 無しで発火 / 親ありで発火しない', () => {
    const bad = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', type: 'task', valueImpact: 'high' })] }));
    expect(sig(bad, 'unstructured_dependency', 'WC-1')).toBe(true);
    const good = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-2', type: 'task', valueImpact: 'high', parentTicketId: 'US-1' })] }),
    );
    expect(sig(good, 'unstructured_dependency', 'WC-2')).toBe(false);
  });

  // 2026-07-09: bug / incident / spike は top-level PBI で親 Story を持たないため観点2 の対象外
  // (以前は親 Story 欠落で誤発火していた)。story / task だけを対象にする。
  it('unstructured_dependency: bug / incident / spike は親無しでも発火しない (top-level PBI)', () => {
    for (const type of ['bug', 'incident', 'spike'] as const) {
      const res = checkBacklogRefinement(input({ tickets: [ticket({ id: 'WC-1', type, valueImpact: 'high' })] }));
      expect(sig(res, 'unstructured_dependency', 'WC-1'), `${type} で誤発火`).toBe(false);
    }
  });

  // F-11 (2026-07-08 Sprint 6 で (source: refinement) 付き再発): 観点2 が Story にも
  // parentTicketId (US-) 欠落を警告し、「Story を別の User Story に紐付けよ」という
  // category confusion を起こしていた。Story は epicId (親 Epic) で紐付くのが正しい。
  it('unstructured_dependency: story は epicId があれば発火しない (F-11 category confusion 修正)', () => {
    const good = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-1', type: 'story', valueImpact: 'high', epicId: 'EP-1' })] }),
    );
    expect(sig(good, 'unstructured_dependency', 'WC-1')).toBe(false);
  });
  it('unstructured_dependency: story で epicId も blockedBy も無ければ発火 (Epic 紐付けを促す)', () => {
    const bad = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-1', type: 'story', valueImpact: 'high' })] }),
    );
    expect(sig(bad, 'unstructured_dependency', 'WC-1')).toBe(true);
  });
  it('unstructured_dependency: story は parentTicketId (別 story) があっても epicId 無しなら発火', () => {
    const bad = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-1', type: 'story', valueImpact: 'high', parentTicketId: 'US-1' })] }),
    );
    expect(sig(bad, 'unstructured_dependency', 'WC-1')).toBe(true);
  });
  it('unstructured_dependency: task は親 (parentTicketId) があれば発火しない', () => {
    const good = checkBacklogRefinement(
      input({ tickets: [ticket({ id: 'WC-1', type: 'task', valueImpact: 'high', parentTicketId: 'WC-9' })] }),
    );
    expect(sig(good, 'unstructured_dependency', 'WC-1')).toBe(false);
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

  // R2-F: 出力順は外部契約 (API/MCP/Mock 応答) なので、観点を detect* に分離しても不変であることを固定。
  it('出力順不変: 1 ticket が複数観点に該当 → ticket グループ化で [oversize, unstructured, value_impact] の順', () => {
    const r = checkBacklogRefinement(
      // story (親 Epic 無し) にして観点2 を含む複数観点を踏む: SP>8 + 親 Epic 無 + valueImpact 無。
      input({ tickets: [ticket({ id: 'WC-1', type: 'story', estimatePt: 13 })] }),
    );
    expect(r.findings.map((f) => f.signal)).toEqual([
      'oversize_story',
      'unstructured_dependency',
      'value_impact_missing',
    ]);
  });

  it('出力順不変: 2 ticket + SP分散 + Epic → ticket ごと → sp_variance → strategic_intent の順', () => {
    const r = checkBacklogRefinement(
      input({
        tickets: [
          // valueImpact='medium' + priority=medium で priority↔value ミスマッチを出さず観点を絞る。
          ticket({ id: 'A', estimatePt: 1, parentTicketId: 'US-1', valueImpact: 'medium' }),
          ticket({ id: 'B', estimatePt: 13, parentTicketId: 'US-1', valueImpact: 'medium' }),
          ticket({ id: 'C', estimatePt: 21, parentTicketId: 'US-1', valueImpact: 'medium' }),
        ],
        epics: [epic({ id: 'EP-3', rationale: '' })],
      }),
    );
    // A は無発火、B/C は oversize、集合で sp_variance、最後に Epic の strategic_intent。
    expect(r.findings.map((f) => f.signal)).toEqual([
      'oversize_story', // B
      'oversize_story', // C
      'sp_variance_high',
      'strategic_intent_missing',
    ]);
  });
});

// 観点ごとの detect* 純粋関数の直接テスト (testing.md §1 / R2-F)。
// checkBacklogRefinement 経由でなく関数自体を import し、退化入力 (端 SP=8/9・等値・空集合・空白 rationale)
// を最安レイヤで固定する。
describe('refinement 観点ごとの detect* (直接 / 退化入力)', () => {
  const tk = (over: Partial<Ticket> & { id: string }): Ticket => ticket(over);
  const ep = (over: Partial<Epic> & { id: string }): Epic => epic(over);

  it('detectOversizeStory: 端 SP=8→空 / SP=9→発火 / SP undefined→空 / SP=0→空', () => {
    expect(detectOversizeStory(tk({ id: 'A', estimatePt: 8 }))).toEqual([]);
    expect(detectOversizeStory(tk({ id: 'A', estimatePt: 9 }))).toHaveLength(1);
    expect(detectOversizeStory(tk({ id: 'A' }))).toEqual([]);
    expect(detectOversizeStory(tk({ id: 'A', estimatePt: 0 }))).toEqual([]);
  });

  it('detectUnstructuredDependency: task は親紐付けの有無のみで判定 (blockedBy は 2026-07-09 で無関係化)', () => {
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'task' }))).toHaveLength(1); // 親なし → 発火
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'task', parentTicketId: 'US-1' }))).toEqual([]); // 親あり → 空
    // blockedBy はもう判定に影響しない: 親が無ければ blockedBy があっても発火する
    // (blockedBy を直す UI が無いため「依存を整理せよ」を示唆から外した)。
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'task', blockedBy: ['WC-9'] }))).toHaveLength(1);
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'task', parentTicketId: 'US-1', blockedBy: ['WC-9'] }))).toEqual([]);
  });

  it('detectUnstructuredDependency: bug / incident / spike は対象外で常に空 (top-level PBI)', () => {
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'bug' }))).toEqual([]);
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'incident' }))).toEqual([]);
    expect(detectUnstructuredDependency(tk({ id: 'A', type: 'spike' }))).toEqual([]);
  });

  it('detectValueImpactMissing: undefined→発火 / 設定済→空 (low/medium/high いずれも)', () => {
    expect(detectValueImpactMissing(tk({ id: 'A' }))).toHaveLength(1);
    expect(detectValueImpactMissing(tk({ id: 'A', valueImpact: 'low' }))).toEqual([]);
    expect(detectValueImpactMissing(tk({ id: 'A', valueImpact: 'high' }))).toEqual([]);
  });

  it('detectPriorityValueMismatch: 排他 (urgent+low / low+high / medium+high) 0/1 件 / 非該当→空', () => {
    expect(detectPriorityValueMismatch(tk({ id: 'A', priority: 'urgent', valueImpact: 'low' }))[0]?.signal).toBe('priority_value_mismatch');
    expect(detectPriorityValueMismatch(tk({ id: 'A', priority: 'low', valueImpact: 'high' }))[0]?.signal).toBe('priority_value_mismatch');
    expect(detectPriorityValueMismatch(tk({ id: 'A', priority: 'medium', valueImpact: 'high' }))[0]?.signal).toBe('priority_value_mismatch_soft');
    // 非該当: 整合している組み合わせは空
    expect(detectPriorityValueMismatch(tk({ id: 'A', priority: 'urgent', valueImpact: 'high' }))).toEqual([]);
    expect(detectPriorityValueMismatch(tk({ id: 'A', priority: 'high', valueImpact: 'high' }))).toEqual([]);
  });

  it('detectSpVariance: <3 件→空 / SP>0 が 3 件未満→空 (判定不能) / 等値 3 件→空 / 大分散→発火', () => {
    // 退化: チケット 3 件だが SP>0 が 2 件 → 判定不能で空
    expect(detectSpVariance([tk({ id: 'A', estimatePt: 5 }), tk({ id: 'B', estimatePt: 8 }), tk({ id: 'C' })])).toEqual([]);
    // 等値 (CV=0) → 発火しない
    expect(detectSpVariance([tk({ id: 'A', estimatePt: 5 }), tk({ id: 'B', estimatePt: 5 }), tk({ id: 'C', estimatePt: 5 })])).toEqual([]);
    // 大きな分散 (1, 8, 21) → CV>0.6 で発火
    expect(detectSpVariance([tk({ id: 'A', estimatePt: 1 }), tk({ id: 'B', estimatePt: 8 }), tk({ id: 'C', estimatePt: 21 })])).toHaveLength(1);
    // 2 件のみ → 空
    expect(detectSpVariance([tk({ id: 'A', estimatePt: 1 }), tk({ id: 'B', estimatePt: 13 })])).toEqual([]);
  });

  it('detectStrategicIntentMissing: 空/空白/undefined rationale→発火 / 埋まっていれば空', () => {
    expect(detectStrategicIntentMissing(ep({ id: 'EP-1', rationale: '' }))).toHaveLength(1);
    expect(detectStrategicIntentMissing(ep({ id: 'EP-1', rationale: '   ' }))).toHaveLength(1);
    expect(detectStrategicIntentMissing(ep({ id: 'EP-1' }))).toHaveLength(1); // undefined
    expect(detectStrategicIntentMissing(ep({ id: 'EP-1', rationale: 'なぜ重要か' }))).toEqual([]);
  });
});
