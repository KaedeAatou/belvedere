# Definition of Done (DoD) — 完了の定義

> 出典: Scrum Guide 2020 §3-3 + Atlassian DoD ガイド + Ken Schwaber "Software in 30 Days" (2012)
> 参照する Agent: Planner / Refinement / Reviewer
> Belvedere 上の格納: `Ticket.acceptanceCriteria?: string[]`

---

## 1. 定義 (Scrum Guide 2020)

> "The Definition of Done is a formal description of the state of the Increment when it meets the quality measures required for the product."

**核心**: チームが Increment の品質基準を **明文化したもの**。曖昧な「完了した」を排除する。

---

## 2. なぜ DoD が要るか

### 2-1. 透明性の確保

DoD が曖昧だと:
- 開発者 A は「実装したら done」と思う
- 開発者 B は「テストとレビューも done」と思う
- PO は「本番に出たら done」と思う

→ Sprint Review で「あれ、これ本当に終わってる?」が起きる (形骸化サイン)。

> "If a Product Backlog item does not meet the Definition of Done, it cannot be released or even presented at the Sprint Review."
> (Scrum Guide 2020 §3-3)

### 2-2. 技術的負債の早期検出

DoD に「テストカバレッジ N%」「コードレビュー必須」を入れることで、「動くけど後で誰も触れない」コードを生まないガード。

---

## 3. DoD の階層 (Atlassian 推奨)

| レベル | 例 |
|---|---|
| **ストーリーレベル** | acceptance criteria 全て pass / コードレビュー完了 / ユニットテスト追加 / ドキュメント更新 |
| **スプリントレベル** | 全ストーリーがストーリー DoD を満たす / Sprint Review でデモ可能 / 回帰テスト pass |
| **リリースレベル** | 統合テスト pass / セキュリティスキャン pass / Performance regression なし / ユーザードキュメント更新 |

Belvedere は **ストーリーレベル DoD** をチケットの `acceptanceCriteria` で扱う (Phase 1 時点)。

---

## 4. DoD の典型項目

| カテゴリ | 項目例 |
|---|---|
| **コード** | レビュー完了 / lint 緑 / typecheck 緑 / static analysis 緑 |
| **テスト** | ユニットテスト追加 + 全 pass / カバレッジ N% 以上 / 統合テスト緑 |
| **ドキュメント** | README 更新 / API doc 更新 / CHANGELOG 追記 / コメント追加 |
| **ビルド** | CI pass / Docker build 成功 / 本番想定環境で起動確認 |
| **デプロイ** | dev 環境に deploy 済 / smoke test pass / monitoring 確認 |
| **検証** | PO 確認 / Sprint Review で demo 可能 / acceptance criteria 全 pass |
| **非機能** | a11y チェック / レスポンス時間 < N ms / セキュリティスキャン pass |

---

## 5. Belvedere チケットでの DoD 表現

```typescript
interface Ticket {
  // ...
  acceptanceCriteria?: string[];
  // 例: ["lint 緑", "ユニットテスト追加 + pass", "Sprint Review で demo 可能"]
}
```

### 5-1. Planner Agent の DoD 診断

```
1. ticket.list で対象 Sprint のチケットを取得
2. 各チケットの acceptanceCriteria を確認
3. 空 or 不足のチケットを「品質要修正」として議題化
4. 候補となる DoD 項目を 3-5 個提示 (本ファイルの §4 を参考に)
```

**Mock LLM 出力例 (`mock.ts` Planner より)**:
```
◆ 品質要修正のチケット (AI が候補を準備):
  - WC-101: DoD 候補 3 件と SP=3pt を提案 (L2 承認後に反映)
  - WC-104: 既存 US-201 への紐付けを提案
  - WC-109: DoD 候補 3 件を提案
```

---

## 6. DoD を強化する習慣 (Schwaber "Software in 30 Days")

| 習慣 | 効果 |
|---|---|
| **Retrospective ごとに DoD を見直す** | チームの成長に追従 (テスト自動化が進めば DoD に「e2e 緑」追加 等) |
| **DoD は visible にする** | チーム部屋・Slack pin・Belvedere Workspace 設定で常時可視化 |
| **新規参画者の onboarding に DoD を含める** | 「ここのチームの完了の定義」を 1 ページで伝える |
| **DoD を満たさないチケットは Increment に入れない** | 「半分終わったので入れる」は禁止 |

---

## 7. アンチパターン

| アンチパターン | 何が問題か |
|---|---|
| **DoD 不在** | 「動いたら done」化 → Sprint Review でちゃぶ台返し |
| **DoD が長すぎ (50 項目)** | 誰も全部チェックできない → 形骸化 |
| **DoD が技術項目のみ** | ユーザー受け入れが抜ける → リリース後にバグ多発 |
| **チケットごとに DoD がバラバラ** | チーム DoD と個別 acceptance を混同 → 一貫性なし |
| **PO だけが DoD を作る** | チームの納得感がない → 守られない |

---

## 8. 引用可能フレーズ集

```
> Scrum Guide 2020 §3-3 によると、Definition of Done を満たさない作業は Increment に含められません。
> WC-104 はテスト未追加のため、Sprint Review 対象から外すか、DoD を満たすまで extension を提案します。

> "If a Product Backlog item does not meet the Definition of Done, it cannot be released or even presented at the Sprint Review."
> (Scrum Guide 2020)
> WC-101 は acceptance criteria 未定義のため、Planner Agent が候補 3 件を準備しました (L2 承認後に反映)。

> Atlassian DoD ガイドラインでは、DoD は「ストーリーレベル / スプリントレベル / リリースレベル」の
> 3 階層で持つことが推奨されます。本チームは現在ストーリーレベル DoD のみ。
> Phase 2 でスプリントレベル DoD (Sprint Review demo 可能性) の導入を推奨。
```

---

## 9. 改訂履歴

- 2026-06-09: 初版
