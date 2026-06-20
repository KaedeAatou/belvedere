// agent-evals: ルールエンジン品質ゲート (「まわす = AI を後退させない」の CI ゲート本体)。
//
// prompts.ts / ticket-rules.ts / refinement.ts を変えて AI の判断品質が静かに下がったら、
// このテストが赤になってマージを止める。単体テスト (tools/test/ticket-rules.test.ts) が
// 「ルール単位の fire/not-fire」なのに対し、こちらは現実的なチケットの束を golden として
// 「拾うべき指摘の検出率」で採点する。

import { describe, it, expect } from 'vitest';
import { runTicketRules, buildRuleContext } from '@belvedere/tools';
import { EVAL_NOW, goldenCases } from '../src/golden';
import { scoreGolden } from '../src/runner';

describe('agent-evals: ルールエンジン品質ゲート (まわす / 後退防止)', () => {
  // 各ケースを独立に検証 (失敗時にどの golden ケースか分かるように)
  for (const c of goldenCases) {
    it(`[${c.name}] 期待 finding が出る / 誤検出が出ない`, () => {
      const findings = runTicketRules(c.ceremony, buildRuleContext(EVAL_NOW, c.tickets, c.sprints ?? [], []));
      for (const e of c.expect) {
        expect(findings).toContainEqual(
          expect.objectContaining({ ruleId: e.ruleId, ticketId: e.ticketId }),
        );
      }
      for (const e of c.mustNotFire ?? []) {
        expect(findings).not.toContainEqual(
          expect.objectContaining({ ruleId: e.ruleId, ticketId: e.ticketId }),
        );
      }
    });
  }

  // 検出率を集計してログ (「まわす」の品質スコア可視化 / CI ログに残す)
  it('期待 finding の検出率 100% / 誤検出ゼロ', () => {
    const score = scoreGolden(goldenCases);
    // eslint-disable-next-line no-console
    console.info(
      `agent-evals: ${score.detected}/${score.total} expected findings detected; falseFires=${score.falseFires.length}`,
    );
    expect(score.missing).toEqual([]);
    expect(score.falseFires).toEqual([]);
    expect(score.detected).toBe(score.total);
  });
});
