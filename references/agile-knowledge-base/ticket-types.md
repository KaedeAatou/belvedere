# Belvedere — チケット種別と AI 監査マトリクス

> 作成: 2026-06-10 / 用途: L2 静的知識層 (ルールエンジン `packages/tools/src/ticket-rules.ts` の出典)
> 参照する Agent: Refinement / Planner / Daily / Reviewer / Retrospective
> 設計の正は `docs/design-ticket-types.md`。本ファイルはその知識ベース版 (Phase 3-B で Elastic に index 化)。

---

## 0. 大原則: PBI = What / タスク = How

| | 意味 | 置き場所 |
|---|---|---|
| **PBI (Product Backlog Item)** | 「完了すると誰にどんな価値が増えるか」を答えられる単位 | プロダクトバックログ → Sprint |
| **タスク** | PBI を「どう作るか」に分解した作業単位 | スプリントバックログ (PBI の下にぶら下がる) |

判断に迷ったら: **「これが完了すると誰にどんな価値が増えるか」を答えられれば PBI、答えにくければタスク** (または別管理)。

Scrum Guide 2020 はユーザーストーリーもタスクも規定していない (人気の一手法)。Belvedere は実運用に合わせて 5 種別 (Story / Task / Spike / Bug / Incident) を採用する。NFR / Enabler / Impediment は当面採用しない (NFR/Enabler は Story/Spike で代用、Impediment は Incident + Bug で扱う)。

---

## 1. 5 種別と「何を書くか」

### 📖 story — ユーザーストーリー (PBI / 価値の単位)
- title: 短く / description: 「As a [誰が] / I want [何を] / So that [なぜ]」
- DoD (acceptanceCriteria): **価値完了** (例: 「ユーザがログイン後、プロフィールが見える」)
- 見積: Story Point (1/2/3/5/8/13) — **見積もりポーカーで決める**
- リンク: `epicId` (親 Epic)

### 🔨 task — Story の作業分解 (How / PBI ではない)
- title: 「設計」「実装」「テスト」等 / description: 技術手順
- DoD: **作業完了** (例: 「PR Merge」「テスト緑」)
- 見積: 1 日以内目安 (Story Point は使わない)
- リンク: `parentTicketId` **必須** (story 型チケットの id、または旧 US-*)

### 🔍 spike — 調査 (PBI / 不確実性の低減、タイムボックス制)
- title: 「調査: A か B か」 / description: 何を明らかにしたいか
- DoD: **判断材料が揃った** / 結論を文書化した (ADR 等)
- 見積: `timeboxHours` (例: 4 = 4 時間で打ち切り)
- リンク: `epicId`

### 🐛 bug — 不具合修正 (PBI / 価値回復)
- title: 現象 / description: **再現手順** + 期待 vs 実動作 + 影響範囲
- DoD: 再現しない + **回帰テスト追加**
- 見積: Story Point
- リンク: 関連 story、Incident 由来なら `relatedIncidentId`

### 🚨 incident — 突発インシデント (計画外割込み)
- title: 現象 / description: 発生時刻 + 影響範囲 + 一時対応 (workaround)
- DoD: 復旧 + Postmortem 実施 + **根本対応 Bug の起票**
- 見積: なし (突発)
- リンク: 根本対応 Bug 側から `relatedIncidentId` で逆参照される

> Incident と Bug は別物: Incident = 「今ユーザーが困っている」消火対象 (復旧でクローズ)。
> 根本対応 = Postmortem で判明した恒久策 = Bug として PBI 管理し計画的に対応 (ITIL / SRE の定石)。

---

## 2. AI 監査マトリクス (種別 × 儀式)

ルールエンジン (`ticket-rules.ts`) が実装する判定。`★` は 2026-06-10 で新規追加。

| 種別 | Planning (Planner) | Daily (Daily) | Refinement (Refinement) |
|---|---|---|---|
| **story** | Sprint Goal 整合 / 容量 vs ΣSP / DoD あり | 3 日停滞 / Velocity 差 | SP>8 粒度過大 / ★DoD 手続き的 / valueImpact 未設定 / priority↔valueImpact ミスマッチ |
| **task** | ★親 Story なし投入を弾く | ★1 日想定 vs 2 日経過 | ★親なし Task 検出 |
| **spike** | タイムボックス設定済 | タイムボックス超過警告 | ★DoD が判断材料ベースか |
| **bug** | 優先度 vs 影響範囲 | 修正リードタイム | ★再現手順なし / 回帰テスト DoD あり |
| **incident** | (起きたら Sprint 中断対応) | ★発生中インシデント警告 | ★Incident あったが根本対応 Bug 未起票 |

Review (Reviewer) / Retrospective は意味理解が必要な監査 (DoD 充足確認 / 頻発パターン検出) が中心で、Phase 3-A の Gemini 実装で組み込む。

---

## 3. 見積もりポーカー (人間のみ / AI は運営)

ポーカーサイト・スプレッドシートの代替を Belvedere 内で完結:

1. Story に SP が無い → Refinement の `STORY_SP_MISSING` が検出、「セッション開始」を提示
2. owner/sm/po がセッション開始
3. 各メンバが**互いに見えない状態**で投票 (フィボナッチ 1/2/3/5/8/13 + '?')。誰が投票済かは見える
4. owner/sm/po が一斉開示
5. 揃ったら採用 → `ticket.estimatePt` に書込 / 割れたら `ESTIMATE_DIVERGENCE` が議論を促す → 再投票

**AI は投票者にならない** (見積もりの基準データが必要で、信頼できる基準は過去チケット蓄積後にしか作れない)。AI の役割は運営: 未見積もり検出 / 投票の隠蔽管理 (サーバ側で強制) / 開示後の割れ検出 (8 と 2 に割れた = フィボナッチ 2 段以上 = 認識ズレ。これは純粋な算数なので基準不要)。

---

## 出典

- Scrum Guide 2020 (PBI / スプリントバックログの 3 要素 = Goal/What/How)
- Scrum.org "What is a Sprint Backlog?" (PBI + 計画、別バックログを作らない)
- Mike Cohn "Agile Estimating and Planning" (Planning Poker / Story Point)
- ITIL / Google SRE Workbook (Incident → Postmortem → 恒久対策)

## 関連
- `docs/design-ticket-types.md` — 実装設計 (T1-T8)
- `packages/tools/src/ticket-rules.ts` — ルールエンジン (本マトリクスの実装)
- `references/agile-knowledge-base/story-points.md` — 見積もりの詳細
