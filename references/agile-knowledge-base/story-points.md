# Story Point — 相対見積もりベストプラクティス

> 出典: Mike Cohn "Agile Estimating and Planning" (2005) + James Grenning "Planning Poker" (2002) + Mountain Goat Software blog
> 参照する Agent: Planner / Refinement
> Belvedere 上の格納: `Ticket.estimatePt?: number`

---

## 1. Story Point とは

> "Story points are a unit of measure for expressing an estimate of the overall effort required to fully implement a Product Backlog item or any other piece of work."
> (Mike Cohn "Agile Estimating and Planning")

**核心**: 時間ではなく **相対サイズ**。「これは前に作った X と同じくらい」「あれの 2 倍」と比較する。

---

## 2. なぜ時間ではなく相対値か

| 観点 | 時間見積もり (人日) | Story Point |
|---|---|---|
| 個人差の吸収 | 開発者 A は 2 日 / B は 4 日 → 衝突 | 「これは中サイズ」で合意可能 |
| 学習効果の反映 | 成長すると見積もりが歪む | 相対値は安定 |
| 不確実性の表現 | 「2-5 日?」と曖昧化 | フィボナッチで段階表現 |
| Velocity の安定性 | 個人スキル変動で揺れる | チーム全体の "速度" として安定 |

---

## 3. フィボナッチ数列 (Belvedere 採用)

`1, 2, 3, 5, 8, 13, 21, ...`

なぜフィボナッチか:
- 大きな数字ほど不確実性が増すため、数値の刻みも荒くする (= 偽の精度を避ける)
- 「3 と 4 のどっち?」のような無意味な議論を排除

### Belvedere での運用

| SP | 意味 (典型) |
|---|---|
| **1** | 1 時間以内、コメント追加・typo 修正レベル |
| **2** | 半日以内、設定変更・小さな関数追加 |
| **3** | 1 日以内、1 機能の小さい変更 |
| **5** | 2-3 日、新機能 1 つ (テスト含む) |
| **8** | 半スプリント (1 週間)、複雑な機能 1 つ |
| **13+** | **要分割** (Refinement Agent 第 1 観点で警告) |

---

## 4. Planning Poker (James Grenning, 2002)

### 4-1. 進め方

1. PO が User Story を読み上げ
2. 開発者は質問
3. 各自フィボナッチカードから 1 枚選ぶ (一斉公開)
4. 最大値と最小値の開発者が理由を説明
5. 再投票 (最大 2-3 ラウンド)
6. 全員が同じ数字に近づけば確定 / そうでなければ要分割

### 4-2. なぜ一斉公開か

- 「先に発言した人」の influence を防ぐ (アンカリング効果)
- 個人の判断を尊重 (心理的安全性)

---

## 5. Belvedere Refinement Agent 第 5 観点 (SP 分散異常)

> 同 Epic 配下の Story Point 見積もりバラつき異常 — 再見積もり推奨

### 5-1. 検出ロジック

```
1. Epic ごとに配下の Story を集約
2. SP 分散 (variance) を計算
3. 標準偏差 > しきい値 → 異常としてフラグ
4. 「同じ Epic なのにサイズ感がバラバラ」= 分割粒度の不揃いサイン
```

### 5-2. なぜ問題か

同じ Epic 配下なのに 1 / 2 / 3 / 13 / 21 のような分布だと:
- 13 / 21 は INVEST の Small を満たさない (分割推奨)
- もしくは Epic 自体が広すぎる (Epic 分割を検討)
- もしくは 1 / 2 が過度に細分化されている (merge を検討)

→ Refinement Agent が「分散異常」を検出して PO に再見積もり推奨。

---

## 6. アンチパターン

| アンチパターン | 何が問題か |
|---|---|
| **時間と SP を混在** | "5 ポイント = 5 日" のように換算する人が出る → SP の意味喪失 |
| **個人ごとに SP を変える** | 「あなたなら 3、私なら 5」→ 相対値の意味なし、チーム速度算出不可 |
| **Velocity を個人評価に使う** | 「先月 30 SP、今月 25 SP だから低評価」→ SP インフレ、信頼性低下 |
| **新規参画者を Planning Poker に最初から入れる** | コンテキスト不足、見積もりが歪む。1-2 スプリントは observe 推奨 |
| **SP が固定 (再見積もりしない)** | 学習・進捗で実態と乖離 → 数字が嘘になる |

---

## 7. SP と Velocity の関係

### 7-1. Velocity = 直近 3-5 スプリントの平均消化 SP

```
Velocity = (SP[s-1] + SP[s-2] + SP[s-3]) / 3
```

Belvedere `Sprint.velocity` フィールドはこれを保持。

### 7-2. Sprint Planning でのキャパシティ計算

```
今スプリントで取れる SP = Velocity × 利用可能率
利用可能率 = 1 - (休暇 + 会議 + 割り込み) / 営業日数
```

Belvedere Planner Agent はこの計算を支援:

```
◆ Sprint 13 容量計画 (Capacity 32pt / Selected 24pt)
  Velocity 27 → Capacity 32 (休暇調整後)
  Selected 24 SP は安全圏 (75% 充填)
```

---

## 8. 引用可能フレーズ集

```
> Mike Cohn "Agile Estimating and Planning" (Ch.4) によると、Story Point は時間ではなく
> 相対サイズです。WC-106 [SP=13] は同 Epic 配下の他チケット (3-5 SP) より大幅に大きく、
> 分割を推奨します (Refinement Agent 第 1 観点)。

> Planning Poker (James Grenning, 2002) では、見積もりの最大値と最小値が乖離した時に
> 双方が理由を説明します。再投票で収束しなければ User Story の分割サインです。

> "Velocity should never be used for individual performance evaluation."
> (Mountain Goat Software)
> Velocity はチーム速度の指標であり、個人の評価指標ではありません。
> SP インフレ (見積もりの肥大化) を引き起こします。

> Belvedere Refinement Agent 第 5 観点: 同 Epic 配下の SP 分散が大きい (例: 1 / 2 / 3 / 13)
> 場合、Epic 自体が広すぎる or 分割粒度が不揃い。再見積もり or Epic 再構成を推奨。
```

---

## 9. 改訂履歴

- 2026-06-09: 初版
