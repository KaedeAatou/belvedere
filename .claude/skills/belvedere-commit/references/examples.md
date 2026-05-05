# Belvedere Commit Examples

Good / Bad の対比集。SKILL.md の補足。

## 種別別の Good 例

### `[fix]` バグ修正

```
[fix]grep -c の exit 1 で count が "0\n0" になる不具合

backlog.refinement.check Tool の usage-audit.sh で
`|| echo 0` を使っていたため、grep -c が 0 件マッチで exit 1 を返した時に
count 変数が "0\n0" (改行混じり) になり、後続の数値比較で
"integer expression expected" エラーが出ていた。
修正: `|| count=0` でフォールバック値を変数代入に変更。
検証: smoke 14/14 pass、EP-3 検出が正常動作。
```

### `[add]` 新規追加

```
[add]Reviewer Agent に Multimodal 動画→指摘抽出機能

Sprint Review の口頭指摘がチケット化されない「言いっぱなし」課題に対応。
Gemini 2.5 Pro Multimodal で動画を直接読み、発言から指摘を検出して
sourceRecordingId / sourceTimestampSec / sourceQuote / sourceSpeakerId
紐付きの Ticket 候補を生成する (L2 で人間確認後に確定)。

- ReviewRecording 型新設 (Cloud Storage 上の MP4 を指す)
- Ticket に source 系 4 フィールド追加
- video.extractIssues Tool 追加 (Mock 3 候補返す)
- Reviewer responsibility を会前/会後の二段に拡張 (TS / Python ADK 同期)
- PITCH §4 デモ #5 を 20 秒の Multimodal キラーシーンに差し替え

検証: typecheck 全 11 ワークスペース緑、CLI で reviewer 実行確認。
```

### `[update]` 既存改善

```
[update]Refinement の観点を 5 → 6 に拡張 (戦略整合性追加)

「戦略があるはずだが開発者は何のためにこのチケットをやってるか分からない」
課題への対応。Epic.rationale (戦略意図 / Why) が空の Epic を
"形骸化サイン" として検出する第 6 観点を追加。

- Epic に rationale / successMetric / strategicTheme 追加 (TS / Pydantic 同期)
- backlog.refinement.check Tool に strategic_intent_missing シグナル実装
- seed の EP-3 のみ意図的に rationale 空のままにしてデモサンプル化
- EpicRepository.upsert 追加 (新規メソッド)
- prompts.ts / agents.py の Refinement responsibility を 6 観点に同期
```

### `[remove]` 削除

```
[remove]廃止された WindEvent / 翼メタファー関連の dead code

constants.ts の RITUAL_TO_WING / WIND_SOURCE_TO_DIRECTION は
2026-04-30 の方針転換 (5 儀式 + Refinement) で参照ゼロの dead code に
なっていたため削除。RITUAL_LABELS には refinement を追加して 5 儀式に揃える。

参照されていない確認: grep -rn "RITUAL_TO_WING\|WIND_SOURCE_TO_DIRECTION"
で他に参照なし、constants.ts 自身の定義のみ。
```

### `[clean]` リファクタリング

```
[clean]@kazaguruma/* → @belvedere/* に workspace 名一括統一

Belvedere 再ブランド (旧 Kazaguruma) の過渡期維持を打ち切り、
内部識別子を完全に @belvedere/* に統一。
旧 @kazaguruma/* は廃止語リスト (project.md) に追加して混入禁止に。

- 11 packages の package.json name を @kazaguruma/* → @belvedere/*
- 全 import 文を一括 sed (50+ 箇所)
- pnpm install で lock 再構築
- typecheck 全 11 ワークスペース緑
- mcp-server smoke 14/14 pass
```

### `[upgrade]` バージョンアップ

```
[upgrade]@modelcontextprotocol/sdk 0.x → 1.0.4

Subagent / Skill の color frontmatter サポートを取り込むため。
1.x で `Server` クラスが deprecated になり `McpServer` 推奨に
なったが、現状は Server で十分動くので Phase 2 の HTTP 実装時に移行。

検証: smoke 14/14 pass、stdio mode の動作確認済。
```

---

## ❌ Bad 例 (避けるべき)

### Bad 1: 種別ブラケットなし

```
fix bug in refinement                    ← [fix] が無い、機械検索しづらい
```

### Bad 2: 「諸々」「色々」

```
[update]諸々のバグを直した                ← 複数バグなら 1 commit に詰めない
[fix]色々修正                            ← 何を修正したか不明、検索不可
```

### Bad 3: 名詞だけで動詞なし

```
[update]ROADMAP                          ← 何をした?読めない
[fix]bug                                 ← 何のバグ?
```

### Bad 4: 1 行目で全部説明しようとして 200 字

```
[update]Refinement の観点を 5 から 6 に増やして戦略整合性 (Epic.rationale 欠落) を検出する第 6 観点を追加し、Epic 型に rationale/successMetric/strategicTheme フィールドを追加し、Tool 側のロジックも拡張し、Mock LLM の出力にも反映し、prompts.ts と agents.py も同期した
```

→ **悪い**。1 行目は 60 字以内、詳細は 3 行目以降に。

```
[update]Refinement の観点を 5 → 6 に拡張 (戦略整合性追加)

(詳細を 3 行目以降に書く)
```

### Bad 5: 3 行目以降が「変更内容の言い換え」

```
[fix]usage-audit.sh の grep エラー修正

usage-audit.sh の grep のエラーを修正した。            ← 1 行目の繰り返し
具体的には grep を直した。                              ← 何も追加情報がない
```

→ 3 行目以降は **「なぜ・何を解決」** を書く。何をしたかは 1 行目と diff で分かる。

### Bad 6: 関係ない変更を混ぜる

```
[add]Multimodal 機能 + ROADMAP 更新 + 課金アラート設定 + ...
```

→ **commit を分割する**。bisect (= 不具合発生 commit を二分探索) が機能しなくなる。

---

## 1 行目の長さ感覚

| 字数 | 例 | 評価 |
|---|---|---|
| 20 字 | `[fix]ボタンの色不具合` | 短すぎ、何のボタン? |
| 40 字 | `[fix]主要 CTA ボタンの視認性が低い問題の修正` | ✅ ちょうど良い |
| 60 字 | `[update]Refinement Agent の検出観点を 5 → 6 に拡張 (戦略整合性追加)` | ✅ 上限近い |
| 80 字 | `[add]Reviewer Agent に Sprint Review 録画 → 指摘抽出 → Ticket 起票候補生成 (Multimodal)` | 🟡 ギリギリ、改善可能 |
| 100 字 | `[update]Phase 0 の MCP server 実装で 11 Tools (read 6 + invoke 1 + CRUD 4) を全て本実装、smoke 14/14 pass...` | ❌ 長すぎ、詳細は 3 行目へ |

---

## 検証行を入れるパターン

`[fix]` / `[update]` で動作確認した時、最後の段落に **検証** を書くと信頼性が上がる:

```
検証: typecheck 全 11 ワークスペース緑 / mcp-server smoke 14/14 pass
```

```
検証: CLI で reviewer 実行 → EP-3 strategic_intent_missing 検出を確認
```

```
検証: 修正前 commit で再現確認 (`grep -c usage-audit.sh で exit 1`) →
      修正後の commit で同条件でも grep が "0" 1 つだけ出す
```

→ 後でこの commit を見返した時に「動作確認したか?」が一目で分かる。
