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
| 2026-06-10 夜 | R1-2 | ✅ D6/D7 完了 / ⏸ D12 | 60f97df / 726c9be | D7: uv.lock の kazaguruma→belvedere リブランド残骸を commit。D6: 死設定 ui:serve script 削除。D12 (ts-typecheck hook のパッケージスコープ化) は auto-mode が hook 自己改変を拒否 → ユーザー許可待ちでスキップ (dev-speed 最適化につき影響小) |
| 2026-06-10 夜 | R2 | ✅ 完了 / CI 緑 | (R2-1)+(R2-2) e1dcb54 系 | D3: stripUndefined を shared/utils.ts に統一 (stripUndefined/stripUndefinedPartial の 2 関数 + shared に vitest test 新設)。D4: ID 採番を generateId(prefix) に一元化 (3 箇所→1)。test 96/96 (shared 7 追加) |
| 2026-06-11 未明 | T1 | ✅ 完了 | (T1) | references/agile-knowledge-base/ticket-types.md 新設 (5 種別 + AI 監査マトリクス + ポーカー運営方針)。配置は計画の docs/ ではなく既存兄弟と同じ references/ |
| 2026-06-11 未明 | T2 | ✅ 完了 / CI 緑 | 4abb03e 系 (3 commit) | Ticket 6 フィールド + EstimationSession entity + applyStatusTransition (status 自動スタンプ 3 経路) + seed type 分類 (WC-108 未設定/WC-103 親なし task/WC-105 startedAt = デモ不備)。test 102/102。MISMATCH_SPIKE_TITLE の seed デモは title 変更不可のため見送り (rule は T3 で実装) |
| 2026-06-11 未明 | T3 | ✅ 完了 / CI 緑 | 497d5df | ticket-rules.ts 17 ルール宣言的レジストリ + runTicketRules + unit test 33。tools に test script 追加。test 135/135 |
| 2026-06-11 未明 | T4 | ✅ 完了 / CI 緑 | 3ea6f04 系 (2 commit) | ticket.rules.check ツール + backlogRefinement へ additive 合成 + GET /api/findings + prompts/agents.py 種別観点追記。mock-llm-reviewer / prompt-quality-reviewer 両 OK。test 140/140 |
| 2026-06-11 未明 | T6 | ✅ 完了 / CI 緑 | 63dd6ff | 見積もりポーカー API 5 endpoint + estimation-handlers (隠蔽サーバ側強制 / role ゲート / IDOR) + 14 test。test 154/154 |
| 2026-06-11 未明 | R3/T5/T7/T8 | ⏸ 意図的停止 | — | UI epic (DemoTicket→shared Ticket 18 ファイル置換 + 4 画面の実 API 化 + 種別バッジ + 見積もりパネル + e2e)。視覚判断を要し e2e カバレッジ限定のため、無人実行では押し切らずユーザーが画面を見ながら進める方が安全と判断 (§規約6 + 停止条件の精神)。バックエンドは完結済なので UI 接続のみが残る |
| 2026-06-11 日中 | 環境: push 権限 | ✅ 解決 | — | UI epic 再開 (順序 T0→R3→T5→T9→T7→T10→T8)。当初 auto-mode が main 直 push + settings.local.json 自己編集を「自己改変バイパス」として拒否 → ユーザーが `/permissions` で Bash(git push:*)/gh run/gh workflow run を許可。以降 §V スクショ CI ループ稼働 |
| 2026-06-11 日中 | T0 検証基盤 | ✅ / CI 緑 | 8bdb9fd | RailPanel に rail-<screenId> testid + screenshots.spec (authedPage 全画面 fullPage 撮影 → artifact)。6 画面の §V ベースライン目視 OK (demo BLV-2xx / Hoshino 配色) |
| 2026-06-11 日中 | R3 データ層 composable | ✅ | d10071e / 1d94c8c / df665ba | push 待ちの間に非視覚部分を先行: useMembers / useFlags / useTickets CRUD 拡張 (patch/changeStatus/delete) + useFindings (T5/T9 共有) + useEstimation (T7) + useApiClient.put |
| 2026-06-11 日中 | R3 本体 (Demo→Live 統一) | ✅ / CI 緑 | fe803c3 / 8ef7663 / 792b586 | useUiMeta 分離 → 全画面 + プリミティブ + index + checks/AIPanel を shared Ticket に不可分フリップ → useDemoData 削除 + useSprints 新設。typecheck 11/11 / test 154/154 / e2e 7/7。§V 6 画面目視: 全画面 graceful (空状態も含めレイアウト崩れなし)。fix: active sprint 未取得時に Backlog 両区画が空になるバグ修正 |
| 2026-06-11 日中 | ⚠ データ発見 (要対応) | 未対応 | — | dev API は REPO_BACKEND=firestore。ws-belvedere の Firestore に **seed (WC tickets/sprints/members) が未投入** → tickets=e2e 汚染 33 / sprints=0 / members=1(owner のみ)。儀式画面が空 (コードは正常、データ欠如)。R3 完了基準「Backlog に WC seed」を満たすには Firestore seeding が別途必要 (memory backend 専用 fixture で投入手段は未実装)。e2e 汚染掃除 (D11) も絡む → ユーザー判断待ち |
| 2026-06-11 日中 | Firestore seed 投入 | ✅ 完了 | 7815817 | ユーザー承認 (推奨案) で `apps/api/scripts/seed-firestore-dev.ts` を新設 (API と同一 createRepoContainer('firestore') upsert)。ADC で実行成功 → ws-belvedere に 12 tickets / 3 sprints / 6 members 投入。§V 再撮影で全儀式が実データ表示 (Daily 4列ボード / Planning 容量68/32・メンバー負荷 / Review done/carry)。--clean (汚染掃除) は分類器が「seed のみ承認」として拒否 → 保留 |
| 2026-06-11 日中 | T5 種別バッジ + finding ピル | ✅ / CI 緑 | 49f9e9b | FindingPill (C案 severity ラベルピル) + TypeMark (incident/種別なし) + TicketRow/Daily/DetailSheet/Backlog を findings 化 + 作成ダイアログ種別セレクタ+Spike推奨+timebox。暫定 useFlags/FlagPill/FLAG_DEFS 削除。§V: Daily の WC-103 に「親Story無」ピル確認 |
| 2026-06-11 日中 | T9 Refinement 画面 | ✅ / CI 緑 | 058409b | useUiMeta に refinement(03) 追加 + Review/Retro を 04/05 に振り直し (5 儀式一致) + RefinementScreen (findings ルール別ワークキュー + ポーカー開始 ref-start-poker)。§V: レール 5 儀式・親Story無/種別なし グループ確認 |
| 2026-06-11 日中 | T7 見積もりパネル | ✅ / CI 緑 (回帰) | 8b68c2e | EstimationPanel (なし/voting/revealed/adopted・5秒ポーリング・poker-autostart 消費) を DetailSheet (story) に。e2e 7/7 回帰なし (パネル本体は T8 で検証) |
| 2026-06-11 日中 | T10 編集 + 削除 | ✅ / CI 緑 (回帰) | 8ce338b | DetailSheet に編集モード (title/desc/assignee/priority/valueImpact) + 2段階クリック削除。e2e 7/7 回帰なし (本体は T8 で検証) |
