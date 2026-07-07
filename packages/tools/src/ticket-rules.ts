// チケットルールエンジン (T3 / 2026-06-11)。
// docs/design-ticket-types.md §3 / references/agile-knowledge-base/ticket-types.md の
// 監査マトリクスを「宣言的ルール表」として 1 ファイルに集約。
// Refinement / Planner / Daily の Agent ツール + UI バッジ + Phase2 AI Integrity Panel が
// この同じ表を儀式でフィルタして使う (3 consumer が単一 source を共有)。
//
// 設計方針:
// - 判定は機械的 (Gemini 不要)。意味理解が要るもの (DoD 充足/頻発パターン) は Phase 3-A の別実装。
// - now は呼出側が注入 (Date.now() を直接呼ばない → テスト容易性)。
// - startedAt が無い場合は updatedAt で代替し message 末尾に「(推定)」を付ける。
// - 既存 backlogRefinementCheckTool の 6 観点には手を付けず、本レジストリは additive に合成する。

import type {
  Ticket,
  Sprint,
  TicketType,
  Ritual,
  EstimationSession,
} from '@belvedere/shared';
import { FIBONACCI_POINTS } from '@belvedere/shared';

export interface TicketFinding {
  ruleId: string;
  ticketId: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  action?: { kind: 'open-estimation' | 'edit-ticket' | 'create-bug' | 'link-parent'; label: string };
}

export interface RuleContext {
  now: string; // ISO8601、呼出側が注入
  tickets: Ticket[];
  ticketsById: Map<string, Ticket>;
  sprints: Sprint[];
  estimationSessions: EstimationSession[];
}

export interface TicketRule {
  id: string;
  appliesTo: TicketType[] | 'all' | 'aggregate';
  ceremonies: Ritual[];
  check(t: Ticket | null, ctx: RuleContext): TicketFinding[];
}

// ========== ヘルパ ==========

function hoursSince(iso: string, now: string): number {
  return (Date.parse(now) - Date.parse(iso)) / 3_600_000;
}
function daysSince(iso: string, now: string): number {
  return hoursSince(iso, now) / 24;
}
function fibIndex(v: number): number {
  return (FIBONACCI_POINTS as readonly number[]).indexOf(v);
}
/** startedAt があればそれ、無ければ updatedAt + 推定フラグ */
function sinceAnchor(t: Ticket): { iso: string; estimated: boolean } {
  return t.startedAt ? { iso: t.startedAt, estimated: false } : { iso: t.updatedAt, estimated: true };
}
function suffix(estimated: boolean): string {
  return estimated ? ' (推定)' : '';
}

const PROCEDURAL = /(実装|設計|対応|作成|修正|追加|変更|テスト|リリース)(する|します)?$/;
const DECISION = /(判断|結論|比較|わかる|分かる|明らか|決定|選定)/;
const REGRESSION = /(回帰|リグレッション|テスト追加|自動テスト)/;
const REPRO = /(再現|手順|steps)/i;
const SPIKE_TITLE = /(調査|検証|比較|スパイク)/;

// ========== ルール表 (docs/design-ticket-types.md §3-2 の正) ==========

export const ticketRules: TicketRule[] = [
  {
    id: 'TYPE_MISSING',
    appliesTo: 'all',
    ceremonies: ['refinement'],
    check: (t) =>
      t && !t.type
        ? [{ ruleId: 'TYPE_MISSING', ticketId: t.id, severity: 'warn', message: 'チケット種別 (type) が未設定です。story / task / spike / bug / incident のどれかを設定してください。', action: { kind: 'edit-ticket', label: '種別を設定' } }]
        : [],
  },
  {
    id: 'TASK_NO_PARENT',
    appliesTo: ['task'],
    ceremonies: ['refinement', 'planning'],
    check: (t, ctx) => {
      if (!t) return [];
      const parent = t.parentTicketId;
      const linked = !!parent && (parent.startsWith('US-') || ctx.ticketsById.get(parent)?.type === 'story');
      return linked
        ? []
        : [{ ruleId: 'TASK_NO_PARENT', ticketId: t.id, severity: 'error', message: 'Task に親 Story がありません。何の価値のための作業か追えません。親 Story を紐付けてください。', action: { kind: 'link-parent', label: '親 Story を選ぶ' } }];
    },
  },
  {
    id: 'TASK_STALL',
    appliesTo: ['task'],
    ceremonies: ['daily'],
    check: (t, ctx) => {
      if (!t || t.status !== 'in-progress') return [];
      const a = sinceAnchor(t);
      return daysSince(a.iso, ctx.now) >= 2
        ? [{ ruleId: 'TASK_STALL', ticketId: t.id, severity: 'warn', message: `Task が 2 日以上 進行中のままです (想定 1 日以内)。ブロッカーを確認してください${suffix(a.estimated)}。` }]
        : [];
    },
  },
  {
    id: 'STORY_DOD_MISSING',
    appliesTo: ['story'],
    ceremonies: ['planning', 'refinement'],
    check: (t) =>
      t && (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0)
        ? [{ ruleId: 'STORY_DOD_MISSING', ticketId: t.id, severity: 'error', message: 'Story に DoD (acceptanceCriteria) がありません。完了の判定基準を定義してください。', action: { kind: 'edit-ticket', label: 'DoD を追加' } }]
        : [],
  },
  {
    id: 'STORY_DOD_PROCEDURAL',
    appliesTo: ['story'],
    ceremonies: ['refinement'],
    check: (t) => {
      if (!t || !t.acceptanceCriteria || t.acceptanceCriteria.length === 0) return [];
      const allProcedural = t.acceptanceCriteria.every((l) => PROCEDURAL.test(l.trim()));
      return allProcedural
        ? [{ ruleId: 'STORY_DOD_PROCEDURAL', ticketId: t.id, severity: 'warn', message: 'DoD が手続き的です (「実装する」等の手段のみ)。「誰に何の価値が出れば完了か」を書いてください。', action: { kind: 'edit-ticket', label: 'DoD を価値ベースに' } }]
        : [];
    },
  },
  {
    id: 'STORY_SP_MISSING',
    appliesTo: ['story'],
    ceremonies: ['refinement'],
    check: (t) =>
      t && t.estimatePt == null
        ? [{ ruleId: 'STORY_SP_MISSING', ticketId: t.id, severity: 'warn', message: 'Story に Story Point がありません。見積もりポーカーで決めてください。', action: { kind: 'open-estimation', label: '見積もりセッションを開始' } }]
        : [],
  },
  {
    id: 'STORY_STALL',
    appliesTo: ['story'],
    ceremonies: ['daily'],
    check: (t, ctx) => {
      if (!t || t.status !== 'in-progress') return [];
      const a = sinceAnchor(t);
      return daysSince(a.iso, ctx.now) >= 3
        ? [{ ruleId: 'STORY_STALL', ticketId: t.id, severity: 'warn', message: `Story が 3 日以上 進行中のままで停滞しています。ブロッカーの有無を確認してください${suffix(a.estimated)}。` }]
        : [];
    },
  },
  {
    id: 'SPIKE_NO_TIMEBOX',
    appliesTo: ['spike'],
    ceremonies: ['planning', 'refinement'],
    check: (t) =>
      t && t.timeboxHours == null
        ? [{ ruleId: 'SPIKE_NO_TIMEBOX', ticketId: t.id, severity: 'warn', message: 'Spike にタイムボックス (timeboxHours) が設定されていません。打ち切り時間を決めてください。', action: { kind: 'edit-ticket', label: 'タイムボックスを設定' } }]
        : [],
  },
  {
    id: 'SPIKE_TIMEBOX_OVER',
    appliesTo: ['spike'],
    ceremonies: ['daily'],
    check: (t, ctx) => {
      if (!t || t.status !== 'in-progress' || t.timeboxHours == null) return [];
      const a = sinceAnchor(t);
      return hoursSince(a.iso, ctx.now) > t.timeboxHours
        ? [{ ruleId: 'SPIKE_TIMEBOX_OVER', ticketId: t.id, severity: 'error', message: `Spike がタイムボックス (${t.timeboxHours}h) を超過しています。結論を出すか打ち切ってください${suffix(a.estimated)}。` }]
        : [];
    },
  },
  {
    id: 'SPIKE_DOD_NOT_DECISION',
    appliesTo: ['spike'],
    ceremonies: ['refinement'],
    check: (t) => {
      if (!t || !t.acceptanceCriteria || t.acceptanceCriteria.length === 0) return [];
      const hasDecision = t.acceptanceCriteria.some((l) => DECISION.test(l));
      return hasDecision
        ? []
        : [{ ruleId: 'SPIKE_DOD_NOT_DECISION', ticketId: t.id, severity: 'warn', message: 'Spike の DoD が「判断材料が揃った/結論が出た」になっていません。成果物 (判断・結論) で完了を定義してください。', action: { kind: 'edit-ticket', label: 'DoD を結論ベースに' } }];
    },
  },
  {
    id: 'BUG_NO_REPRO',
    appliesTo: ['bug'],
    ceremonies: ['refinement'],
    // 専用欄 reproSteps を優先 (WC-2dba4170)。後方互換で description の再現手順記述もフォールバックで許容。
    check: (t) =>
      t && !t.reproSteps?.trim() && !REPRO.test(t.description ?? '')
        ? [{ ruleId: 'BUG_NO_REPRO', ticketId: t.id, severity: 'error', message: 'Bug に再現手順がありません。詳細パネルの「再現手順」欄に 再現手順 + 期待 vs 実動作 + 影響範囲 を記入してください。', action: { kind: 'edit-ticket', label: '再現手順を追加' } }]
        : [],
  },
  {
    id: 'BUG_NO_REGRESSION_DOD',
    appliesTo: ['bug'],
    ceremonies: ['refinement', 'review'],
    check: (t) => {
      if (!t) return [];
      // 専用欄 regressionNote を優先 (WC-2dba4170)。後方互換で DoD(AC)の回帰テスト記述もフォールバック。
      if (t.regressionNote?.trim()) return [];
      const ac = t.acceptanceCriteria ?? [];
      const hasRegression = ac.some((l) => REGRESSION.test(l));
      return hasRegression
        ? []
        : [{ ruleId: 'BUG_NO_REGRESSION_DOD', ticketId: t.id, severity: 'warn', message: 'Bug の回帰テストが未記入です。詳細パネルの「回帰テスト」欄に再発防止の自動テスト方針を記入してください。', action: { kind: 'edit-ticket', label: '回帰テストを記入' } }];
    },
  },
  {
    id: 'INCIDENT_ACTIVE',
    appliesTo: ['incident'],
    ceremonies: ['daily'],
    // F-22 (2026-07-08): 旧実装は status !== 'done' で発火し、記録目的の未着手 incident
    // (backlog/todo) まで毎 Daily「進行中の障害」と誤検出していた。「進行中」の文言どおり
    // in-progress のみ発火させる (他の停滞系ルール TASK_STALL 等と同じ status 条件に整合)。
    check: (t) =>
      t && t.status === 'in-progress'
        ? [{ ruleId: 'INCIDENT_ACTIVE', ticketId: t.id, severity: 'error', message: '進行中のインシデントです。復旧見通しを共有し、優先対応してください。' }]
        : [],
  },
  {
    id: 'INCIDENT_NO_FOLLOWUP_BUG',
    appliesTo: ['incident'],
    ceremonies: ['refinement'],
    check: (t, ctx) => {
      if (!t || t.status !== 'done') return [];
      const hasFollowup = ctx.tickets.some((b) => b.type === 'bug' && b.relatedIncidentId === t.id);
      return hasFollowup
        ? []
        : [{ ruleId: 'INCIDENT_NO_FOLLOWUP_BUG', ticketId: t.id, severity: 'warn', message: '復旧済インシデントですが、根本対応の Bug が起票されていません。再発防止策を Bug として PBI 化してください。', action: { kind: 'create-bug', label: '根本対応 Bug を起票' } }];
    },
  },
  {
    id: 'MISMATCH_SPIKE_TITLE',
    appliesTo: ['story', 'task'],
    ceremonies: ['refinement'],
    check: (t) =>
      t && SPIKE_TITLE.test(t.title) && t.type !== 'spike'
        ? [{ ruleId: 'MISMATCH_SPIKE_TITLE', ticketId: t.id, severity: 'info', message: 'タイトルが調査・検証を示唆していますが種別が spike ではありません。Spike にすべきか確認してください。', action: { kind: 'edit-ticket', label: 'spike に変更' } }]
        : [],
  },
  {
    id: 'SPRINT_OVER_VELOCITY',
    appliesTo: 'aggregate',
    ceremonies: ['planning'],
    check: (_t, ctx) => {
      const active = ctx.sprints.find((s) => s.status === 'active');
      if (!active) return [];
      // 相対見積もり (SP) の積み上げを過去スプリントの velocity 実績と比較する。
      // 時間稼働ベースの capacity は使わない。velocity 実績がなければ判定不能 (skip)。
      const completed = ctx.sprints.filter((s) => s.status === 'completed' && s.velocity !== undefined);
      if (completed.length === 0) return [];
      const avgVelocity = Math.round(completed.reduce((acc, s) => acc + (s.velocity ?? 0), 0) / completed.length);
      const sum = ctx.tickets
        .filter((t) => t.sprintId === active.id)
        .reduce((acc, t) => acc + (t.estimatePt ?? 0), 0);
      return sum > avgVelocity
        ? [{ ruleId: 'SPRINT_OVER_VELOCITY', ticketId: active.id, severity: 'error', message: `計画が velocity 実績を超過: ${sum} / ${avgVelocity} SP。低 valueImpact の Story を次スプリントに回すか Sprint Goal を絞ってください。` }]
        : [];
    },
  },
  {
    id: 'ESTIMATE_DIVERGENCE',
    appliesTo: 'aggregate',
    ceremonies: ['refinement'],
    check: (_t, ctx) => {
      const out: TicketFinding[] = [];
      for (const s of ctx.estimationSessions) {
        if (s.status !== 'revealed') continue;
        const nums = s.votes
          .map((v) => v.value)
          .filter((v): v is Exclude<typeof v, '?'> => typeof v === 'number');
        const hasUnknown = s.votes.some((v) => v.value === '?');
        if (nums.length < 2) continue;
        const idxs = nums.map(fibIndex).filter((i) => i >= 0);
        if (idxs.length < 2) continue;
        const min = Math.min(...idxs);
        const max = Math.max(...idxs);
        if (max - min >= 2) {
          const lo = FIBONACCI_POINTS[min];
          const hi = FIBONACCI_POINTS[max];
          out.push({
            ruleId: 'ESTIMATE_DIVERGENCE',
            ticketId: s.ticketId,
            severity: 'info',
            message: `見積もりが大きく割れています (${lo} と ${hi})。暗黙の前提が違う可能性があります。スコープを話し合って再投票を検討してください${hasUnknown ? ' (「?」投票あり = 情報不足のサイン)' : ''}。`,
          });
        }
      }
      return out;
    },
  },
];

/** 儀式でフィルタして全ルールを実行する唯一の入口 */
export function runTicketRules(ceremony: Ritual, ctx: RuleContext): TicketFinding[] {
  const findings: TicketFinding[] = [];
  for (const rule of ticketRules) {
    if (!rule.ceremonies.includes(ceremony)) continue;
    if (rule.appliesTo === 'aggregate') {
      findings.push(...rule.check(null, ctx));
      continue;
    }
    for (const t of ctx.tickets) {
      const match = rule.appliesTo === 'all' || (t.type !== undefined && rule.appliesTo.includes(t.type));
      if (match) findings.push(...rule.check(t, ctx));
    }
  }
  return findings;
}

/** RuleContext を tickets / sprints / estimationSessions から組み立てるヘルパ */
export function buildRuleContext(
  now: string,
  tickets: Ticket[],
  sprints: Sprint[],
  estimationSessions: EstimationSession[],
): RuleContext {
  return {
    now,
    tickets,
    ticketsById: new Map(tickets.map((t) => [t.id, t])),
    sprints,
    estimationSessions,
  };
}
