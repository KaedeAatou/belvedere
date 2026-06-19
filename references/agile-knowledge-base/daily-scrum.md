# Daily Scrum — ベストプラクティス

> 出典: Scrum Guide 2020 §5-3 + Mountain Goat Software (Mike Cohn) blog
> 参照する Agent: Daily Agent
> 公式タイムボックス: **15 分**

---

## 1. 目的 (Scrum Guide 2020)

> "The purpose of the Daily Scrum is to inspect progress toward the Sprint Goal and adapt the Sprint Backlog as necessary, adjusting the upcoming planned work."
> (Scrum Guide 2020 §5-3)

**核心**: Sprint Goal に対する進捗の検査と適応。報告会ではない。

---

## 2. 3 つの質問 (旧 Scrum Guide で慣習化、現行 2020 版では削除されたが多くのチームで継続)

| 質問 | 目的 |
|---|---|
| 昨日何をしたか? | 透明性 (Transparency) |
| 今日何をするか? | 計画の適応 |
| 何が困っているか? | 障害物の早期検出 |

> Scrum Guide 2020 ではこの 3 質問は削除され、「方法は開発者が決める」に変わった。
> ただし慣習として残るチームは多く、効果的なら使い続けて良い。

---

## 3. やってはいけないこと (Mountain Goat Software より)

| アンチパターン | 何が問題か |
|---|---|
| 「進捗報告会」化 | SM や PO に報告する形になり、検査・適応が起きない |
| 15 分超過 | タイムボックス違反。深掘り議論は別途 (Parking Lot 方式) |
| 個別の問題解決を会の中で行う | 関係ない人を待たせる。会後に当事者だけで議論する |
| 開発者以外が主導 | Daily は開発者のもの (Scrum Guide 2020 で明確化) |
| ジャストインタイムで PB を漁る | PB Refinement は別イベント |
| 「報告したから上がる」と勘違い | 検査→適応のループが回らないと意味がない |

---

## 4. Belvedere Daily Agent の責務

`packages/agent/src/prompts.ts` Daily Agent + `apps/orchestrator-py/.../agents.py:DAILY_INSTRUCTION` より:

```
1. sprint.get で Velocity との整合 (消化ペース) を確認
2. ticket.list で対象 Sprint のチケット一覧を取得
3. 2 日以内にチケットが完了しているか観測
4. 3 日以上動きのないチケットを停滞として検出
5. 要約を生成し AI パネルに提示 (L2 提案 / 通知・メンションは人間が判断)
```

---

## 5. 停滞検出のしきい値根拠

### 5-1. なぜ「3 日」か

| 根拠 | 出典 |
|---|---|
| 2 週間スプリント = 10 営業日。3 日 = 15% は健全な warning ライン | Atlassian Sprint Health Index |
| 1 日 = 偶然 (集中 / レビュー待ち) / 2 日 = 注意 / 3 日 = 障害物の可能性 | Mike Cohn "stalled tickets" rule of thumb |
| Cycle Time の中央値 + 2σ あたりが「異常」サイン | カンバン Lean metrics |

**Belvedere Daily Agent**: 3 日停滞を検出 → AI パネルに L2 提案として提示 (SM への通知・担当者メンションは人間判断)。

### 5-2. 2 日以内完了率の意義

Cycle Time の短いチームは「停滞しないように小さく分割」する文化がある。Velocity と SP だけでは見えない品質指標。

> "Small batches reduce work-in-progress and improve flow."
> (Donald Reinertsen "Principles of Product Development Flow" 2009)

---

## 6. Velocity との整合

### 6-1. Velocity の計算

```
Velocity = (直近 3-5 スプリントの平均消化 SP)
```

これを今スプリントの Daily ごとの実消化と照合 → 「予測通り進んでいるか」を可視化。

### 6-2. Burn-down vs Burn-up

| 指標 | 用途 | 推奨 |
|---|---|---|
| **Burn-down** | スプリント終了までに完了予定の作業残量 | スプリント内の進捗トラッキング |
| **Burn-up** | 累積完了 + スコープ変動 | スコープ追加 / 削除があるプロジェクト全体 |

Belvedere Daily Agent の current 実装 は Burn-down 寄り (残 SP 表示)。

---

## 7. Daily Agent の要約フォーマット (推奨 / AI パネル提示)

```
【デイリースクラム要約 (Daily Agent)】
Sprint 13 / Day N of 14 / Velocity 27 (前 3 平均) / 今消化 X SP

◆ 進行中チケット: M 件 (うち urgent K 件)
  - WC-105 [urgent] ... / Kaede / 進捗あり
  - WC-106 [high]   ... / 林     / ⚠ N 日進捗なし

◆ 警告:
  - WC-106 が N 日停滞。担当者への確認推奨 (L2)

◆ 品質:
  - WC-101 (DoD/SP空) / WC-104 (US紐付けなし) → Planner が候補準備済

AI パネルに提示しました (L2 提案 / 通知は人間判断)。
```

`packages/llm/src/mock.ts` の `getNaturalOutput('daily')` がこのフォーマットを返す (Mock LLM で確認可)。

---

## 8. アンチパターン検出 (Daily Agent が将来検出すべき)

| サイン | 検出方法 | 対処 |
|---|---|---|
| 15 分超過 | Ceremony.actualDurationMin > 15 | "Daily 22 分は規約超過 (Scrum Guide 2020 §5-3)" と注意 |
| 同じチケットが N 日連続「昨日も触った」報告 | Ticket.updatedAt の差分が小さい | 停滞警告 (3 日ルール) |
| SM が話す時間 > 開発者全員の合計 | Speaker time tracking (Phase 4) | "Daily は開発者のイベント (Scrum Guide 2020)" |

---

## 9. 引用可能フレーズ集

```
> Scrum Guide 2020 §5-3 によると、Daily Scrum のタイムボックスは 15 分です。
> 今日の Daily は 22 分でした (規約超過 7 分)。

> Mountain Goat Software のガイドラインでは、3 日以上動きのないチケットは
> 障害物の可能性が高いとされています。WC-106 が該当します。

> "Small batches reduce work-in-progress and improve flow." (Reinertsen 2009)
> 2 日以内完了率が 30% に低下しています。チケット分割の余地を Refinement で確認推奨。
```

---

## 10. 改訂履歴

- 2026-06-09: 初版
