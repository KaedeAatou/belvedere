---
name: belvedere-commit
description: Belvedere プロジェクトで git commit を作る前に必ず呼ぶ。Qiita itosho 流の「1 行目: 種別と要約 / 2 行目: 空行 / 3 行目以降: 変更理由」フォーマットを強制する。コミットメッセージの 1 行目だけで「なぜ必要か」が伝わることを審査基準にする。Use this skill whenever the user mentions commit / コミット / git commit / 「変更を保存」/ 「ここまでで一区切り」/ commit-now / commit-push-pr — even if not explicitly named, never call git commit without first invoking this skill. Replaces and disables the generic `commit-commands:commit` plugin.
color: green
---

# Belvedere Commit Message

このスキルは Belvedere プロジェクトの **コミットメッセージのフォーマット規約** を一元管理する。`git commit` 実行前に必ずこのスキルの指示に従う。

## なぜこの規約があるか (Qiita itosho 流)

GitHub の commits 一覧で **1 行目だけが目に入る**。1 行目から「**なぜ必要だったか**」が分からないコミットは、後から振り返った時に検索性が低く、bisect にも使えない。Belvedere は審査用に commit 履歴を見せる場面もある (B-5 実装力評価) ため、**履歴が読み物として通じる**ことが重要。

## フォーマット (3 行構造)

```
[<種別>]<要約 (40-60 字目安)>
                                            ← 空行 (省略不可)
<変更理由 (なぜ必要か / 何を解決するか / 関連する設計判断)>
<必要に応じて箇条書きで具体的な変更点>
```

### 種別の選び方 (ライト版を主、必要時フル版)

**ライト版 (4 種類 / 大半はこれで足りる)**:

| 種別 | 用途 |
|---|---|
| `fix` | バグ修正 (動かなかったものを動くように) |
| `add` | 新規ファイル / 新規機能追加 (今までになかったものを足す) |
| `update` | 既存機能の修正 (バグ修正でも新規でもない、改善・調整) |
| `remove` | 削除 (ファイル削除 / 機能廃止) |

**フル版 (粒度を細かく区別したい時)**:

| 種別 | 用途 | ライト版との違い |
|---|---|---|
| `hotfix` | 本番でクリティカルなバグの緊急修正 | `fix` より緊急度高い (master 直 push 等) |
| `change` | 仕様変更 (動作が変わる、API breaking) | `update` は内部改善、`change` は外部に影響する仕様変更 |
| `clean` | リファクタリング / フォーマット整理 | `update` は機能変更込、`clean` は機能変えずに整理 |
| `disable` | 機能の一時無効化 (削除はしない) | `remove` は完全削除、`disable` は無効化 (戻せる) |
| `upgrade` | 依存ライブラリ / ランタイムバージョンアップ | `update` の中で「依存更新」を区別 |
| `revert` | 過去 commit の取り消し | git revert と一致 |

→ 迷ったらライト版を使う。「これは仕様変更?ただの改善?」と悩まないで、`update` で済ませて 3 行目以降で具体性を出す方が良い。

### 1 行目の書き方

**Good 例**:
```
[fix]削除フラグが更新されない不具合の修正
[add]Reviewer Agent に Multimodal 動画→指摘抽出機能
[update]Refinement の観点を 5 → 6 に拡張 (戦略整合性追加)
[remove]廃止された WindEvent / 翼メタファー関連の dead code
[clean]@kazaguruma/* → @belvedere/* に workspace 名一括統一
[upgrade]@modelcontextprotocol/sdk 0.x → 1.0.4
```

**Bad 例 (なぜダメか)**:
```
[update]修正                     ← 何を修正したか分からない
[fix]諸々のバグを直した              ← 「諸々」は禁句、複数バグなら commit 分割
fix bug                          ← 種別表記なし、英語でも種別ブラケット必須
[update]ROADMAP                  ← 名詞だけだと「何をした?」が読めない
```

### 1 行目の長さ目安

- **40-60 字** (日本語含む) が読みやすい
- GitHub の commits 一覧で省略されるのは 80 字超え → 80 字以内厳守
- 長くなりそうなら、3 行目以降で詳細を書いて 1 行目を簡潔に保つ

### 3 行目以降の書き方

**書くべき**:
- **なぜ** その変更が必要だったのか (= 直前の状態の何が問題か)
- **何を解決した** のか (= ユーザー / 開発者にとっての効果)
- **重要な設計判断** (= 代替案を採らなかった理由)
- **検証** (= typecheck 緑 / smoke pass / e2e 通過などの動作確認)

**書かなくていい**:
- 何を変えたか (= 1 行目と diff で分かる、重複)
- ファイル名の羅列 (= git show で出る)

**Good 例**:
```
[fix]Refinement Agent が EP-3 を検出しない不具合の修正

backlog.refinement.check Tool の grep -c が 0 件のとき stdout に "0" + exit 1 を返すため、
`|| echo 0` で count が "0\n0" になっていた。これにより [: integer expression expected
が出て strategic_intent_missing チェックが skip されていた。
修正: `|| count=0` で grep の exit code を握って count をフォールバック値に。
検証: smoke 14/14 pass、EP-3 が検出される実例で確認済。
```

**Bad 例**:
```
[fix]bug fix in refinement tool

ロジック修正                   ← 詳細ゼロ、読み手が diff を全部見ないと分からない
```

## リファレンス番号 (現状: 不要 / Belvedere 利用開始後: 必須)

### 現状 (Phase 1-A まで)

リファレンス番号は **書かない**。プロジェクト管理に Belvedere 自体をまだ使っていないため。

### Belvedere 利用開始後 (Phase 1-D 以降、MCP で Claude Code から Belvedere を操作開始した時点)

3 行目以降の **冒頭** に `refs BV-XXX` を入れる:

```
[fix]Refinement Agent が EP-3 を検出しない不具合の修正

refs BV-156

backlog.refinement.check Tool の grep -c が 0 件のとき...
```

`BV-` は default project (Belvedere Core) の `idPrefix`。他 project 配下のチケットなら各 project の `idPrefix` を使う (例: `refs ACME-42`)。

## コミット粒度のルール

**1 commit = 1 つの論理変更**:
- 複数のバグ修正を 1 commit にまとめない (= bisect が壊れる)
- 機能追加とリファクタリングを 1 commit にしない
- 例外: 「リネーム + その影響でビルドが壊れる箇所の修正」は 1 commit (= 不可分な変更)

**やりたい変更が複数あるときの判断**:
- 別の commit に分けられるなら分ける
- 分けると個々がビルドできない (テスト落ちる) なら 1 commit
- 迷ったら分ける

## 実行手順

git commit を作成する時:

1. `git status` / `git diff --cached` で変更内容を確認
2. **種別を選ぶ** (上記表から、迷ったらライト版)
3. **1 行目を書く** (40-60 字、種別ブラケット必須、なぜ・何を端的に)
4. **空行**
5. **3 行目以降に変更理由 + 必要なら箇条書き**
6. heredoc で `git commit -m "$(cat <<'EOF' ... EOF)"` で実行

```bash
git commit -m "$(cat <<'EOF'
[<種別>]<要約>

<変更理由 (なぜ・何を解決)>
<必要なら箇条書きの具体変更点>
<検証 (typecheck / smoke / 動作確認)>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## 既存 commit-commands plugin との関係

`commit-commands:commit` は generic な「git commit を作る」コマンドで、**フォーマットを強制しない**。Belvedere ではフォーマット強制が必要なので、こちらの skill を必ず使う。

→ 今後 `commit-commands:commit` は呼ばない。直接 git commit を Bash で実行するか、このスキルで指示されたメッセージを使う。

## トラブルシュート

| 症状 | 対処 |
|---|---|
| 種別を選び迷う | `update` で書いて、3 行目以降で具体的に書く |
| 1 行目が長くなる | 3 行目以降に詳細を逃して 1 行目を 60 字以内に圧縮 |
| 複数の種別をまたぐ変更 | 1 commit を分割する (bisect 観点で必須) |
| 緊急で粒度を犠牲にしたい | コメントで「複数変更が混ざるが時間優先で 1 commit」と 3 行目に正直に書く (例外として残す) |

詳しい例は `references/examples.md` を参照。
