// agent-evals: golden を runTicketRules に通して検出率を出す純粋関数。
// 「期待した指摘を拾えているか (検出漏れ)」と「出てはいけない指摘が出ていないか (誤検出)」を集計する。

import { runTicketRules, buildRuleContext } from '@belvedere/tools';
import { EVAL_NOW, type EvalCase, type ExpectedFinding } from './golden';

export interface GoldenScore {
  /** expect の総数 (= 拾うべき指摘の数) */
  total: number;
  /** 実際に検出できた数 */
  detected: number;
  /** 検出漏れ (品質後退のシグナル) */
  missing: ExpectedFinding[];
  /** mustNotFire なのに出てしまった誤検出 */
  falseFires: ExpectedFinding[];
}

export function scoreGolden(cases: EvalCase[]): GoldenScore {
  let total = 0;
  let detected = 0;
  const missing: ExpectedFinding[] = [];
  const falseFires: ExpectedFinding[] = [];

  for (const c of cases) {
    const findings = runTicketRules(c.ceremony, buildRuleContext(EVAL_NOW, c.tickets, [], []));
    const fired = (e: ExpectedFinding): boolean =>
      findings.some((f) => f.ruleId === e.ruleId && f.ticketId === e.ticketId);

    for (const e of c.expect) {
      total += 1;
      if (fired(e)) detected += 1;
      else missing.push(e);
    }
    for (const e of c.mustNotFire ?? []) {
      if (fired(e)) falseFires.push(e);
    }
  }

  return { total, detected, missing, falseFires };
}
