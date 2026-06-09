# Scrum Guide 2020 — 要約と引用

> 出典: Ken Schwaber & Jeff Sutherland "The Scrum Guide" 2020 年 11 月版
> URL: https://scrumguides.org/scrum-guide.html
> ライセンス: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) — 再配布・改変・引用可
> 全文: 約 13 ページ (英語) / 公式日本語訳あり

---

## 1. スクラムの定義

> "Scrum is a lightweight framework that helps people, teams and organizations generate value through adaptive solutions for complex problems."
> (Scrum Guide 2020, Definition of Scrum)

**Belvedere での解釈**: フレームワーク = ガチガチのルールではなく、最小限の構造 (3 役割 / 5 イベント / 3 成果物) で複雑な問題に適応する道具。Agent はこの最小構造の **健全性** を診断する。

---

## 2. スクラムの 3 つの柱 (Three Pillars)

スクラムは経験主義 (Empiricism) と Lean 思考に基づく。経験主義の 3 つの柱:

| 柱 | 意味 | Belvedere Agent との対応 |
|---|---|---|
| **Transparency (透明性)** | 重要な側面が、作業を担当する人と検査する人の両方に見えること | Daily Agent / Live Activity 画面で「いつ何が動いたか」可視化 |
| **Inspection (検査)** | スクラム成果物と目標達成度を頻繁かつ熱心に検査 | Refinement Agent の 6 観点診断 |
| **Adaptation (適応)** | プロセスや成果物が許容範囲外と判断された場合、調整する | Retrospective Agent の Try 抽出 + WIP 転記 |

> "The three pillars uphold every implementation of empirical process control: transparency, inspection, and adaptation."

---

## 3. スクラムの 5 つの価値観 (Five Values)

| 価値 | 意味 |
|---|---|
| **Commitment (確約)** | 目標達成とお互いの支援を約束する |
| **Focus (集中)** | スプリントの作業に集中し、ベストを尽くす |
| **Openness (公開)** | 作業と課題について公開する |
| **Respect (尊敬)** | お互いを能力ある独立した個人として尊敬する |
| **Courage (勇気)** | 正しいことをする勇気と困難な問題に取り組む勇気を持つ |

**Belvedere での意義**: これらは数値化できないが、Refinement / Retrospective の指摘文面 (例: 「priority=urgent ∧ valueImpact=low は緊急根拠を再確認 (Openness)」) に組み込み可能。

---

## 4. スクラムチーム (Scrum Team)

> "The fundamental unit of Scrum is a small team of people, a Scrum Team. The Scrum Team consists of one Scrum Master, one Product Owner, and Developers."

サイズ: **typically 10 or fewer people**。

### 4-1. プロダクトオーナー (Product Owner / PO)

責任:
- プロダクトゴール (Product Goal) を策定し明示的に伝える
- Product Backlog アイテムを作成・明確に伝える
- Product Backlog の順序付け
- Product Backlog が透明・可視・理解可能であることを保証する

> "The Product Owner is accountable for maximizing the value of the product."

### 4-2. スクラムマスター (Scrum Master / SM)

責任 (要約):
- スクラム実践の有効性に対して説明責任
- チームが定義された実践と相互作用を遵守するよう支援
- スクラムフレームワーク自体を変更する権限はない (= プロセスの番人ではなく servant leader)

> "The Scrum Master serves the Scrum Team, the Product Owner, and the organization."

### 4-3. 開発者 (Developers)

責任:
- スプリントの計画作成 (Sprint Backlog)
- Definition of Done への準拠による品質
- 計画を毎日適応 (Daily Scrum)
- 専門家として相互に説明責任を持つ

---

## 5. スクラムのイベント (Scrum Events / 5 つ)

### 5-1. Sprint (スプリント)

- **タイムボックス**: 1 ヶ月以下 (推奨 2 週間)
- すべての作業の容れ物
- スプリント中、Sprint Goal を危険にさらす変更はしない、品質を下げない、Product Backlog は必要に応じて Refinement

### 5-2. Sprint Planning

- **タイムボックス**: 1 ヶ月スプリントに対して **最大 8 時間** (2 週間スプリントなら最大 4 時間)
- 議題:
  1. このスプリントがなぜ価値があるか (Sprint Goal の合意)
  2. このスプリントで何ができるか (PB アイテムの選択)
  3. 選んだ作業をどう成し遂げるか (Sprint Backlog の作成)

### 5-3. Daily Scrum

- **タイムボックス**: **15 分**
- 開発者のため (PO / SM は participant ではない)
- 目的: Sprint Goal への進捗の検査と Sprint Backlog の適応

> "The purpose of the Daily Scrum is to inspect progress toward the Sprint Goal and adapt the Sprint Backlog as necessary."

### 5-4. Sprint Review

- **タイムボックス**: 1 ヶ月スプリントに対して **最大 4 時間**
- スプリントの成果を検査し、今後の適応を決定する
- ステークホルダーを招き、進捗を発表 → 議論 → コラボレーション

### 5-5. Sprint Retrospective

- **タイムボックス**: 1 ヶ月スプリントに対して **最大 3 時間**
- 個人 / 相互作用 / プロセス / ツール / Definition of Done に関して、品質と効果を高める方法を計画
- スプリントの締め

---

## 6. スクラムの成果物 (Scrum Artifacts / 3 つ)

| 成果物 | 約束事 (Commitment) |
|---|---|
| **Product Backlog** | Product Goal (プロダクトゴール) |
| **Sprint Backlog** | Sprint Goal (スプリントゴール) |
| **Increment** | Definition of Done (完了の定義) |

各成果物には commitment が紐づき、それが透明性と焦点を提供する。

### 6-1. Definition of Done (DoD)

> "The Definition of Done is a formal description of the state of the Increment when it meets the quality measures required for the product."

**Belvedere での扱い**: チケットレベルで `acceptanceCriteria?: string[]` を持ち、Planner Agent が「DoD 不足」を検出して提案する。

---

## 7. 引用可能フレーズ集 (Agent 出力時の出典明記用)

```
> Scrum Guide 2020 によると "Daily Scrum はタイムボックス 15 分" のため、現在 22 分かかっているのは規約超過です。
> (出典: https://scrumguides.org/scrum-guide.html §6.1)

> "Definition of Done が満たされていない作業は、Increment の一部とはみなされない" (Scrum Guide 2020 §3.3)。
> WC-104 はテストが通っていないため、Increment に含められません。

> Scrum の 3 つの柱の 1 つは Transparency (透明性) です。Sprint Backlog の進捗が日次で可視化されていない場合、この柱が損なわれています。
```

---

## 8. Belvedere Agent ごとの参照箇所

| Agent | 主に参照する節 |
|---|---|
| Planner | §5-2 Sprint Planning / §6 Artifacts / §6-1 DoD |
| Daily | §5-3 Daily Scrum (15 分タイムボックス) |
| Refinement | §1 Definition / §4 Product Owner 責任 (PB 順序付け) / §5-1 Sprint (Refinement は継続的) |
| Reviewer | §5-4 Sprint Review (ステークホルダ参加) |
| Retrospective | §5-5 Sprint Retrospective (3 時間タイムボックス) / §2 三つの柱 (Adaptation) / §3 五つの価値観 |

---

## 9. 改訂履歴 (このファイルの)

- 2026-06-09: 初版 (Phase 1-B 末 / 知識ベース整備の一環)
