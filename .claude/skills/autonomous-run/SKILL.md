---
name: autonomous-run
description: Belvedere の標準開発フロー (計画→実装→検証→デプロイ→クローズ) を無人で回すプロトコル。Use this skill whenever the user says 自走 / 無人実行 / 夜間に進めて / 寝てる間に / 仕事中に進めて / おまかせで / autonomous, または複数タスクをまとめて任された時。各フェーズで使う skill / subagent / hook が決まっており、単発機能の呼び忘れを構造的に防ぐ。エスカレーション基準を満たす判断は実行せず朝の質問リストに積む。
color: purple
---

# Autonomous Run — 無人開発プロトコル

このプロジェクトの開発は **5 フェーズの標準フロー** で回す。有人時も無人時も同じフロー。
無人時はこの skill が「どこまで自分で判断してよいか」の境界を定義する。

## 開発フロー (フェーズ × 自動化対応表)

| フェーズ | 必ず使うもの | 自動発火 (hook) |
|---|---|---|
| 0. 計画 | TaskCreate でタスク分解。大規模方針変更クラス (project.md 参照) は A/B/C 案でユーザー確認。無人時は計画を提示してから着手 | — |
| 1. 実装 | 委譲ガイド (下記)。prompts.ts / agents.py 編集 → **agent-prompt-sync skill** + **mock-llm-reviewer subagent**。プロンプト品質を問う変更 → **prompt-quality-reviewer subagent** | seed-guard / identifier-guard / ts-typecheck / eraser-arch-watcher |
| 2. 検証 | `pnpm typecheck` (全 WS) + `pnpm test` → **belvedere-commit skill** で論理単位コミット | identifier-guard が staged diff を最終スキャン |
| 3. デプロイ/CI | push → `gh run watch`。**e2e 失敗時は CI 修正ループ (下記)**。UI 変更時は **§V スクショ検証 (下記)** | post-push-check が CI 状態を自動表示 |
| 4. クローズ | docs 更新 (大きな変更後は **architecture-consistency-checker subagent** で乖離監査)。ARCHITECTURE.md の Mermaid 変更 → **eraser-arch-sync skill**。ユーザー決定・経緯は memory へ。週次 or 7 日リマインダーで **hackathon-check skill** | eraser-sync-reminder / hackathon-check-periodic |

## 委譲ガイド (サブエージェントのモデル選択)

| タスクの性質 | モデル | 例 |
|---|---|---|
| 複数層 (shared→repo→api→web) の新機能、設計判断を含む実装 | **Opus** | RetroTry 永続化、Workspace 管理 |
| 定型実装・単一画面・e2e spec・docs パッチ適用 | **Sonnet** | Pull from backlog、非破壊 e2e |
| 監査・レビュー (読み取り専用) | 専用 subagent | architecture-consistency-checker / hackathon-compliance-auditor / mock-llm-reviewer / prompt-quality-reviewer |
| 設定・小修正・コミット・CI 監視・統合判断 | 自分 (orchestrator) | — |

委譲時の必須事項:
- **コミットはさせない** (オーケストレータが論理単位で行う)
- 並行委譲するときは**ファイル領域を割って指示に明記** (「これ以外は編集禁止」)
- 検証コマンド (typecheck/test) を実行させて結果を報告フォーマットで返させる
- CLAUDE.md / rules の規約 (.js 拡張子なし import / conditional spread / 造語禁止 等) をプロンプトに含める

## CI 修正ループ (e2e 失敗時 / 上限 3 周)

1. `gh run download <runId> -n playwright-results-<runId> -D <tmpdir>` で artifact 取得
2. `results.json` から失敗テスト + エラーメッセージを抽出 (strict mode violation / timeout / assertion を分類)
3. 原因を分類:
   - **コード起因** (新 UI が既存 locator を壊した等) → コンポーネント側を修正 (既存 e2e の前提を優先)
   - **テスト起因** (件数ベース assert が並行 run で破綻等) → テキスト存在ベース・自己清掃型に書き直す
   - **環境起因** (deploy 未完了 / path filter で e2e 未起動) → `gh workflow run e2e.yml --ref main` で手動 trigger
4. 修正 → belvedere-commit → push → 再監視
5. **3 周で直らなければ該当 spec を test.skip + 理由コメントにして朝の質問リストへ**

注意: deploy-web / deploy-api の 2 つの workflow_run から e2e が**並行 2 本**起動し同一 Workspace を共有する。
件数の厳密比較 assert は原理的に破綻するので書かない (テキスト存在ベース + 自己清掃が規約)。

## §V スクショ検証 (UI 変更時は必須)

1. e2e 成功後、playwright-results artifact の `screens/*.png` をダウンロード
2. 変更した画面の PNG を **Read で実際に見て** レイアウト崩れ・意図との乖離を目視判定
3. 乖離があれば修正してフェーズ 2 に戻る

## エスカレーション基準 (実行せず朝の質問リストへ)

1. **大規模方針変更クラス** (project.md の列挙: 再ブランド / データモデル改編 / 儀式の増減 / Agent 責務再定義 / autonomy デフォルト変更)
2. **破壊的・不可逆**: force push / 履歴書換 / データ削除 / seed 編集 / 共有 e2e WS の状態を恒久変更する操作
3. **ユーザー専権** (memory 規約): IAM / billing / secret / WIF / `--allow-unauthenticated` / 会社アカウント関連
4. **ハッカソン要件に関わる判断** (技術スタック変更・提出物の方針)
5. CI 修正ループ 3 周超え / 同一エラーの堂々巡り

## 朝レポート (終了時に必ず出す)

- 完了タスク表 (フェーズ 0 の計画と対応づけ)
- コミット一覧 (`git log --oneline`) + CI/e2e の最終状態
- **質問リスト** (エスカレーション項目 + 判断に迷った点)
- 残ギャップ (発見したが手を付けなかったもの)
- memory 更新 (ユーザー決定・非自明な経緯のみ)
