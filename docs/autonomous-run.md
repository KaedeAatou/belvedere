# 無人連続実行の運転手順 (autonomous run)

> 用途: ユーザー不在 (睡眠・仕事中) に実装モデル (Opus/Sonnet) が複数フェーズを連続実行するときの規約。
> 2026-06-10 制定。個別フェーズの内容は `docs/refactoring-plan.md` と `docs/design-ticket-types.md` が正。

---

## キックオフプロンプト (ユーザーはこれを貼るだけ)

```
docs/autonomous-run.md に従って夜間連続実行を開始して。
実行順: R1 → R2 → T1 → T2 → T3 → T4 → T6 → R3 → T5 → T7 → T8
各フェーズの仕様は docs/refactoring-plan.md (R*) と docs/design-ticket-types.md (T*)。
```

## 実行規約

1. **1 フェーズずつ直列で**。フェーズ内も commit 単位で検証ゲート (refactoring-plan §6) を通す。
   並行 push しない (CI が絡まる)
2. **フェーズ完了の儀式** (省略禁止):
   - typecheck / test 全緑 (exit code 確認) → commit → push → `gh run watch` で CI 緑を見届ける
   - 本書末尾の「実行ログ」に 1 行追記してから次フェーズへ
   - prompts.ts / mock.ts を触ったフェーズは `mock-llm-reviewer` + `agent-prompt-sync` 実行済みであること
3. **停止条件** (該当したら作業を止め、状況を実行ログと最終メッセージに書いて終了):
   - refactoring-plan **§7 エスカレーション基準**のいずれか
   - 同一フェーズで検証ゲートが **2 回連続** で落ち、原因が特定できない
   - CI の e2e が赤になり、1 回の修正 commit で緑に戻せない
   - 計画に無い設計判断が必要になった (「とりあえずこうしておく」を **しない**)
4. **停止したら**: 中途半端な変更は commit せず `git stash` か revert で**緑の状態に戻して**から終了する。
   朝のユーザーが見るのは「ここまで完了 (全部緑)」+「ここで止まった理由」の 2 点
5. seed 編集 (T2 §5) は設計書に承認記録があるので実行してよい。ただし理由を会話に明記し heredoc 経由で
6. UI フェーズ (T5/T7) で見た目の判断に迷ったら: **既存の Hoshino トークン (styles.css の CSS 変数) と
   既存コンポーネントの見た目を踏襲**。新しいデザイン要素を発明しない
7. 朝の報告メッセージの形式:
   - 完了フェーズと commit 数 / 残フェーズ
   - CI と本番 URL の状態 (e2e 6 本 + 新規 e2e)
   - 止まった場合: 何で止まったか + 提案する選択肢 (A/B)
   - ユーザーが 5 分でできる動作確認手順 (URL + クリック手順)

## 実行ログ (実行モデルが 1 フェーズごとに追記)

| 日時 | フェーズ | 結果 | commit | メモ |
|---|---|---|---|---|
| 2026-06-10 夜 | R1-1 (code) | ✅ 完了 / CI 緑 | a804037 / 9360db5 / bd9a675 | Reviewer Multimodal 死骸をコードから完全除去 (prompts/agents.py/tools/mock/shared/repo-test/py-types)。mock-llm-reviewer が natural output 側の取り残しを検出・修正。typecheck 11/11 test 91/91 |
| 2026-06-10 夜 | R1-1 (docs) | ⏸ エスカレーション | — | §7 該当: PITCH.md の Multimodal キラーシーン / 「Gemini である必然性」差別化が訴求判断。5 docs に技術仕様と訴求が密結合。代替訴求 (Orchestrator 中心) はユーザー/Fable 判断のため未着手。コード側で実害 (動作中 AI の虚偽説明) は消滅済 |
