# Belvedere リファクタリング計画 (2026-06-10 策定)

> 策定: Fable 5 (計画専任) / 実行: Opus・Sonnet 等の実装モデル
> 本ドキュメントは **実行モデルが追加の判断なしで進められる粒度** で書く。
> 迷ったら「§1 不可侵リスト」と「§7 エスカレーション基準」に従うこと。

---

## 0. 前提 — なぜ「完全リファクタリング」をやらないか

- リポジトリは初 commit 2026-05-04 の **約 5 週間** もの。負債は実在するが規模は小〜中。
- ハッカソン提出 **2026-07-10 23:59** がハードデッドライン。提出後コード作業ゼロ方針。
- ROADMAP はバッファゼロ (Phase 1-D / 1-E / 3-A / 2 / 3-B / 3-C で全日程消化済)。
- 審査は「動くプロダクト + アイデア (B-1) + 実装力 (B-5)」。**ピカピカのコードベースでも
  Gemini + ADK の Orchestrator が無ければ負ける**。
- よって本計画は「全面改修」ではなく **(a) 公開リポジトリの恥の除去 (b) 既存ロードマップに
  寄生する形の負債返済** に絞る。それ以外は §8 パーキングロットへ明示的に先送りする。

---

## 1. 不可侵リスト (実行モデルは絶対に守ること)

1. **`packages/seed/src/*` はデフォルト編集禁止** (seed-guard hook が block する)。
   正当な変更は理由を会話に明記してから Bash heredoc 経由で行う。
2. **seed の ID 値 (`EP-1..4` / `US-101..402` / `WC-101..112`) は変更禁止**。PITCH / UI / test が参照。
3. **`EP-3` の `rationale` は空のまま維持** (Refinement デモの canonical case。test が固定している)。
4. **`packages/agent/src/prompts.ts` の英語 Agent 名と `Your role:` アンカーを保持**
   (Mock LLM `detectRole` が依存)。prompts.ts を編集したら **`mock-llm-reviewer` subagent と
   `agent-prompt-sync` skill を必ず実行**。
5. **廃止語を復活させない**: `WindEvent` / `風車` / `Kazaguruma` / `@kazaguruma/*` / 翼メタファー。
6. **会社識別子 (`***company-redacted***` / `***company-account-redacted***` / 会社メアド) をコード・コミットに混入させない**。
7. **commit は belvedere-commit skill 形式** (`[種別]要約` + 空行 + 理由)。1 commit = 1 論理変更。
   `git add -A` / `git add .` 禁止 (ファイル名明示)。
8. **e2e の `data-testid` 属性と Page Object の公開メソッド名を変えない** (CI が 6 シナリオで使用)。
9. **`LLM_PROVIDER` / `REPO_BACKEND` / `USE_REAL_ADK` の throw 挙動 (signpost) を消さない**。
10. 各フェーズ完了時の検証ゲート (§6) を **省略しない**。落ちたら直すまで次へ進まない。

---

## 2. 検証済み負債インベントリ

| # | 負債 | 場所 (検証済) | 種類 | リスク |
|---|---|---|---|---|
| D1 | **Reviewer Multimodal の死骸**。6/10 に ROADMAP から削除した機能を Agent prompt が今も謳う。`video.extractIssues` mock tool / `ReviewRecording` entity / Ticket の `sourceRecordingId` 等 4 フィールド / mock.ts の応答 | `packages/agent/src/prompts.ts:116-117` / `packages/tools/src/index.ts` / `packages/shared/src/{types,schemas}.ts` / `packages/llm/src/mock.ts` | 死コード + **デモ事故リスク** (存在しない機能を AI が説明する) | 🔴 高 |
| D2 | **Demo data と Live data の二重管理**。`DemoTicket` (独自 `Status: 'TODO'\|'DOING'`) を 18 ファイルが参照。shared の `Status: 'todo'\|'in-progress'` と型が衝突 | `apps/web/composables/useDemoData.ts` + screens/primitives 18 ファイル | 二重実装 | 🟡 中 (Phase 1-C で解消予定のもの) |
| D3 | `stripUndefined` が 2 実装 | `packages/repo/src/memory.ts` / `apps/api/src/handlers/ticket-handlers.ts` | 重複 | 🟢 低 |
| D4 | ID 採番が 3 箇所 + `Project.idPrefix` を無視した `WC-` ハードコード | `apps/mcp-server/src/server.ts` / `apps/api/src/handlers/{ticket,epic}-handlers.ts` | 重複 + 仕様乖離 | 🟡 中 |
| D5 | **mcp-server が API の CRUD ロジックを再実装** (belvedere_ticket_create 等)。Phase 1-D で API 経由化が決定済 | `apps/mcp-server/src/server.ts` | 重複 (解消予定あり) | 🟢 低 (1-D で死ぬ) |
| D6 | `ui:serve` script が存在しないディレクトリ `ui-mockups/` を参照 | `package.json:19` | 死設定 | 🟢 低 |
| D7 | `apps/orchestrator-py/uv.lock` が常時 dirty (M のまま放置) | git status | 運用ノイズ | 🟢 低 |
| D8 | US 紐付けが `parentTicketId が US-* で始まるか` の文字列ハック。今日合意した **チケット種別 (Story/Task/Spike/Bug/Incident) が型に無い** | `packages/tools/src/index.ts:119` / `packages/shared/src/types.ts` | モデル不足 | 🟡 中 (新機能の前提) |
| D9 | settings/profile の Whoami debug セクション (「削除予定」コメント付き) | `apps/web/pages/settings/profile.vue:108` | 意図的・期限付き | 🟢 低 (提出直前に削除) |
| D10 | email-allowlist bootstrap (Phase 1-E 招待 UI 完成後に削除予定と明記済) | `apps/api/src/config/email-allowlist.ts` | 意図的・期限付き | 🟢 低 (1-E で削除) |
| D11 | e2e robot が人間 UID 共用 → **本番 ws-belvedere に `WC-MQ7LN*` 等の e2e 失敗チケットが残存**。allowlist に robot-e2e エントリはあるが fixture が未切替 | `apps/e2e/fixtures/auth.fixture.ts` / 本番 Firestore | データ汚染 | 🟡 中 (デモ画面に映る) |
| D12 | **ts-typecheck hook が毎編集で全 11 workspace を typecheck** (1 編集 = 数十秒〜)。編集したパッケージだけで十分 | `.claude/hooks/ts-typecheck.sh` | プロセス浪費 | 🟡 中 (開発速度) |
| D13 | `UserStoryRepository` が空スタブ (seed なし、UI 側静的定義のまま) | `packages/repo/src/memory.ts` | 意図的スタブ | 🟢 低 (R4 で実体化検討) |

---

## 3. フェーズ構成 (実行順)

```
R0  計測と安全網確認          (30 分)  ← 任意。既に test 91 + e2e 6 + hooks があるので確認のみ
R1  公開リポジトリの恥の除去   (0.5 日) ← 提出前必須。D1 D6 D7 D12
R2  重複排除                  (0.5 日) ← D3 D4
R3  Demo/Live データ統一      (1.5 日) ← D2。※これは Phase 1-C の本体作業。追加コストではない
R4  チケット種別の導入         (1 日)   ← D8。今日合意した Story/Task/Spike/Bug/Incident + Refinement 新観点
R5  MCP の API 経由化         (Phase 1-D 内) ← D5。別計画 (1-D) に委譲、ここでは扱わない
R9  提出直前クリーンアップ     (7/8, 1 時間) ← D9 D11 の残骸掃除
PL  パーキングロット           (8/19 以降) ← §8
```

依存関係: R1 → R2 は独立 (並行可)。R3 は R2 の後推奨 (handler を触るため)。R4 は R3 の後 (UI が type を表示するため)。

---

## 4. フェーズ詳細 (実行モデル向け手順書)

### R0: 計測と安全網確認 (30 分 / 任意)

| 手順 | コマンド | 期待値 |
|---|---|---|
| 1 | `pnpm typecheck` | 11/11 Done |
| 2 | `pnpm test; echo "exit=$?"` | 91 passed / exit=0 |
| 3 | `gh run list --limit 3` | 直近 CI 緑 |
| 4 | ベースライン記録: `git rev-parse HEAD` をメモ | ロールバック地点 |

### R1: 公開リポジトリの恥の除去 (0.5 日)

**R1-1: Reviewer Multimodal 死骸の除去 (D1) — 本フェーズの中核**

> ⚠ prompts.ts と mock.ts を触るため、不可侵 §1-4 を厳守。
> 完了後に `mock-llm-reviewer` subagent と `agent-prompt-sync` skill を必ず実行。

| 手順 | 対象 | 内容 |
|---|---|---|
| 1 | `packages/agent/src/prompts.ts` | Reviewer Agent の「(b) レビュー会後: video.extractIssues で…Multimodal 直接読込」ブロックを削除。会前の役割 (デモシナリオ / preview URL 集) だけ残す。**英語 Agent 名 `Reviewer Agent` と `Your role:` アンカーは保持** |
| 2 | `apps/orchestrator-py/src/orchestrator/agents.py` | prompts.ts と同期している Reviewer instruction から同内容を削除 (agent-prompt-sync skill で差分確認) |
| 3 | `packages/tools/src/index.ts` | `videoExtractIssuesTool` 定義と return 配列からの参照を削除 |
| 4 | `packages/llm/src/mock.ts` | video.extractIssues を呼ぶ戦略 / 応答があれば削除。**detectRole の正規表現は触らない** |
| 5 | `packages/shared/src/types.ts` | `ReviewRecording` interface を削除。`Ticket` の `sourceRecordingId` / `sourceTimestampSec` / `sourceQuote` / `sourceSpeakerId` を削除 |
| 6 | `packages/shared/src/schemas.ts` | 上記 4 フィールドを TicketSchema から削除 (`Equal<>` drift check が同期を強制してくれる) |
| 7 | seed 確認 | `grep -rn "sourceQuote\|sourceRecordingId" packages/seed/` → ヒットしたら停止してユーザーに確認 (seed-guard 対象) |
| 8 | test / UI | `grep -rn "sourceQuote\|ReviewRecording" packages/ apps/ --include="*.ts" --include="*.vue"` で残骸ゼロを確認。memory.test.ts の parity test が `sourceQuote` を使っているので別フィールド (例: `description`) に書き換え |
| 9 | docs | `AGENT_DESIGN.md` / `DATA_MODEL.md` / `PITCH.md` から ReviewRecording / Multimodal 言及を削除 or「縮退済 (2026-06-10)」注記。`architecture-consistency-checker` subagent で docs↔code 整合を監査 |

commit 分割: (1) prompts+agents.py / (2) tools+mock / (3) shared types+schemas+test / (4) docs — の 4 commit。

**R1-2: 死設定の除去 (D6, D7, D12)**

| 手順 | 対象 | 内容 |
|---|---|---|
| 1 | `package.json` | `ui:serve` script を削除 (ui-mockups/ はもう存在しない) |
| 2 | `apps/orchestrator-py/uv.lock` | `git diff apps/orchestrator-py/uv.lock` で差分内容を確認 → 意図的な依存更新なら commit、無意味な再生成なら `git checkout -- apps/orchestrator-py/uv.lock` で破棄し、再発するなら原因 (uv run の自動更新) を `.claude/rules/languages/python.local.md` に記録 |
| 3 | `.claude/hooks/ts-typecheck.sh` | 全 workspace typecheck → **編集ファイルが属するパッケージのみ** `pnpm --filter <pkg> typecheck` に変更。パッケージ特定は file_path から `packages/X` / `apps/X` を抽出。`packages/shared` 編集時のみ全体実行 (依存が広いため)。週 1 回 or push 前は full typecheck (既に CI が担保) |

### R2: 重複排除 (0.5 日)

**R2-1: stripUndefined 統一 (D3)**

| 手順 | 内容 |
|---|---|
| 1 | `packages/shared/src/utils.ts` を新規作成し `stripUndefined` を 1 実装に (repo 版の `T` 返しと api 版の `Partial<NoUndefined<T>>` 返しは用途が違うので、ジェネリクスで両対応 or 2 関数 `stripUndefined` / `stripUndefinedPartial` として shared に置く) |
| 2 | `packages/shared/src/index.ts` から export |
| 3 | `packages/repo/src/memory.ts` / `apps/api/src/handlers/ticket-handlers.ts` を import に置換、ローカル実装削除 |
| 4 | `apps/api/src/handlers/epic-handlers.ts` の import 元も追従 |

**R2-2: ID 採番の一元化 (D4)**

| 手順 | 内容 |
|---|---|
| 1 | `packages/shared/src/utils.ts` (R2-1 と同居) に `generateTicketId(idPrefix: string)` / `generateEpicId(idPrefix: string)` を実装。`${idPrefix}-${Date.now().toString(36).toUpperCase()}` 形式 (現挙動維持) |
| 2 | 呼出 3 箇所 (`mcp-server/server.ts` / `ticket-handlers.ts` / `epic-handlers.ts`) を置換 |
| 3 | idPrefix は当面 `'WC'` / `'EP'` を渡す (現挙動維持)。**`Project.idPrefix` からの動的取得は R4 ではなくパーキングロット** (連番採番は Firestore トランザクションが要るため安易にやらない) |

検証: 両方とも §6 標準ゲート + `pnpm --filter @belvedere/api test` で CRUD 21 case 緑。

### R3: Demo/Live データ統一 (1.5 日 / = Phase 1-C 本体)

> これは「リファクタリング」ではなく Phase 1-C の残り本体。ROADMAP の 1-C 枠 (〜6/19) で実行。

| 手順 | 内容 |
|---|---|
| 1 | **seed を実データとして Firestore に置く方針を確認** (既に seed-firestore script あり)。UI は demo data ではなく `/api/tickets` を正とする |
| 2 | `apps/web/composables/useTickets.ts` を拡張: patch / delete / changeStatus を追加 (API は実装済) |
| 3 | `DemoTicket` 型 → shared `Ticket` 型への置換を **画面単位で 1 commit ずつ**: BacklogScreen → DailyScreen → PlanningScreen → ReviewScreen → RetroScreen の順 |
| 4 | 各画面の置換時、`Status` 大文字 (`'TODO'`) → shared 小文字 (`'todo'`) のマッピングを除去し、`StatusDot` / `TicketRow` / `DetailSheet` 等 primitives も shared 型に寄せる |
| 5 | `useChecks.ts` (AI Integrity の静的 check) は Phase 2 でリアル配線するため、**型だけ** shared に寄せて中身は維持 |
| 6 | 全画面置換後、`useDemoData.ts` から DemoTicket 配列を削除 (TEAM / SCREENS / CEREMONIES 等の UI 定数は `useUiMeta.ts` 等に移して維持) |
| 7 | e2e の Backlog Page Object を「Live セクション」前提から「全体が Live」前提に更新。`data-testid` は維持 |

各画面 commit ごとに §6 ゲート + `pnpm --filter @belvedere/e2e e2e` をローカル実行 (FIREBASE_SA_KEY 必要、無ければ push 後 CI で確認)。

### R4: チケット種別の導入 (1 日)

> 2026-06-10 にユーザーと合意した分類: **Story / Task / Spike / Bug / Incident** (NFR / Enabler / Impediment は不採用)。
> 詳細仕様 (各種別に何を書くか / どの儀式でどの AI が何を監査するか) は会話ログ参照。
> docs 永続化として `docs/agile-knowledge-base/ticket-types.md` を本フェーズ冒頭で書くこと。

| 手順 | 内容 |
|---|---|
| 1 | `docs/agile-knowledge-base/ticket-types.md` 新規: 5 種別の定義表 + PBI vs Task の線引き (claude.ai 議論の要約) + AI 監査マトリクス |
| 2 | `packages/shared/src/types.ts`: `export type TicketType = 'story' \| 'task' \| 'spike' \| 'bug' \| 'incident'` + `Ticket.type?: TicketType` を **optional で** 追加 (既存 seed を壊さない)。`relatedIncidentId?: string` も追加 |
| 3 | `schemas.ts` 同期 (drift check が強制) |
| 4 | seed への type 付与は **ユーザー承認後に** heredoc 経由で実施 (WC-101..112 を story/task に分類。ID は変更しない) |
| 5 | Refinement Agent 新観点を `packages/tools/src/index.ts` の `backlogRefinementCheckTool` に追加: **(7) 親なし Task** (`type==='task' && !parentTicketId?.startsWith('US-')`) / **(8) DoD 手続き的** (acceptanceCriteria の各行が `/^(実装|設計|テスト|対応|作成)/` 等の動詞始まりのみで構成 → 警告) / **(9) Bug なのに再現手順なし** (`type==='bug' && !description?.includes('再現')` は簡易版) |
| 6 | `packages/agent/src/prompts.ts` の Refinement を 6 観点 → 9 観点に更新 (**英語 Agent 名アンカー保持**) + `agents.py` 同期 + `mock-llm-reviewer` / `agent-prompt-sync` / `prompt-quality-reviewer` を実行 |
| 7 | 新観点の unit test を `packages/` 配下の該当 test に追加 (親なし Task 検出 / DoD 手続き的 / 再現手順なし、各 2-3 case) |
| 8 | UI: Backlog 行に type バッジ表示 (絵文字 or TypeMark 拡張)。新規作成ダイアログに type セレクタ + 「調査」を含む title なら spike を推奨表示 (inline 提案の最小版) |
| 9 | `DATA_MODEL.md` 更新 + `architecture-consistency-checker` で監査 |

> Incident の特殊動作 (Sprint 容量からの控除 / Daily の発生中警告 / 「Incident あったのに Bug 未起票」検出) は
> **Phase 3-A 以降の Agent 実装時に組み込む**。R4 では型とバッジと Refinement 3 観点まで。

### R9: 提出直前クリーンアップ (7/8 / 1 時間)

| 手順 | 内容 |
|---|---|
| 1 | `apps/web/pages/settings/profile.vue` の Debug セクション削除 (D9) |
| 2 | 本番 Firestore の e2e 汚染チケット掃除: `WC-MQ7LN*` 等 `labels` に `e2e-failure` を含む ws-belvedere チケットを削除するスクリプト実行 (D11)。※ robot の ws-e2e-test 切替が Phase 1-D までに済んでいればこの時点で汚染は増えていない |
| 3 | `grep -rn "削除予定\|FIXME\|XXX" apps/ packages/ --include="*.ts" --include="*.vue"` で残骸最終確認 |
| 4 | email-allowlist は Phase 1-E 完了済なら削除、未完なら維持 (D10) |

---## 5. 実行モデルの運用ルール (コスト最適化)

| 役割 | モデル | 担当 |
|---|---|---|
| 計画・設計・大規模判断 | **Fable** (高コスト・必要時のみ) | 本計画の改訂 / フェーズ完了レビュー / 設計上の岐路 |
| 実装・テスト・修正 | **Opus / Sonnet** | R1〜R4 の全手順 (本ドキュメントに従って機械的に実行) |
| 探索・一括検索 | Explore subagent (安価) | 影響範囲調査 / grep 系 |

実装モデルへの指示テンプレ:

```
docs/refactoring-plan.md の R<N> を実行して。
§1 不可侵リストと §6 検証ゲートを厳守。
§7 エスカレーション基準に該当したら作業を止めて報告。
```

## 6. 検証ゲート (各 commit 前に必須)

```
1. pnpm typecheck            → 11/11 Done (exit 0 を確認、tail だけで判断しない)
2. pnpm test; echo $?        → 全緑 / exit=0
3. belvedere-commit 形式で commit (1 commit = 1 論理変更)
4. push 後: post-push-check hook の出力を確認、in_progress の run は gh run watch
5. prompts.ts / mock.ts を触った commit は mock-llm-reviewer + agent-prompt-sync を実行済みであること
6. R3 の画面置換 commit は e2e (ローカル or CI) 緑であること
```

## 7. エスカレーション基準 (実行モデルは止まってユーザー or Fable に確認)

- seed (`packages/seed/src/*`) の変更が必要になった
- prompts.ts の変更で detectRole アンカーに触れる必要が出た
- 本計画に書かれていないファイルへの変更が 3 ファイル以上波及した
- 検証ゲートが 2 回連続で落ちて原因が特定できない
- PITCH.md / ROADMAP.md の内容変更が必要になった (日程・訴求の変更はユーザー判断)
- データモデルの required フィールド追加が必要になった (optional で済まないケース)

## 8. パーキングロット (8/19 以降 / 提出に寄与しないため先送り)

- `Project.idPrefix` ベースの連番採番 (Firestore トランザクション設計が必要)
- `UserStory` entity の実体化と seed 移管 (D13)
- Incident の Sprint 容量控除 / Postmortem テンプレ機能
- orchestrator-py の本格リアーキ (Phase 3-A で最小実装はやる)
- apps/cli の API 経由化 (現状 repo 直結のままで害なし)
- top-level *.md の統廃合 (PROJECT_PLAN と ROADMAP の重複整理等)

## 9. スケジュール織り込み案 (ユーザー承認待ち)

| 案 | 内容 | 追加コスト | 影響 |
|---|---|---|---|
| **A (推奨)** | R1+R2 を即実行 (1 日) → R3 を Phase 1-C として 6/19 まで → R4 を 1-C 末尾に追加 (+1 日) → R5 は 1-D 内 → R9 は 7/8 | 純増 ~2 日 | Phase 1-D 開始が 6/21→6/22 程度。3-A は死守 |
| B (最小) | R1 のみ即実行 (0.5 日)。R2/R4 は「余裕があれば」 | 純増 0.5 日 | デモ事故リスク (D1) だけ確実に消す |
| C (非推奨) | R0-R4 を直列で専念 (3-4 日) | 純増 3-4 日 | Phase 3-A (B-1 キラー) を圧迫。**ハッカソン目的に反する** |
