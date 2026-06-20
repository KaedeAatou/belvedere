# @belvedere/agent-evals

**「まわす = AI を継続的に改善するサイクル」の "後退させない" 側**を担う agent eval ハーネス。

ハッカソン公式の評価軸「つくる・**まわす**・とどける」のうち「まわす」は **CI/CD + AI を継続的に改善するサイクル**。AI を**改善**するのは Retro Try → Agent ループ + RAG (`docs/continuous-improvement-design.md`) だが、改善作業で AI を**後退させない**安全網がこの eval。プロンプトやルールを変えて「拾うべき指摘を拾えなくなった」ら CI が赤になる。

## 単体テストとの違い

| | 何を見るか |
|---|---|
| `packages/tools/test/ticket-rules.test.ts` (単体) | ルール 1 件ごとの fire / not-fire |
| **agent-evals (本パッケージ)** | **現実的なチケットの束 (golden) → 期待される指摘の検出率**。退化入力込みでシナリオ採点 |

## 構成

- `src/golden.ts` — golden ケース。`tk()` で合成 Ticket を組む (**immutable seed は触らない**)。退化入力 (空 AC / 親なし / 未設定 type / 空集合) を含める (`.claude/rules/testing.md`)。
- `src/runner.ts` — `scoreGolden(cases)` で検出率・検出漏れ・誤検出を集計する純粋関数。
- `test/rules.eval.test.ts` — 各ケースの assert + 検出率 100% / 誤検出 0 を CI ゲート化。`agent-evals: N/N expected findings detected` をログ。

## golden ケースの足し方

`src/golden.ts` の `goldenCases` に 1 オブジェクト追加するだけ:

```ts
{
  name: '説明',
  ceremony: 'refinement',      // どの儀式で診断するか
  tickets: [tk({ id: 'EVAL-XXX', type: 'story', /* ... */ })],
  expect: [{ ruleId: 'STORY_DOD_MISSING', ticketId: 'EVAL-XXX' }],  // 出るべき指摘
  mustNotFire: [{ ruleId: 'STORY_SP_MISSING', ticketId: 'EVAL-XXX' }], // 誤検出ガード (任意)
}
```

`ruleId` の一覧は `packages/tools/src/ticket-rules.ts`。

## 実行

```bash
pnpm --filter @belvedere/agent-evals test      # この eval だけ
pnpm test                                       # 全 workspace (CI と同じ / 本 eval も含む)
```

CI (`.github/workflows/ci.yml`) では `pnpm test` で自動実行され、加えて `agent-evals (quality gate)` の名前付き step でも可視化される。

## 次段 (L2 / 未実装)

現状は **L1 = ルールエンジンの決定的 eval**。`runAgent` を Mock LLM で回して「Agent が指摘を出力 (`outputArtifacts.summary`) に載せるか」を見る **L2** は、Mock が canned 応答のため価値が限定的 → 次段で薄く追加する。実 Gemini を使う L3 (意味近似 eval) は非決定的・コスト高のためハッカソンでは省略。
