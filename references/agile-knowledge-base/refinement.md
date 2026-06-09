# Backlog Refinement — ベストプラクティス

> 出典: Atlassian Agile Coach + Mike Cohn "Agile Estimating and Planning" (2005) + Scrum Guide 2020 §5-1
> 参照する Agent: Refinement Agent (主) / Planner Agent (副)
> Belvedere の Refinement Agent 6 観点との対応も明示。

---

## 1. Refinement (リファインメント) とは

> "Product Backlog refinement is the act of breaking down and further defining Product Backlog items into smaller more precise items."
> (Scrum Guide 2020 §5-1)

**目的**: Sprint Planning に持ち込めるレベルまで Product Backlog アイテムを整える。**継続的なアクティビティ**であり、特定のイベントではない (Scrum Guide 上の正式な「儀式」ではない)。

**慣習的な開催**: 多くのチームは週 1 回 1〜2 時間で実施 (Atlassian 推奨)。Belvedere では木曜 14:30 を典型例とする (`ROADMAP.md` Cloud Scheduler 設定参照)。

---

## 2. INVEST モデル (Bill Wake, 2003)

良い User Story / Product Backlog Item は以下を満たす:

| 観点 | 意味 |
|---|---|
| **I — Independent (独立)** | 他のストーリーから独立して開発・テスト・リリースできる |
| **N — Negotiable (交渉可能)** | 詳細は固定でなく、PO と開発者で交渉できる |
| **V — Valuable (価値がある)** | ユーザー or 顧客に価値を届ける |
| **E — Estimable (見積もり可能)** | サイズを見積もれる程度に明確 |
| **S — Small (小さい)** | 1 スプリントに収まるサイズ (典型 SP ≤ 8) |
| **T — Testable (テスト可能)** | 受け入れ基準が定義され、検証できる |

**Belvedere Refinement Agent 第 1 観点 (Story 粒度過大 SP > 8 で分割推奨)** は INVEST の **S** に対応。

---

## 3. Belvedere Refinement Agent 6 観点との対応

| Belvedere 6 観点 | 元ネタ | 引用可能フレーズ |
|---|---|---|
| (1) Story 粒度過大 (SP > 8) | INVEST: Small / Mike Cohn "stories that take more than half a sprint should be split" | "SP > 8 のストーリーは分割推奨 (Mike Cohn, 'Agile Estimating' Ch.7)" |
| (2) 依存関係未整理 (parentTicketId / blockedBy 欠落) | INVEST: Independent (完全独立は理想だが、明示的な依存表現は必須) | "Independent ストーリーが理想だが、依存がある場合は blockedBy で明示する (INVEST)" |
| (3) valueImpact 未設定 | INVEST: Valuable / Mike Cohn "value is the primary criterion" | "Valuable を満たさないストーリーは PB から除外検討 (INVEST)" |
| (4) priority × valueImpact ミスマッチ | WSJF (Weighted Shortest Job First) - SAFe / Don Reinertsen | "WSJF = Cost of Delay / Job Size。緊急度と価値の独立評価が前提" |
| (5) 同 Epic 配下の SP 分散異常 | Planning Poker (James Grenning, 2002) / 相対見積もり | "同チームの相対見積もりは分布が安定する。極端な分散は再見積もりサイン" |
| (6) 戦略整合性 (Epic.rationale 欠落) | OKR / Strategic Theme (SAFe) / Lean Startup "vision-first" | "rationale 欠落の Epic は配下チケットが Why を見失う形骸化サイン" |

---

## 4. Refinement 会の進め方 (Atlassian 推奨パターン)

### 4-1. 事前準備 (PO + チーム代表 1 人で 30 分)

1. 次スプリント候補となる PB Top 3-5 を選ぶ
2. acceptance criteria の下書きを書く (PO)
3. 質問リストを作る (チーム代表)

### 4-2. Refinement 会本番 (60-90 分)

1. **概要共有 (5 分)**: PO が候補ストーリーの背景を共有
2. **質疑応答 (15 分)**: 開発者から技術質問
3. **分割 (15 分)**: SP > 8 のストーリーを INVEST に従って分割
4. **見積もり (15 分)**: Planning Poker で SP を投票
5. **DoD 確認 (10 分)**: 各ストーリーの受け入れ基準を最終化
6. **次回候補確認 (5 分)**: 次の Refinement で扱うストーリーを選ぶ

### 4-3. アウトプット (PB 更新)

- 各ストーリーに: title / description / acceptance criteria / SP / valueImpact / parentTicketId
- Sprint Planning に持ち込み可能 ("Ready" 状態)

---

## 5. Story 分割の典型パターン (Mike Cohn "Agile Estimating" Ch.7)

| パターン | 例 | 使い所 |
|---|---|---|
| **ワークフローのステップで分割** | "ログイン" → "認証" / "セッション管理" / "リダイレクト" | UI フローが長い |
| **ビジネスルールで分割** | "決済" → "通常決済" / "クーポン適用" / "返金" | 仕様が複雑 |
| **データ種別で分割** | "ユーザー設定" → "プロフィール" / "通知設定" / "プライバシー" | データモデルが広い |
| **CRUD で分割** | "ユーザー管理" → "Create" / "Read" / "Update" / "Delete" | 管理画面系 |
| **シンプル → 複雑** | "検索" → "完全一致のみ" → "部分一致追加" → "正規表現対応" | MVP 構築に有効 |
| **複数受け入れ条件で分割** | acceptance criteria 3 個 → 1 個ずつ別ストーリー | DoD が膨らんだ時 |
| **オプション機能を切る** | "メイン機能" + "エクスポート機能 (別ストーリー)" | スコープ圧縮 |

**Belvedere Refinement Agent の出力**: SP > 8 を検出した時、上記パターンから 2-3 個の分割候補を提示する (例: WC-106 で「Eval set 拡充 / few-shot rubric 改善 / コスト計測」の 3 つに分割提案)。

---

## 6. priority × valueImpact マトリクス (WSJF の Belvedere 実装)

|  | valueImpact=low | valueImpact=medium | valueImpact=high |
|---|---|---|---|
| **priority=low** | 妥当 (棚) | 上げ候補 | ⚠️ 引き上げ強推奨 |
| **priority=medium** | 妥当 | 妥当 | ⚠️ ゴール直結なのに優先度低の可能性 |
| **priority=high** | やや過剰 | 妥当 | 妥当 |
| **priority=urgent** | ⚠️ 緊急根拠を再確認 | やや過剰 | 妥当 (緊急 + 高価値) |

**Refinement Agent 第 4 観点**: この表のミスマッチ ⚠️ セルを検出して指摘。

---

## 7. 戦略整合性 (Refinement Agent 第 6 観点)

### 7-1. なぜ rationale (戦略意図) が必要か

Epic レベルの "Why" がチケットレベルで失われると、開発者は「指示通り作る」だけになり、トレードオフ判断ができなくなる (= 形骸化スクラム)。

> "If you can't explain why you're building it, you shouldn't be building it."
> (Marty Cagan "Inspired" 2017)

### 7-2. Belvedere での実装

- Epic に `rationale` (戦略意図 / Why) + `successMetric` (達成判定の数値指標) + `strategicTheme` を持たせる ([[DATA_MODEL Epic]])
- Refinement Agent が rationale 空 Epic を検出 → PO に確認推奨
- rationale が存在する場合、各チケットの title/description と rationale を照合 → ドリフト検出

### 7-3. seed のデモ用サンプル

- EP-1 / EP-2 / EP-4: rationale 設定済 ✅
- EP-3 (デリバリーパイプラインの信頼化): 意図的に rationale 空 ([[feature-strategic-intent]])
  → デモで Refinement Agent が「形骸化サイン」として警告するシナリオに使う

---

## 8. 引用可能フレーズ集

```
> INVEST モデル (Bill Wake, 2003) によると、Story は Small (1 スプリント以内) を満たすべきです。
> WC-106 [SP=13] は半スプリント超のため、3 つに分割を推奨します。

> Mike Cohn "Agile Estimating" Ch.7 のストーリー分割パターンから:
> ① ワークフローのステップで分割: "PR レビュー LLM" → "Eval set 拡充 / few-shot rubric / コスト計測"

> WSJF (Weighted Shortest Job First / SAFe) の観点では、valueImpact=high なのに priority=low のチケットは
> ゴール直結の機会損失の可能性があります。priority 引き上げを推奨します。

> "If you can't explain why you're building it, you shouldn't be building it." (Marty Cagan)
> EP-3 に rationale (戦略意図) が設定されていません。配下チケット 3 件が「何のために?」を見失う
> 形骸化サインとして PO に確認を推奨します。
```

---

## 9. 改訂履歴

- 2026-06-09: 初版
