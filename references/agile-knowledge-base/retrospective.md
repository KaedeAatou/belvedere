# Sprint Retrospective — ベストプラクティス + 手法集

> 出典: Esther Derby & Diana Larsen "Agile Retrospectives: Making Good Teams Great" (2006) + Scrum Guide 2020 §5-5 + Atlassian Retrospective Guide
> 参照する Agent: Retrospective Agent
> 公式タイムボックス: 1 ヶ月スプリントに対して **最大 3 時間** (2 週間スプリントなら ~1.5 時間)

---

## 1. 目的 (Scrum Guide 2020)

> "The purpose of the Sprint Retrospective is to plan ways to increase quality and effectiveness."
> "The Scrum Team inspects how the last Sprint went with regards to individuals, interactions, processes, tools, and their Definition of Done."

**核心**: 品質と効果を高める具体的なアクションを次スプリントに transfer する。

---

## 2. 5 段階構造 (Derby & Larsen, 2006)

> Esther Derby と Diana Larsen の "Agile Retrospectives" は、ふりかえりの標準教科書。5 段階で会を進める。

| 段階 | 目的 | 時間配分 (2 週間スプリントの 90 分会の場合) |
|---|---|---|
| **1. Set the Stage (場を整える)** | 全員の発言準備、心理的安全性確保 | 5-10 分 |
| **2. Gather Data (データを集める)** | 起きた事実を可視化 | 20-25 分 |
| **3. Generate Insights (洞察を引き出す)** | 「なぜそうなったか」を掘る | 20-25 分 |
| **4. Decide What to Do (何をするか決める)** | アクション (Try) に変換 | 20-25 分 |
| **5. Close the Retrospective (締める)** | コミットメント確認、お礼 | 5-10 分 |

**Belvedere Retrospective Agent の出力**: Step 4 の Try 抽出 + owner 候補割当 + 翌スプリント WIP 転記候補生成を支援。

---

## 3. 代表的手法 (Step 2-4 で使う)

### 3-1. KPT (Keep / Problem / Try)

日本で最も普及。シンプル。

| 列 | 内容 |
|---|---|
| **Keep** | 続けたい良いこと |
| **Problem** | 起きた問題 |
| **Try** | 次やってみること |

**Belvedere の扱い**: Ceremony.tries[] フィールドは KPT の "Try" を蓄積する。`TryItem { text, ownerId?, carriedToTicketId? }` ([[shared/types.ts]])。

### 3-2. Mad / Sad / Glad

感情ベース。心理的安全性が低いチームに有効。

| 列 | 内容 |
|---|---|
| **Mad** | 怒りを感じたこと |
| **Sad** | 悲しかったこと |
| **Glad** | 嬉しかったこと |

### 3-3. 4Ls (Liked / Learned / Lacked / Longed For)

学習に焦点を当てる。新しいチームに有効。

| 列 | 内容 |
|---|---|
| **Liked** | 気に入ったこと |
| **Learned** | 学んだこと |
| **Lacked** | 不足していたこと |
| **Longed For** | 望んでいたこと |

### 3-4. Start / Stop / Continue

最もシンプル、アクション直結。

| 列 | 内容 |
|---|---|
| **Start** | 始めたいこと |
| **Stop** | やめたいこと |
| **Continue** | 続けたいこと |

### 3-5. 5 Whys (なぜを 5 回)

根本原因分析。Toyota Production System 由来。

```
問題: PR レビューに 1 日以上かかる
なぜ? → 大きな PR が多い
なぜ? → ストーリーが大きすぎる
なぜ? → Refinement で分割できていない
なぜ? → SP > 8 のチェックがない
なぜ? → 自動化されていない (= 根本原因)
→ Try: Refinement Agent の SP > 8 検出を有効化する
```

**Belvedere の扱い**: 第 6 観点 (戦略整合性) のドリフト検出も 5 Whys 的に根本に降りる発想。

### 3-6. Sailboat Retrospective (航海メタファー)

ビジュアルで楽しい。リモートチームに人気。

```
🌬 風 (Wind)        : 前進させたもの
⚓ アンカー (Anchor) : 引きずっていた重し
🪨 岩礁 (Rocks)     : リスク
🏝 島 (Island)      : 目指す場所 (Sprint Goal / Product Goal)
```

---

## 4. Belvedere Retrospective Agent の責務

`packages/agent/src/prompts.ts` Retrospective Agent より:

```
1. sprint.get で前スプリント情報を取得
2. member.list で参加メンバ一覧を取得 (Try owner 割当)
3. ticket.list で前スプリント全チケット (品質充足率分析)
4. 議事から Try (KPT のうち Try) を抽出
5. owner 候補を member.list から割当て
6. 翌スプリント WIP への転記は L2 (parentTicketId 紐付き)
7. 5 儀式 CeremonyHealthScore 推移を計算、低下している儀式を指摘
```

---

## 5. CeremonyHealthScore (Belvedere 独自指標)

各儀式の健全性を 0-100 で算出 ([[DATA_MODEL §4]])。

```
score = 0.25 × attendance               (出席率)
      + 0.20 × onTime                   (時刻通り開始)
      + 0.15 × (1 - durationVariance)   (時間内に終わったか)
      + 0.20 × normalize(actionableOutputs)  (出力されたアクション数)
      + 0.20 × qualityRate              (チケット品質充足率)
```

**Retrospective Agent の出力例**:

```
◆ 5 儀式健全性 (Sprint 13 vs Sprint 12 の差分):
  Planning      78 (+3)
  Daily         65 (-8)  ← 要注意
  Refinement    72 (+2)
  Review        82 (+1)
  Retrospective 70 (-2)

◆ 主要トレンド: Daily の儀式が停滞 (品質充足率の低下)。次スプリントで重点改善。
```

---

## 6. Try を「実行可能なアクション」にする 5 つの条件 (Derby & Larsen)

> ふりかえりの最も難しい部分は、抽象的な不満を **明日からできる具体行動** に翻訳すること。

| 条件 | 例 (良い vs 悪い) |
|---|---|
| **Specific (具体的)** | 良: "Daily で『昨日詰まったこと』を必ず 1 人 1 つ言う" / 悪: "コミュニケーションを良くする" |
| **Measurable (計測可能)** | 良: "PR レビュー 24 時間以内" / 悪: "レビューを早くする" |
| **Achievable (達成可能)** | 良: "次スプリントから WIP 制限 3" / 悪: "PR を完璧にする" |
| **Owner (持ち主)** | 良: "WC-DAILY-S13-T1 / owner: Kaede" / 悪: "誰かがやる" |
| **Time-bound (期限)** | 良: "Sprint 14 中" / 悪: "そのうち" |

→ SMART 原則 (Specific / Measurable / Achievable / Relevant / Time-bound)。

**Belvedere Retrospective Agent**: Try 抽出時に owner 候補と target sprint を紐付けて出力。

---

## 7. 過去 Try との横断検索 (Phase 3 L3 RAG 実装予定)

Phase 3 末で Elastic + Gemini Embeddings に過去 Try を index する。

**ユースケース**: Retrospective Agent が「PR レビューが遅い」という Try を検出した時、過去 N スプリントで同じ問題が出ていないかを検索。

```
> 過去 6 スプリントで類似の Try が 3 回出ています:
>   - Sprint 7: "PR レビューが 1 日以上" (carriedToTicketId: WC-DAILY-S7-T2 / Kaede)
>   - Sprint 9: "レビュアー不足" (WC-DAILY-S9-T1 / 林)
>   - Sprint 11: "金曜午後の PR が月曜まで放置" (carryToTicketId: 未設定 = 放置)
>
> 同じパターンの繰り返しは「形骸化サイン」(Derby & Larsen)。
> 次スプリントでは過去 Try の効果検証も Retrospective に組み込みを推奨。
```

これが Belvedere 独自の差別化軸 (L1 prompt + L2 best practice + L3 team history の 3 層検索)。

---

## 8. 引用可能フレーズ集

```
> Esther Derby & Diana Larsen "Agile Retrospectives" (2006) の 5 段階構造によると、
> 「Decide What to Do」段階で抽象的不満を SMART な行動に翻訳する必要があります。

> KPT (Keep/Problem/Try) は日本で最も普及した手法ですが、心理的安全性が低いチームには
> Mad/Sad/Glad の方が発言を引き出しやすいケースがあります。

> 5 Whys (Toyota Production System) で根本に降りる:
>   問題 → なぜ → なぜ → なぜ → なぜ → なぜ → 根本原因
> 表層対症療法を避けるために有効。

> Scrum Guide 2020 §5-5 によると、Retrospective のタイムボックスは
> 1 ヶ月スプリントで最大 3 時間、2 週間スプリントで最大 1.5 時間です。
```

---

## 9. 改訂履歴

- 2026-06-09: 初版
