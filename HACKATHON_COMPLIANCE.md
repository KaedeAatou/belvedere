# Hackathon Compliance Tracker

> このリポジトリの最終目的: **DevOps × AI Agent Hackathon 2026 への応募・受賞**
> 一次情報: https://findy.notion.site/devops-ai-agent-hackathon-2026
> 最終ピッチ: 2026-08-19 (渋谷ストリーム)
> 最終チェック: 2026-06-19 (このファイルが古ければ Claude が再取得して更新する)
>
> **2026-06-19 監査ハイライト**: Notion を cursor 連鎖で完全再取得 (294 ブロック / スケジュールは table_row 全 9 行) → 開発要件 (実行プロダクト 4 群 / AI 技術 11 群) ・審査5基準・参加要件 (日本居住 18 歳以上 / 個人の私的活動 / 公務員等除外) ・スケジュール・応募方法 STEP①②③・賞金とも **差分ゼロ** (お知らせ最新 5/26 Elasticsearch Bootcamp のまま)。**今セッションの Agent 運用モデル確定を検証**: ① Orchestrator を「時刻ルーティング」→ **単一窓口 = 協議統括**へ実装変更 (`packages/tools/src/agent-invoke.ts` の `agent.invoke` で 5 儀式 agent を子として in-process 招集 / 深さ1固定・IDOR・コストキャップ / `app.ts` で request-scoped `childRuns` 収集 / `schemas.ts` で AgentRun.childRuns を z.lazy 自己参照)。prompts.ts / mock.ts / agents.py 同期済、detectRole anchor (`Agent-Id:` / `Your role:`) 無傷 → Mock LLM で協議が end-to-end で動く (web flag ④ `useOrchestratorWindow` 既定 OFF) ② **自律性を L1/L2 のみに統一** (L3/L4 不採用 / `AGENT_DESIGN.md §4`)。出力は AI パネル。**スケジュール / Pub-Sub 自動起動も不採用** (画面操作トリガのみ) ③ epic 必須化 (Story に親 Epic 必須 + インライン Epic 作成) / Review 指摘を reviewNotes 蓄積 / sprint.get IDOR fix。**🟡 検出 (中): Slack 連携は docs (AGENT_DESIGN/ARCHITECTURE) では「全除去」と明記済だが、コードに `slack.message.post` ツールが `buildTools` の tools 配列に push されたまま残存** (`packages/tools/src/index.ts:274,346` + `packages/shared/src/types.ts:341` `slackUserId`)。要件違反ではない (mock stdout / 提出物の主張は AI パネル) が、docs↔コード乖離 → 提出前に撤去推奨。**A-2 は 🟡 据え置き**: TS `GeminiLLMProvider` 本実装 + 無料枠キーで疎通確認済だが **本番 Cloud Run は `/health` で `"llm":"mock"`** (cloudbuild `_LLM_PROVIDER: mock` / Secret Manager にキー未注入 = ユーザー専権の残作業)、ADK は `agents.py` が `USE_REAL_ADK=true` で `NotImplementedError` の雛形のみ (実体の協議は TS runAgent)。**主 LLM (Gemini) / デプロイ先 (Cloud Run) / 自律性に縮退・差し替えゼロ** (anthropic/openai/vercel/lambda の混入は「Anthropic Prompting 101 準拠」コメントのみ)。実機: gcloud 個人アカウント + `belvedere-dev-atrium`、Cloud Run api/web 200 OK、会社識別子混入ゼロ、廃止語の実使用ゼロ (禁止リスト定義のみ)、typecheck 11/11 緑、**test 全緑 (shared 46 + llm 26 + agent 7 + tools 86 + api 201 + web 31 + repo 44 + mcp smoke 21)**。残クリティカルパス: A-2 本番 Gemini 切替 (Secret Manager 注入 = ユーザー) + ADK Runner (任意) / B-1 デモ動画 / B-4 ドッグフード数字 / Proto Pedia。提出 7/10 まで残り 21 日。
>
> **2026-05-01 Notion 更新検知**: Google Cloud クーポン (300ドル分) を申込者全員に配布開始 (5/7 以降登録メールアドレスへ送付)。Phase 1 GCP 立ち上げ予算が確保されたため、Cloud Run / Gemini 接続着手の障害が1段階下がった。
>
> **2026-05-11 Notion 更新検知**: 「Agentic AI Bootcamp 2026」(グーグル・クラウド・ジャパン主催) 申込受付開始。開催 6/1 (月) 〜 6/12 (金)。ADK / Gemini Enterprise Agent Platform / Cloud Run / Gemini API を実機ハンズオンで習得できる無料・事前申込制。(会期 6/12 で終了 / Belvedere は不参加判断)
>
> **2026-05-26 Notion 更新検知**: Elasticsearch 社による「Elastic Agent Builder 実践 Bootcamp」を 6/23 (火) 19:00–20:30 オンライン無料開催。A2A プロトコル経由で Elastic Agent を Gemini Enterprise に接続するハンズオン。利用チーム 1 組に「Findy Tools 記事化」特典あり。Belvedere は Vector Search で検討中の RAG 軸と直結 (`ROADMAP.md` Phase 3 / 7/18-)。
>
> **2026-06-08 監査ハイライト**: 前回チェック (5/6 夜) から **32 日間コミットゼロ** + Phase 1-B/C/D/E 全て未着手 (期限超過 5〜17 日)。Cloud Run /health は依然 200 OK (159ms / `belvedere-api-dev`) で **Phase 1-A 完了状態を保全**、GitHub repo public + MIT + `KaedeAatou` 個人アカウント維持、廃止語 (`Kazaguruma` / `風車` / `WindEvent` / 翼) のコード/docs 残骸ゼロ、会社識別子 (会社名 / 会社アカウント名) の混入ゼロ、`pnpm typecheck` 11/11 全通過。一方で Phase 1 全体 (6/9 = 明日) は事実上達成不能。**応募〆切 7/10 まで残り 32 日 — Phase 1-B/C/D/E 全部を 1 ヶ月で巻き取るか、Phase 1-D (MCP→Cloud Run) と Phase 1-E (動画) のみに絞った縮退ライン発動かをユーザーが判断する必要がある**。
>
> **2026-06-08 Notion 一次情報差分**: ルール / 開発要件 / 審査5基準 / 参加要件 / スケジュール (チーム提出までの全 9 マイルストーン) を Notion API で完全再取得し、`HACKATHON_COMPLIANCE.md` 記載内容と完全一致を確認 (差分ゼロ)。お知らせ欄の追加更新も 5/26 Elasticsearch Bootcamp が最新で、ルール本体に変更なし。`Cloud Run・Cloud Functions (旧 Cloud Functions)` の表記揺れは Cloud Functions 2nd gen 統合に伴う Notion 側の表記補正で実害なし。応募方法 STEP②/③ の詳細本文は Cloudflare ガードで syncRecordValues が弾かれたが、お知らせ欄に応募方法変更告知が存在しないため `§D` の記述で確度十分。
>
> **2026-06-12 監査ハイライト**: Notion 全 4 チャンク再取得 → 参加要件 / 開発要件 / 審査5基準 / スケジュール / 賞金とも **差分ゼロ** (お知らせ最新は 5/26 Elasticsearch Bootcamp のまま / STEP②/③ 詳細は今回も 403 → §D 既存記述で代替)。コード側は 6/10〜12 で 60+ commits の大幅前進: Phase 1-B 完了 (6/10) → Phase 1-C UI epic (R3 実 API 統一 / 種別バッジ / 見積もりポーカー / Refinement 専用画面 / DetailSheet 編集・削除 / velocity 基準統一) → **Phase 1-E マルチテナント前倒し完了 (6/12)** (Workspace 作成・切替・招待 API + UI) + RetroTry 永続化 + Sprint ライフサイクル API (planned→active)。Cloud Run は api/web とも 200 OK、typecheck 全通過、test 202/202 緑 (shared 12 + llm 15 + repo 30 + tools 34 + api 111)。**新規 🔴 検出: 会社メアドのフル文字列 <会社メアド (redacted)> が `apps/api/test/email-allowlist.test.ts:25` に公開リポジトリでハードコード** (negative assertion 目的だが、公開 repo に個人↔会社の紐付けを自ら掲示している状態 / `docs/setup-firebase-auth.md` `docs/setup-firestore-rules.md` にも 会社ドメイン ドメイン記載)。A-2 (Gemini/ADK 実呼び出し) は依然 🟡 — Phase 3-A (6/27-30) が提出前最後の本実装枠。
>
> **2026-06-17 監査ハイライト**: Notion を loadPageChunk + cursor 連鎖で完全再取得 (4 チャンク / 294 ユニークブロック / スケジュールは table_row として全 9 行取得) → 開発要件・審査5基準・参加要件・スケジュール・応募方法・賞金とも **差分ゼロ** (お知らせ最新 5/26 のまま)。**A-2 に実進展**: commit 71e5171 で TS の `GeminiLLMProvider` (`packages/llm/src/gemini.ts`) が throw → REST 直叩き本実装に昇格 (tool_calls 往復対応 / 単体テスト 6 件)。ただし signpost 不変 — ADK (`agents.py`) は `NotImplementedError` のまま / `GEMINI_API_KEY` 未設定で実トークン生成未検証 / 本番 Cloud Run は `/health` で `"llm":"mock"` → **A-2 は 🟡 据え置き (実体だけ前進)**。MCP→API HTTP 化 + 2 認証 (サービストークン / per-user API キー。Firebase refresh 経路は 2026-06-17 に attack surface 削減で廃止) + ドッグフード稼働も検証済。**主 LLM(Gemini)・デプロイ先(Cloud Run)・自律性に縮退/差し替えゼロ**。Cloud Run api/web 200 OK、gcloud 個人 `mygolanglearn@gmail.com` + `belvedere-dev-atrium`、会社識別子混入ゼロ、typecheck 11/11 緑、**test 325/325 緑** (243→325)。残るクリティカルパス: A-2 実トークン生成 + ADK Runner (Phase 3-A 6/27-30) / B-1 デモ動画 / B-4 ドッグフード数字 / Proto Pedia (7/8-10)。提出 7/10 まで残り 23 日。
>
> **2026-06-16 監査ハイライト**: Notion 公式ページを再帰クロール (BFS / 全 toggle 含む) で **完全再取得に成功** — 前回まで 403 で取れなかった「ルール本体 / 審査5基準 / 参加要件 / 利用規約 全 18 条 / 個人情報取り扱い / Q&A / 応募方法 STEP①②③ / 賞金」を全文取得し、`HACKATHON_COMPLIANCE.md` 記載と照合 → **差分ゼロ**。お知らせ最新は 5/26 Elasticsearch Bootcamp のまま。開発要件 (実行プロダクト 4 群 / AI 技術 11 群)・審査5基準・参加要件 (18 歳以上日本居住 / 個人の私的活動 / 公務員等除外 / 本名フルネーム登録必須) も Notion 原文と一致。**前回 🔴 (会社メアドのハードコード) は解消済を確認**: `apps/api/test/email-allowlist.test.ts:25` はダミー `someone@company.example` + gmail/`@belvedere.test` allowlist 検証に書き換わっており、`git grep` で全 tracked ファイル (docs 含む) に会社識別子 (会社名 / 会社ドメイン / 個人会社メアド) の実値混入ゼロ ([[memory: project-history-rewrite-state]] の filter-repo + 6/12 以降の修正で完全除去)。docs の警告文は generic「会社ドメインのメール」表現のみ。6/12〜16 で **110 commits** — 中身は全て DnD ライブラリ移行 (vue-draggable-plus / SortableJS) / 区画移動バグ / ⌘K / AI 指摘ピル更新 / generateId 衝突修正など UI 品質固め (縮退に当たる変更ゼロ)。Cloud Run api/web 200 OK (api 170ms `firestore` backend / web 115ms)、gcloud 個人 `mygolanglearn@gmail.com` + `belvedere-dev-atrium`、repo PUBLIC + MIT + KaedeAatou、typecheck 11/11 緑、**test 243/243 緑** (shared 13 + llm 15 + repo 35 + tools 34 + api 146 / 202→243 に増加)。残るクリティカルパスは前回同様 **A-2 Gemini/ADK 実呼び出し (Phase 3-A 6/27-30)** と **B-1 デモ動画 + B-4 ドッグフード数字 + Proto Pedia (Phase 1-D 6/20- / Phase 3-C 7/8-10)**。提出 7/10 まで残り 24 日。

---

## ステータス凡例

- 🟢 充足: 現コードで要件を満たしている
- 🟡 計画: 設計・スキャフォールドはあるが未実装
- 🔴 リスク: 充足の見通しが不明 / 行動が必要
- ⚪ 未該当: 任意要件 / 採用していない

---

## A. 開発要件 (どちらも必須)

### A-1. GCP アプリケーション実行プロダクトを1つ以上採用

| 候補 | 採用 | 状態 | 根拠 |
|---|---|---|---|
| **Cloud Run** | ✅ 採用 | 🟢 **充足 (2026-05-06)** | `belvedere-api-dev` が `asia-northeast1` で起動 (`https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health` が 200 を返す状態を確認)。WIF 鍵レス CI/CD で自動 deploy 動作確認済 (commit 4224ba6 / 4 回目の試行で完全グリーン)。GCP リソース命名は `belvedere-` で統一 (`belvedere-runtime` / `belvedere-deployer` / `belvedere-ci-pool` / `belvedere-ci-github`)。`apps/api/Dockerfile` は single-stage 化済 (pnpm workspace symlink 維持のため) |
| Cloud Functions | — | ⚪ | 縮退オプションとして保持 (`ROADMAP.md` 中止判断ライン参照) |
| GKE | — | ⚪ | 個人参加では運用負荷大 |
| App Engine | — | ⚪ | レガシー扱いのため不採用 |
| Cloud TPU/GPU | — | ⚪ | 推論はサーバーレスで足りる想定 |

**充足条件**: Cloud Run に `belvedere-api` がデプロイされ、`https://...run.app/health` が 200 を返す状態。✅ 2026-05-06 達成
**Phase 1 期限**: 2026-05-17 (`ROADMAP.md`)

### A-2. GCP AI 技術を1つ以上採用

| 候補 | 採用 | 状態 | 根拠 |
|---|---|---|---|
| **Gemini API** | ✅ 採用 | 🟡 計画 (TS provider 本実装 + 無料枠キー疎通確認済 / 2026-06-18) | **`packages/llm/src/gemini.ts` で `GeminiLLMProvider` を本実装** (commit 71e5171)。`generativelanguage.googleapis.com/v1beta` REST を直叩き (SDK 不使用 / fetch 注入でテスト可)、LLMProvider 抽象を Gemini にマップ (system→systemInstruction / assistant.toolCalls→functionCall / tool→functionResponse / req.tools→functionDeclarations / responseSchema→generationConfig / usageMetadata→概算コスト)。`factory.ts` は `LLM_PROVIDER=gemini` で `GeminiLLMProvider(GEMINI_API_KEY)`、キー未設定なら constructor throw (signpost 維持)。`vertex` は未採用で throw。**2026-06-18: 無料枠 API キーで実トークン生成の疎通成功を確認** ([[memory: project-gemini-connection-state]])。**残り (= ユーザー専権 + 配線)**: ① **本番 Cloud Run は依然 `LLM_PROVIDER=mock`** (`infra/cloudbuild.yaml` `_LLM_PROVIDER: mock` / `/health` で `"llm":"mock"`)。Secret Manager にキーを注入し本番を gemini に切替えるのがユーザー残作業 (GCP クレジットは Gemini prepay に効かず無料枠キー運用)、② デモシーン用に AI パネル経路で gemini を 1 回踏む配線・撮影 |
| **ADK (Agents Development Kit)** | ✅ 採用 | 🟡 計画 | `apps/orchestrator-py/pyproject.toml` に `google-adk>=0.5` / `google-genai>=0.3` 依存追加済 / `agents.py` に5儀式 (planner/refinement/daily/reviewer/retrospective) + Orchestrator の INSTRUCTION 雛形完備 / `build_agents(use_real_adk=True)` で `NotImplementedError` raise (silent fallback なし)。本物実装は `USE_REAL_ADK=true` 切替待ち |
| Gemini Enterprise Agent Platform (旧 Vertex AI) | — | ⚪ | Notion 公式リスト (2026-05-01 確認) では「旧Vertex AI」表記。Gemini API + ADK で十分。観測やデータ管理で必要なら追加 |
| Vector Search | 🟡 検討 | ⚪ | 過去ふりかえり検索で使う案あり (`AGENT_DESIGN.md`)。Phase 2 後半で検討 |
| Gemini 2.5 Pro Multimodal (動画入力) | ⚪ 不採用 (2026-06-10 縮退) | — | Reviewer Multimodal (録画→指摘抽出) は縮退削除。キラーシーンは **Orchestrator マルチエージェント + チケット種別ルールエンジン (17 観点) + 見積もりポーカー** に置換 |
| Speech-to-Text / TTS | — | ⚪ 不採用 | 録画機能の縮退により用途消滅 |
| Gemma / Imagen / Vision / NLP / Translation | — | ⚪ | 必要に応じて追加 |

**充足条件**: 本物の Gemini 推論が1回でも走る (= 実 API キーで実際にトークンが生成される) こと。ADK Runner 経由なら万全だが、TS の `GeminiLLMProvider` 経由 (CLI/API) でも A-2「Gemini API」採用の実体は成立する。
**実装期限**: **Phase 3-A (2026-06-27 〜 06-30)** が提出 (7/10) 前最後の本実装枠。縮退ライン (6/30): 雛形 + Gemini 1 回呼び出しまで縮退しても A-2 要件は死守 (`ROADMAP.md` 中止判断ライン)。**2026-06-17 時点で進展**: `gemini.ts` (TS provider) が throw → 本実装に昇格 (REST 直叩き / tool_calls 往復対応 / 単体テスト 6 件緑)。一方 `agents.py` は依然 `use_real_adk=True` で `NotImplementedError` (= ADK Runner 経由の実呼び出しは未着手)、`GEMINI_API_KEY` 未設定で実トークン生成は未検証、本番 Cloud Run は `LLM_PROVIDER=mock` のまま。**= signpost を破らず TS 側だけ前倒し実装した状態**。

---

## B. 審査5基準

### B-1. AIエージェントが価値の中心になっているか 🔥 最重要

| 観点 | 状態 | エビデンス / リスク |
|---|---|---|
| 単機能ではない (複数ツール組み合わせ) | 🟢 充足 (Mock) | `packages/agent/src/runtime.ts` で `thought → tool_call → tool_result → output` の反復ループ実装。Mock LLM が儀式別に複数 tool call sequence を返す |
| 自律的な判断と実行 | 🟢 充足 (Mock / 運用モデル確定 2026-06-18) | 自律性は **L1/L2 のみに確定** (`AGENT_DESIGN.md §4` / L3/L4 自律実行は不採用 — スケジュール起動を持たないため)。全 6 ロール (5 儀式 + Orchestrator) が画面操作で同期起動 → 提案 → 人が承認/適用。提案内容はルールエンジン (17 観点) + retro Try + knowledge.search を根拠に source ID 引用 |
| 同期トリガ (画面操作) | 🟢 充足 (実装 2026-06-18) | 画面操作トリガのみで同期起動 (Cloud Scheduler / Pub-Sub による時間・イベント自動起動は**不採用**)。**Orchestrator が単一窓口 = 協議統括として該当 Agent を `agent.invoke` で子招集** (`packages/tools/src/agent-invoke.ts` / 深さ1固定で再帰不能・IDOR・コストキャップ / `app.ts` で request-scoped `childRuns` に協議結果を収集)。Mock LLM で協議が end-to-end で動作 (web flag `useOrchestratorWindow` 既定 OFF で回帰ゼロ) |
| AIエージェントである必然性 | 🟢 充足 | `PRODUCT_BRIEF.md §5` の「単なる機能 vs エージェント」表で言語化済。**Orchestrator が単一窓口として 5 Agent を協議編成する ADK マルチエージェント**が「他 LLM でなく Gemini である必然性」(宣言的編成) |
| マルチエージェント構成 | 🟢 充足 (Mock) | 5儀式エージェント (Planner / Refinement / Daily / Reviewer / Retrospective) + Orchestrator が `packages/agent/src/prompts.ts` `PER_AGENT` で定義済。各 Agent はチケット種別ルールエンジン (17 観点) を共有。Mock では役割別動作確認済。本物 ADK 連携は GCP セットアップ後 |
| ピッチ用デモ動画 | 🔴 未撮影 | 「自律的に動いた結果」を 90秒で見せる動画素材が無い。基準①の最大リスク。**Proto Pedia 必須要件 (YouTube/Vimeo URL)** でもあり、撮影枠は Phase 3-C (7/8-10) のみ = バッファゼロ |
| マルチエージェントへのコンテキスト供給 | 🟢 充足 (2026-06-11) | `retro.tries.list` Tool 追加で Retro 積み上げ Try (Firestore 永続) を儀式 Agent のコンテキストに供給。チケット種別ルールエンジン (17 観点) + 見積もりポーカー (サーバ側隠蔽強制) も Agent が参照する判断材料として配線済 |

**リスク**: ピッチ時に「便利な要約Bot」と見えたら基準①敗北。デモシナリオ (`PITCH.md §4`) で90秒以内に "自律的に動いた結果" を見せられるかを2026-08-13 リハーサルで検証。

### B-2. 設定した課題へのアプローチ力

| 観点 | 状態 | エビデンス |
|---|---|---|
| 課題の妥当性 | 🟢 | 「儀式は回っているのにプロダクトが前進しない / なんちゃってアジャイル」 (`PRODUCT_BRIEF.md §2`) |
| 対象ユーザーの明確さ | 🟢 | SM/EM/PO/Dev の4役割それぞれのペインを言語化 (`§3`) |
| 提供価値のストーリー一貫性 | 🟢 | 「形骸化したスクラムを AI が品質と運営で底上げ」軸で貫通。比喩 (螺旋階段の眺望) は冒頭で明示 |
| 新規性 | 🟡 | 既存ツール (Atlassian Intelligence / ScrumGenius) との差別化を `§6` に記載 |

### B-3. ユーザビリティ

| 観点 | 状態 | エビデンス |
|---|---|---|
| 直観的 UI | 🟢 充足 (Web ↔ API ↔ Firestore 一気通貫) | **2026-06-11 R3 完了で全画面が DemoTicket から shared Ticket (実 API) に統一** — Web (Cloud Run) → API (Cloud Run / Firebase Auth 必須) → Firestore の実データで描画。チケット CRUD (作成ダイアログ種別セレクタ / DetailSheet 編集 + 2 段階削除) / 見積もりポーカー (DetailSheet 内パネル / 隠蔽はサーバ側強制) / 種別バッジ + finding ピル / Planning「Pull from backlog」複数選択投入 / Sprint goal・期間編集 + 開始 (planned→active) / Retro Try carry-forward d&d / Workspace 切替 + 管理画面 (作成・メンバー一覧・招待)。スクリーンショット巡回 e2e で視覚自己検証 |
| 儀式別画面 (差別化軸) | 🟢 充足 (6 枚に拡大) | Jira の単一 Sprint Board に対し、Planning / Daily / **Refinement (2026-06-11 専用画面 T9 追加 — findings ワークキュー)** / Review / Retro + Backlog の 6 枚を専用画面化。画面識別は左レール、KPI バーは velocity 軸で再表現 (capacity 語彙は 2026-06-11 全廃) |
| 階層の情報設計 | 🟢 | Goal › Story › Task の3階層、SP / valueImpact / status / flag を1画面に圧縮表示 |
| ナビゲーション | 🟢 | Shell + RailPanel の2ペイン構成。AIPanel が常時 AI Integrity Signal を表示 |
| 高密度 (Jira問題への対処) | 🟢 | TicketRow を圧縮グリッドに展開し、スクロール無しで全タスクが1画面に見える設計 |
| コラボ表現 | 🟡 計画 | アバタースタックは表示あり (Avatar primitive) / ライブカーソルや Activity ログは UI 表示のみ実機能は未実装 |
| アクセシビリティ | ⚪ 意図的スコープ外 (2026-06-10 確定) | Phase 4 全面削除に伴い a11y 監査はカット。「7/11 以降コード作業ゼロ」方針による意識的な縮退判断 (`ROADMAP.md`) |

**リスク**: Web ↔ API 接続は **2026-06-11 R3 で達成済** (旧課題 (1) 解消)。残る最大課題は Mock LLM ではなく Gemini 経由でリアルタイムに AI Integrity Signal を生成すること (Phase 3-A 6/27-30 + Phase 2 配線 7/1-3)。AI Integrity Panel が Mock のまま提出になると「動く SaaS だが AI は飾り」と見える — B-1 と連動する提出前最重要リスク。

### B-4. 実用性・体験価値の魅力

| 観点 | 状態 | エビデンス |
|---|---|---|
| 体験の驚き | 🟡 計画 | 「儀式の前後で何かが片付いている」(`PRODUCT_BRIEF.md §7`) — デモで再現が必要 |
| 実利用検証 | 🟢 **開始 (2026-06-17)** | ドッグフードを Phase 1-D 前倒しで開始。MCP を**本人 (per-user API キー)** で ws-belvedere-dev に接続し、`belvedere-ticket-cycle` skill + `/loop 1h` で「web 起票→MCP→実装→デプロイ→review (done はユーザー受け入れ)」を毎時自動巡回。自分が起票したバグ/US を実際に MCP 経由で修正・デプロイ・review した実績あり (WC-9460f690 SP ポーカー化 / WC-c6d339fb スプリント名表示) |
| 数字で語れる効果 | 🟡 計測開始可能 (2026-06-17) | ドッグフードサイクル稼働で「Belvedere 管理チケット数 N / ルールエンジン品質指摘 M / MCP 経由で修正したバグ数」を 6/17〜7/8 で蓄積可能に。Proto Pedia ストーリーに載せる定量ログを取り始める段階 |

**リスク**: ピッチで「実際に使ったら〇〇減りました」と言える数字が無いと基準④で苦戦。ドッグフードは Phase 1-D (6/20-24) 開始が事実上の最終機会。

### B-5. 実装力

| 観点 | 状態 | エビデンス |
|---|---|---|
| 技術選定の納得度 | 🟢 | `ARCHITECTURE.md` で案A/B/C比較 / Cloud Run + Gemini + Firestore の理由言語化 |
| 拡張性 | 🟢 | LLMプロバイダ抽象 (`packages/llm/`) / Repository抽象 (`packages/repo/` の RepoContainer = tickets/sprints/projects/epics/stories/members/ceremonies/agentRuns/ceremonyHealth) / Tool factory (`buildTools(repo)`) ですべて差し替え式 |
| 実運用への配慮 | 🟡 | Secret Manager / WIF / Cloud Logging / 課金アラート / OWASP リリースゲート (WC-110) を設計 |
| コード品質 | 🟢 | TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes / Python mypy strict + ruff / `pnpm typecheck` 全 11 ワークスペース通過 (2026-06-19 確認) / **vitest 全緑** (shared 46 + llm 26 + agent 7 + tools 86 + api 201 + web 31 + repo 44 + mcp smoke 21 / 2026-06-19 確認 / Orchestrator agent.invoke 検証 + childRuns z.lazy schema + epic 必須化 + sprint.get IDOR テスト分が増加) + GitHub Actions CI で `pnpm test` 自動実行 + **e2e workflow (e2e.yml) + スクリーンショット巡回 e2e + 実 pointer/SortableJS d&d e2e + layout 回帰ガード** / **zod runtime validation** (firestore.ts read 経路で safeParse + drift detection) / **prompts XML 構造化** (Anthropic Prompting 101 準拠、TS↔Python 同期) |
| GCPサービス活用度 | 🟡 計画 | 稼働中: Cloud Run (api/web) / Firestore / Cloud Build / WIF / Secret Manager (Firebase config)。設計上: Gemini API (本番切替待ち) + ADK (orchestrator-py 雛形) / Cloud Logging / Trace。**2026-06-18 で Pub/Sub・Cloud Scheduler は不採用に確定** (自律性 L1/L2 / 画面操作トリガのみ — 自動イベント配送・スケジュール起動を持たない)。Vector Search/Elastic RAG は土台のみ (SEARCH_BACKEND 未設定で本番無効) |
| 多階層モノレポ構成 | 🟢 | TS workspace 9 packages + Python uv workspace 1 (orchestrator-py)。shared / seed / repo / tools / llm / agent の依存方向が一方向 (循環なし) |

---

## C. 参加要件 (人の側) 🔥 アウト即失格

| 観点 | 状態 | 根拠 / 確認手段 |
|---|---|---|
| 日本居住 | 🟢 | `memory/user_cloud_background.md` (日本居住者) |
| 18歳以上 | 🟢 | (確認済) |
| **個人の私的活動** として参加 | 🟢 維持確認 (2026-06-12) | git author/committer 全コミット `mygolanglearn@gmail.com` のみ / GCP プロジェクト `belvedere-dev-atrium` (会社名なし) + アカウント `mygolanglearn@gmail.com` / README・コミットに「会社業務として」を示唆する記述なし |
| 国家公務員等でない | 🟢 | 民間企業所属 |
| 個人 Google アカウントで GCP 利用 | 🟢 充足 (2026-05-06〜) | `belvedere-dev-atrium` を個人 `mygolanglearn@gmail.com` で作成・運用 (`gcloud config` 実機確認 2026-06-12)。ハッカソンクーポン + Free Trial 計 ¥95,714 適用済 (2026-05-09) |
| 個人 GitHub リポジトリで管理 | 🟢 充足 (2026-05-06〜) | `https://github.com/KaedeAatou/belvedere` — **public / MIT / owner KaedeAatou** を 2026-06-12 に `gh repo view` で再確認。CI (ci/e2e/deploy-api/deploy-web) は WIF 鍵レスで稼働 |
| seed データから会社情報の露出 | 🟢 解決 (2026-05-04) | `packages/seed/src/members.ts` の会社メールを `@example.com` ダミードメインに差し替え済 |
| **会社メアド文字列の公開 repo 混入** | 🟢 **解決 (2026-06-16 確認)** | 前回 🔴 だった `apps/api/test/email-allowlist.test.ts` の会社メアドフル文字列は、ダミー `someone@company.example` + 「allowlist は gmail / `@belvedere.test` のみ」検証へ書き換え済。2026-06-16 に `git grep` で全 tracked ファイル (docs 含む) を走査 → 会社名 / 会社ドメイン / 個人会社メアドの実値混入ゼロ。docs の注意書きは generic「会社ドメインのメール」表現のみ。[[memory: project-history-rewrite-state]] の filter-repo (6/12) で git history からも除去済 |

**ガード**: `docs/setup-gcp.md` §0 の警告 + `memory/hackathon_compliance.md` で Claude 側からも警告を出す。

---

## D. スケジュール要件

> **2026-05-06 Notion 再取得で全マイルストーン確定**: 前回チェック (2026-05-04) で「Coming Soon」だった応募方法・スケジュールが完全公開された。**中間提出は無し**。7/10 一発提出 → 一次/二次審査 → 7/30 通知 → 8/19 最終ピッチ。

| イベント | 日付 | 状態 |
|---|---|---|
| Google Cloud 300ドルクーポン配布開始 | 2026-05-07 以降 | 🟢 確認 (申込済参加者には登録メールアドレスへ送付) |
| ① 参加登録 (Findy Conference) | 2026-04-27 10:00 〜 2026-07-10 23:59 | 🟢 完了推定 (ハッカソンクーポン ¥47,867 を 2026-05-09 受領・適用済 = 申込者限定配布のため登録済の傍証) |
| ② チームビルディングイベント (オフライン) | 2026-06-07 (日) 13:00–18:00 / ファインディ株式会社 イベントスペース | ⚪ 終了 (不参加 / 個人参加方針維持) |
| ③ Boot Camp (Agentic AI Bootcamp 2026) | 2026-06-01 〜 06-12 / オンライン無料 / 事前申込制 | ⚪ 会期終了 (不参加判断 / `ROADMAP.md`)。Elasticsearch Bootcamp 6/23 は任意 |
| ④ **作品提出〆切 (Proto Pedia + Google Form)** | **2026-07-10 (金) 23:59 — 残り 21 日** | 🔴 必須 3 件のうち Proto Pedia URL (動画 + アーキ図 + ストーリー + `findy_hackathon` タグ) が未着手。公開 GitHub URL 🟢 / デプロイ URL 🟢 は充足済 |
| ⑤ 一次審査 (運営事務局) | 2026-07-13 (月) 〜 17 (金) | — 通過依存 |
| ⑥ 二次審査 (外部有識者) | 2026-07-21 (火) 〜 24 (金) | — 通過依存 |
| ⑦ 受賞&決勝進出通知 | 2026-07-30 (木) | — サイト + Google Cloud Japan ブログ |
| ⑧ 最終ピッチ (10チーム招待) | 2026-08-19 (水) Google 渋谷オフィス (渋谷ストリーム) | — 通過依存 |
| ⑨ アフターイベント | 2026-09 予定 (オンライン) | — |

### 応募方法 (3 STEP)

- **STEP①**: Findy Conference 申込フォームから参加登録 (チームでも全員必須 / クーポン受信メールアドレス確認)
- **STEP②**: Proto Pedia に作品登録 (アカウント要)
- **STEP③**: 作品提出フォーム (Google Form) で正式エントリー — 必須 3 件:
  1. **公開** GitHub リポジトリ URL ← 🟢 `https://github.com/KaedeAatou/belvedere` (2026-05-06 public 化完了 / MIT License / 8 観点安全チェッククリア)
  2. デプロイしたプロジェクト URL ← 🟢 `https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health` 200 OK 稼働中
  3. Proto Pedia 作品 URL

### Proto Pedia 登録必須項目 (STEP②)

- 作品ステータス / タイトル / 概要
- **動画 (YouTube または Vimeo URL) — 必須**
- **システムアーキテクチャ図 — 必須** (アップロード)
- 開発素材 / **タグに `findy_hackathon` を含める**
- ストーリー (必須): ①課題と背景 ②利用ユーザー ③特徴

### 賞金

- 最優秀賞 50 万円 (1 作品) / 優秀賞 30 万円 (3 作品) / 特別賞 10 万円 (6 作品) / 総額 200 万円

### 自社マイルストーン (`ROADMAP.md` / 2026-06-10 全面再構成 — Phase 4 削除 / 7/11 以降コード作業ゼロ)

| マイルストーン | 期限 | 状態 (2026-06-12) |
|---|---|---|
| Phase 0: ローカル基盤 (Mock LLM / Web UI / MCP CRUD) | 2026-05-12 | ✅ 完了 |
| Phase 1-A: GCP セットアップ + WIF CI/CD | 2026-05-06 | ✅ 完了 |
| Phase 1-Day0: Web を Cloud Run にデプロイ | 2026-06-08 | ✅ 完了 (Nuxt 3 SSR / 200 OK) |
| Phase 1-B: Firebase Auth + IDOR fix + ログイン UI + Firestore Rules | 2026-06-14 | ✅ **完了 (2026-06-10 / 4 日前倒し)** |
| Phase 1-C: Web UI CRUD (R3 実 API 統一 + 種別/ポーカー/Refinement 画面 + Sprint ライフサイクル + RetroTry 永続化) | 2026-06-19 | 🟢 **ほぼ完了 (6/11-12 で主要タスク完走)** — 縮退ライン 6/19 は余裕 |
| Phase 1-E: マルチテナント (Workspace 作成・切替・招待) | 2026-06-26 | ✅ **前倒し完了 (2026-06-12)** — Workspace 管理 API + UI + ログイン時自動加入 |
| Phase 1-D: MCP を Cloud Run へ + ドッグフード開始 | 2026-06-24 | 🟡 待機 (次の着手対象 / B-4 の数字取りの起点) |
| **Phase 3-A: Gemini + ADK + Orchestrator Multi-Agent** ★ A-2 要件 + B-1 キラー | **2026-06-30** | 🟡 **大幅前進 (2026-06-18)**: Orchestrator 単一窓口の協議 (`agent.invoke` / childRuns) を Mock で実装完了 + Gemini provider 本実装 + 無料枠キー疎通確認済。**残り = 本番 Cloud Run を gemini に切替 (Secret Manager 注入 / ユーザー専権) + AI パネルで gemini を 1 回踏む配線**。ADK Runner (agents.py) は雛形のまま (任意 / TS runAgent が協議の実体)。縮退ライン: 本番 Gemini 1 回呼び出しで A-2 死守 |
| Phase 2: Pub/Sub + AI Integrity Panel リアル配線 | 2026-07-03 | 🟡 待機 (不調時は API 同期実行 + Web polling に縮退) |
| Phase 3-B: Elastic + Gemini RAG | 2026-07-07 | 🟡 任意 (時間切れなら削る) |
| Phase 3-C: 提出準備 (ピッチ動画 / アーキ図 / Proto Pedia / 応募フォーム) | 2026-07-08 〜 07-10 | 🔴 未着手 (バッファゼロ + 徹夜カバー前提) |
| ~~Phase 4: 仕上げ (a11y / OWASP / リハ)~~ | ~~2026-08-19~~ | ⚪ 全面削除 (2026-06-10 決定 / 8/19 ピッチは提出物そのまま) |

---

## E. 技術スタック差し戻し条件 (= ハッカソン要件違反)

以下の判断は要件違反のため **絶対にしない**:

- ❌ Gemini ではなく Anthropic Claude / OpenAI GPT を主LLMにする
- ❌ Cloud Run ではなく Vercel / AWS Lambda / Render にデプロイする
- ❌ 自律性を削って「ボタン押したら要約するだけ」のツールに縮退
- ❌ 会社の Google Workspace アカウントで GCP プロジェクトを作る
- ❌ チームビルディング後にチーム結成して、個人参加要件 (個人の私的活動) を破る運用にする

---

## F. 定期チェック運用

このファイルは Single Source of Truth ではない (一次情報は Notion)。
チェックの頻度・手段:

| トリガ | 手段 | 担当 |
|---|---|---|
| ユーザーが思い立った時 | `/hackathon-check` Skill 実行 | ユーザー → Claude |
| 大きな技術変更 (LLM変更 / インフラ変更等) | `hackathon-compliance-auditor` Subagent を Claude が自動呼出 | Claude |
| 週次 (推奨) | スケジュール式実行 (`/loop` または `/schedule`) | ユーザー設定式 |
| 毎週末 | 設計ドキュメント整合性チェックと同時に | `architecture-consistency-checker` Subagent |
| 応募方法/スケジュール公開時 | Notion 再取得 → このファイル §D 更新 | Claude |

---

## G. 履歴

| 日付 | 変更 |
|---|---|
| 2026-04-29 | 初版作成 |
| 2026-04-30 | UI採用案を `ui-mockups-v3/cases/13-hand-digital.html` (Hand × Digital) に確定。B-3 ユーザビリティを更新 (高密度化 + コラボ表現追加) |
| 2026-05-04 | 大規模変更を反映: ① Belvedere 再ブランド (旧 Kazaguruma / 風車) ② Project エンティティ追加 (Workspace > Project > Epic > Story > Task / `idPrefix` 可変、default `PRJ-belvedere-core`) ③ Refinement Agent 追加 (5番目の儀式 agent、SP > 8 / valueImpact 未設定 / priority × valueImpact ミスマッチ等を診断) ④ UI を Nuxt 3 + Vue 3 に切替、Claude Designer から 5 画面 SFC を取り込み (Backlog/Planning/Daily/Review/Retro + Shell/RailPanel/AIPanel/DetailSheet + 6 primitives = 17 SFC) ⑤ `.claude/rules/` で TS/Python/Vue/FastAPI のプロジェクト固有パターンを文書化 ⑥ memory ファイル整理 (`feedback_no_neologisms.md` / `product_name.md` / `project_ceremony_scheme.md` 等) ⑦ Notion 一次情報で Google Cloud 300ドルクーポン配布告知を確認 (2026-05-01 更新)。⑧ 新規リスク発見: git 未初期化 / seed の会社メール露出。 |
| 2026-05-04 (夜) | **Reviewer Agent に Multimodal 機能を追加**: ① Sprint Review 録画 → 指摘抽出 → Ticket 起票候補のフロー (Gemini 2.5 Pro Multimodal で動画直接入力) ② `ReviewRecording` エンティティ + Ticket に `sourceRecordingId / sourceTimestampSec / sourceQuote / sourceSpeakerId` 追加 ③ `video.extractIssues` Tool 新設 (Mock 実装で 3 候補返す) ④ Speech-to-Text 不採用判定 (Multimodal が代替) ⑤ PITCH §4 デモ #5 を Multimodal キラーシーン (20秒) に差し替え ⑥ §5 差別化表に Multimodal 軸追加 (= 「Gemini である必然性」への直接回答) ⑦ Phase 2 ROADMAP に 5 日タスク追加。Cloud Storage の用途を Sprint Review 録画に変更。 |
| 2026-05-05 | **Refinement Agent に第 6 観点「戦略整合性」追加**: ① Epic に `rationale` (戦略意図 / Why) + `successMetric` (達成判定の数値指標) + `strategicTheme` (上位戦略テーマ) を追加 (TS / Pydantic 同期) ② `backlog.refinement.check` Tool に `strategic_intent_missing` シグナルを実装 (Epic.rationale 欠落の検出ロジックは本物。CLI で seed の EP-3 の意図的 rationale 欠落を検出することを確認済) ③ 5 → 6 観点に prompts.ts / agents.py 同期更新 ④ seed/epics.ts 全 4 Epic に rationale / successMetric / strategicTheme 追加 (EP-3 のみ意図的に rationale 空のまま = デモ用形骸化サンプル) ⑤ PRODUCT_BRIEF §2 に「戦略の不在」課題追加、PITCH §2 / デモ #4 に EP-3 rationale 欠落シーン組込み。「戦略があるから開発するはずだが、開発者は Why を見失っている」課題への直接対応。 |
| 2026-05-05 (夜) | **ユーザー GitHub 連携を Phase 3 へ後ろ倒し**: Eraser 図の混乱 (1 個の GitHub アイコンが「ユーザーチームのリポジトリ」と「Belvedere ソース KaedeAatou/belvedere」の両方を表していた問題) を整理。① 図を 2 つに分離 (`UserGitHub` / `BelvedereSource`) + 「Belvedere 開発者」アイコン追加 + 凡例で明文化 ② AGENT_DESIGN §3 から `github.issues.list` (Planner 用) を削除 (用途不要と判断) ③ 残る 2 Tool (`github.activity` / `github.pr.diff`) は Phase 3 実装と明示 ④ ROADMAP Phase 3 に 2 日工数のタスク追加。MVP / ピッチでは GitHub 連携には触れない方針。 |
| 2026-05-05 (深夜) | **MCP (Model Context Protocol) サーバ実装 (Phase 0)**: ① `apps/mcp-server/` 新設 (TypeScript / `@modelcontextprotocol/sdk@^1.0.4`) ② stdio mode + 読み取り 6 Tool (`belvedere_ticket_list / ticket_get / epic_list / member_list / quality_check / refinement_check`) + `belvedere_invoke_agent` (5 儀式 + Orchestrator) + CRUD 系 4 個 (Phase 0 で前倒し本実装、`EpicRepository.upsert` 追加) ③ Smoke test 14/14 pass / typecheck 全 11 ワークスペース緑 ④ `docs/setup-mcp.md` 新設で Claude Code から `claude mcp add belvedere stdio "..."` で接続する手順を文書化 ⑤ B-1 / B-4 / B-5 で「単独 SaaS でなく AI Agent エコシステム統合」「自分自身が Claude Code + MCP で Belvedere をドッグフード」を主張可能に。書込承認は MCP server 側に dryRun を持たず、ホスト (Claude Code) の標準ツール承認 UI に委譲する設計 (L2 規範をホスト側で実現)。 |
| 2026-05-05 (朝) | **ROADMAP を 4 段階構成に再編 + MCP CRUD を Phase 1 に前倒し本実装**: ① ユーザー意図「Agent 開発前にまず Jira 風 SaaS を作る経験」「Belvedere をドッグフードしながら Agent 開発」を反映 ② Phase 1 = 手動 SaaS (Cloud Run + Firestore + Firebase Auth + UI CRUD + MCP Cloud Run ホスト) / Phase 2 = Mock Agent トリガ可視化 (Pub/Sub + Cloud Scheduler + AI Panel) / Phase 3 = Agent 本実装 (Gemini + ADK + Multimodal + RAG) / Phase 4 = 仕上げ ③ MCP CRUD 4 Tool を本実装 (`belvedere_ticket_create / update / status_change / epic_update`)、`EpicRepository.upsert` 追加、smoke test 14/14 pass ④ Phase 1 期限を 5/17 (Cloud Run /health 200) → 6/9 (手動 SaaS 完成) に延長 ⑤ 中間提出 (推定 6/30) は Phase 1 + Phase 2 (Mock 配線) で勝負可能、Gemini 接続は Phase 3 (~7/27) で。ハッカソン要件 Cloud Run は Phase 1 で達成、Gemini + ADK は Phase 3 で達成。 |
| 2026-05-06 | **Phase 1-A 完了**: ① WIF (Workload Identity Federation) で GitHub Actions ↔ GCP の鍵レス CI/CD を有効化 (`belvedere-ci-pool` / `belvedere-ci-github` Provider / `belvedere-deployer` SA + 6 ロール / principalSet で `KaedeAatou/belvedere` repo に絞込) ② `.github/workflows/deploy-api.yml` の `WIF_PROVIDER` / `WIF_SA` を実値に置換 + push トリガ復活 ③ `infra/cloudbuild.yaml` に `_TAG` substitution 追加 (`gcloud builds submit` 経由では `${SHORT_SHA}` が空になる罠の回避) ④ `apps/api/Dockerfile` の旧 `@kazaguruma/api` 残骸を `@belvedere/api` に統一 + single-stage 化 (multi-stage では pnpm workspace の per-package symlink が runtime に届かず `ERR_MODULE_NOT_FOUND` になる罠の回避) ⑤ `belvedere-api-dev` が `asia-northeast1` で起動、`/health` 200 を確認。GCP リソース命名は `belvedere-` プレフィックスに統一済 (旧 `github-actions` SA / `github-pool` / `github-provider` は完全削除 + dangling 残骸 cleanup 済)。 |
| 2026-05-06 (夜) | **Notion 再取得で応募方法 / スケジュール完全公開を検知** (`hackathon-compliance-auditor` Subagent 監査): ① **中間提出は無し** — 7/10 一発提出 ② 応募 STEP③ で **公開** GitHub URL 必須 → `KaedeAatou/belvedere` (private) を遅くとも 7/10 直前までに public 化必要 ③ Proto Pedia 必須項目に **動画 (YouTube/Vimeo)** + **システムアーキテクチャ図** + ストーリー 3 要素 + `findy_hackathon` タグ ④ 賞金確定 (最優秀 50 万 / 優秀 30 万 ×3 / 特別 10 万 ×6 / 総額 200 万) ⑤ 一次審査 7/13-17 / 二次審査 7/21-24 / 通知 7/30 ⑥ 公開リスク対処として `ui-mockups-v3/` 内の旧名 (`風車` / `kazaguruma`) 3 箇所を `Belvedere` / `belvedere` に置換 (廃止語残骸 0 件確認) ⑦ ARCHITECTURE.md / Eraser 図に実装ステータス色分け導入で「審査時点でどこが本当に動いているか」を視覚化済 (緑=API/CI-CD/Logging / 黄=Web/MCP/Orchestrator/5 Agents/Firestore / 灰=Tool Server/IAP/Gemini/ADK/Vector Search 等)。 |
| 2026-05-06 (夜2) | **GitHub リポジトリ public 化完了**: ① 8 観点の安全チェック全クリア (会社情報なし / 廃止語残骸ゼロ / API key ハードコードなし / 鍵ファイル commit なし / `.gitignore` で `.env` `*.key` `*.pem` 除外済 / README.md 187 行 / PROJECT_NUMBER 露出は WIF + repo owner 制約で実害なし) ② MIT LICENSE 追加 (copyright: KaedeAatou) ③ `gh repo edit --visibility public` で公開化 → `https://github.com/KaedeAatou/belvedere` ④ ハッカソン応募 STEP③ の「公開 GitHub URL」要件を 9 週間前倒しで充足 (提出 7/10 まで public 履歴が thread として育つ → B-5 実装力評価に効く狙い)。残: GitHub repo の About / Topics / Website 設定はユーザーが Web UI で実施。 |
| 2026-06-08 | **32 日コミットゼロ期間の監査**: ① Notion API で `rules` / `schedule` タブを完全再取得 → 開発要件 / 審査5基準 / 参加要件 / 9 マイルストーンの全て `HACKATHON_COMPLIANCE.md` 記載と一致 (差分ゼロ) ② Cloud Run `/health` 200 OK (159ms) を再確認、Phase 1-A 完了状態は保全 ③ `gh repo view KaedeAatou/belvedere` で public + MIT + 個人アカウント維持を再確認 ④ `pnpm typecheck` 11/11 全通過、`grep` で `Kazaguruma` / `風車` / `WindEvent` / 翼 のコード残骸ゼロ + 会社名 / 会社アカウント名 の混入ゼロを再確認 ⑤ Phase 1-B (5/22) / 1-C (5/29) / 1-D (6/3) / 1-E (6/9) が全て未着手 (期限超過 5〜17 日)、Phase 1 全体 (6/9) は達成不能 → 縮退ライン発動 or 一気通貫リプラン (7/10 まで 32 日) の判断が必要 ⑥ Notion 「お知らせ」欄に応募方法変更告知なし (5/26 Elasticsearch Bootcamp が最新) — STEP②/③ の詳細は前回監査 (5/6 夜) で確定済の記述で十分。 |
| 2026-06-10 | **ハッカソン応募方針の最終固定 (= ROADMAP 全面再構成)**: ユーザーから「7/11 以降コード作業ゼロ」「8/19 最終ピッチは提出物そのままで参加」が確定。これに伴い ROADMAP 全面再構成: ① **Phase 4 (7/28-8/19) 全面削除** (OWASP / a11y / 観測 / ドッグフード強化 / リハーサルは全カット、リハーサルは個人練習のみ) ② **提出後の一次/二次審査期間 (7/13-27) も追加実装ゼロ** (Reviewer Multimodal / ADK 後実装 / CeremonyHealthScore / GitHub 連携 を全削除) ③ **Reviewer Multimodal はキラーシーンから外し、Orchestrator Multi-Agent (= スクラムマスター AI) を B-1 中心軸に置換** (ADK 本物実装を Phase 3-A に圧縮、Gemini + ADK + Multi-Agent A2A を 4 日でまとめる) ④ **Pub/Sub + AI Integrity Panel リアル配線を Phase 2 として復活** (3 日確保、Mock のまま提出を回避) ⑤ **30 日バッファゼロ + 徹夜カバー前提**: ピッチ動画/スライド/Proto Pedia/応募を 3 日に圧縮 ⑥ 縮退判断ポイントを 6/14 / 6/19 / 6/24 / 6/26 / 6/30 / 7/3 / 7/7 / 7/10 朝に再設定。 |
| 2026-06-08 → 09 | **一気通貫リプラン → 1 セッション 23 commits で Phase 1-Day0 完了 + Phase 1-B コア完了** (6/8 監査の判断を受けて即実行): ① **Phase 1-Day0 完了**: Web (Nuxt 3 SSR) を Cloud Run へ初回デプロイ (`belvedere-web-dev` 200 OK) + `deploy-web.yml` 追加で push 自動デプロイ化 ② **Phase 1-B コア完了**: `packages/repo/src/firestore.ts` (217 行 + 9 リポジトリ実装) + seed/check スクリプト + Cloud Run API を `REPO_BACKEND=firestore` で再デプロイ → `/epics` で Firestore 実データ 4 件返却を実機確認 ③ **テスト基盤**: vitest 導入 + 34 件 pass (llm 15 / repo 19) + CI で `pnpm test` 自動実行 ④ **code-review max** で 15 findings 抽出 → 12 件 fix (memory↔firestore 契約一致 / startedAt null guard / firestore.indexes.json / `/health` env coerce / detectRole anchored / callCount FIFO cap / seed-firestore prod ガード / factory remediation message / undefined strip parity / deploy-api 明示 / web から repo 依存除去) ⑤ **zod runtime validation**: firestore read 経路で `as Ticket` キャストを safeParse に置換、shared/schemas.ts に 9 entity の zod schema + compile-time drift detection ⑥ **prompts.ts + agents.py を XML 構造化** (Anthropic Prompting 101 準拠、TS↔Python 同期 / detectRole anchor は `Your role: ` で互換維持) ⑦ **belvedere-commit skill 強化**: 「時間優先で 1 commit」例外条項を削除、`git add -A` 禁止を明文化 ⑧ docs 整合性: ROADMAP / HACKATHON_COMPLIANCE / ARCHITECTURE / PROJECT_PLAN を 6/9 現状に同期、`docs/setup-firebase-auth.md` 新設。Phase 1-B 残作業は Firebase Auth + workspaceId IDOR fix (ユーザー判断待ち)。 |
| 2026-06-10 | **Phase 1-B 全 4 ステップ完了 (4 日前倒し)**: ① **Step 1 — 認証ミドルウェア**: `apps/api/src/middleware/auth.ts` で Firebase Admin SDK で ID token 検証 + `apps/api/src/middleware/workspace.ts` で member ベース workspace 解決 + `/api/whoami` smoke test endpoint。Cloud Run deploy 後 `/health 200 / /api/whoami 401 missing_token` 実機確認 ② **Step 3 — IDOR fix 全層改修**: 全 entity (Ticket/Sprint/Epic/UserStory/Ceremony/AgentRun/CeremonyHealthScore) に `workspaceId: string` 必須化 + zod schema 同期 + `Equal<>` drift check 維持 + memory/firestore 両 backend に workspaceId フィルタ + buildTools(repo, workspaceId) closure cap で LLM への workspaceId 引数渡しを排除 + tools 層 IDOR ガード (workspace 跨ぎ get は not found 扱い) + 既存 `/tickets` 等を `/api/*` 配下に移動して認証必須化 (旧公開ルートは 404 化) + cli/mcp-server も WORKSPACE_ID env で単一 workspace 動作。memory.ts と firestore.ts は契約一致 (workspaceId フィルタの parity test 7 件追加) ③ **Step 2 — Web ログイン UI**: `apps/web/pages/login.vue` (Hoshino クリーム + Mohave BELVEDERE + Google ロゴボタン) + `composables/useFirebase.ts` (lazy singleton) + `useAuth.ts` (onAuthStateChanged で reactive state、idToken auto-refresh) + `useApiClient.ts` ($fetch ラッパーで Bearer 自動付与) + `middleware/auth.global.ts` (未認証 → /login リダイレクト、SSR では skip) + `nuxt.config.ts` の runtimeConfig.public に Firebase config + apiBaseUrl 注入。本番 deploy 後 mygolanglearn@gmail.com でログイン → / リダイレクト → Backlog 表示の end-to-end 動作確認済 ④ **Step 4 — Firestore Rules**: `infra/firestore.rules` (全コレクション `allow read, write: if false` ラストガード、API は Firebase Admin SDK で bypass) + `infra/firebase.json` + `docs/setup-firestore-rules.md` (ユーザー手動 deploy 5 分手順) ⑤ **初回 owner 自動登録**: `apps/api/src/config/email-allowlist.ts` で mygolanglearn@gmail.com → ws-belvedere owner を allowlist 化、workspaceMiddleware が listByUserId 0 件時に自動 upsert する設計。会社メアド絶対拒否を test で固定 ⑥ test 拡張: vitest を apps/api に追加 (allowlist 6 + firestore-rules 8 cases)、repo に Member upsert 3 cases、計 58/58 緑 (llm 15 + repo 29 + api 14) ⑦ typecheck 10/10 緑、コミットは belvedere-commit skill で 1 commit = 1 論理変更を厳守して 6 commit に分割 push。Phase 1-B 5 日予算を 1 日で前倒し完了、Phase 1-C UI CRUD 着手予定が 6/15 → 6/11 に。 |
| 2026-06-12 | **定期監査 (Phase 1-C/1-E 大幅前進後)**: ① Notion 全 4 チャンク (280 ブロック) 再取得 → 参加要件 / 開発要件 / 審査5基準 / スケジュール / 賞金とも差分ゼロ (お知らせ最新 5/26 のまま / STEP②/③ 詳細は 403 継続 → §D 既存記述で代替) ② 6/10〜12 の 60+ commits を検証: R3 (全画面 実 API 統一) / 種別バッジ + finding ピル (T5) / 見積もりポーカー API+UI (T6/T7) / Refinement 専用画面 (T9) / DetailSheet 編集・削除 (T10) / velocity 基準への全面統一 (SPRINT_OVER_VELOCITY) / Sprint ライフサイクル API (goal・期間編集 + planned→active 開始) / RetroTry 永続化 + `retro.tries.list` Tool / **Workspace マルチテナント管理 (作成・切替・招待 + ログイン時自動加入) = Phase 1-E 前倒し完了** ③ 実機確認: Cloud Run api/web 200 OK (`belvedere-dev-atrium` / `mygolanglearn@gmail.com`)、repo public + MIT + KaedeAatou、git author 全コミット個人メアド、typecheck 全通過、test 202/202 緑 ④ **新規 🔴: `apps/api/test/email-allowlist.test.ts:25` に会社メアドフル文字列 <会社メアド (redacted)> がハードコード** (negative test 目的でも公開 repo で個人↔会社紐付けを掲示 / docs 2 ファイルにも 会社ドメイン 記載) → ダミー置換を推奨 ⑤ B-3 の a11y を「Phase 4 削除に伴う意図的スコープ外」へ、C 節の GCP/GitHub 旧 🔴 を 🟢 充足へ、§D マイルストーン表を 2026-06-10 再構成版 ROADMAP に同期 ⑥ 残る要件クリティカルパス: A-2 Gemini/ADK 実呼び出し (Phase 3-A 6/27-30) + Proto Pedia 動画・アーキ図 (Phase 3-C 7/8-10)。 |
| 2026-06-17 | **MCP を API HTTP クライアントに刷新 + サービストークン認証 (B-1/B-4/審査⑤ 強化)**: ① MCP server を repo 直結 (既定 memory) から **Belvedere API の HTTPS クライアント**へ全面書換 — デプロイ済み web と同じ dev Firestore を読み書きでき、「web 起票 → MCP 取得 → ローカル修正 → done」のサイクルが実データで繋がる ② **機械認証パス追加** (`apps/api/src/config/service-token.ts`): `MCP_SERVICE_TOKEN` を定数時間照合し、専用プリンシパル `svc:mcp` を ws-belvedere の **po (最小権限)** に bootstrap。Firestore 直結の裏口を作らず authMiddleware → workspaceMiddleware → IDOR ガードを通す。env 未設定で無効 (安全側既定) ③ API を `createApp({repo,llm})` factory 化し **初の full-stack (app.fetch) テスト**を実現 (`apps/api/test/app-auth.test.ts`)。`GET /api/tickets/:id` ・`type` 等フィルタ・`/api/tickets/:id/quality`・`/api/refinement` を追加し MCP 14 ツールを API へマップ ④ 旧 smoke の 2 件赤 (tool 数ズレ / `ticket_create` が type を載せず bug 起票不可) を根治。**smoke 19/19 + MCP↔API 統合テスト (認証否定系/IDOR/bugfix サイクル) 追加**、test 全緑 (284: shared 19 + llm 15 + repo 35 + tools 34 + api 167 + mcp 14) / typecheck 11/11 緑 ⑤ **Cloud Run `--allow-unauthenticated` は意図的に維持**する方針をユーザー確認 (web 直叩きのため allUsers 妥当 / 認可はアプリ層) → ARCHITECTURE.md §8 に明記 ⑥ docs 同期: `docs/setup-mcp.md` (HTTP 構成 + provisioning) / ARCHITECTURE.md (MCP→API 経路) / CLAUDE.md。**主 LLM (Gemini) / デプロイ先 (Cloud Run) / 自律性に変更なし**。クリティカルパス不変 (A-2 Gemini/ADK / B-1 動画 / Proto Pedia)。提出 7/10 まで残り 23 日。 |
| 2026-06-17 (続) | **per-user API キー認証 + ドッグフードサイクル自動化 + 初回 dogfood 修正**: ① MCP に **per-user API キー** (`blv_...` / sha256 ハッシュ保管 / 発行・失効 UI を設定画面に追加) を実装し、`svc:mcp` でなく **本人** として ws-belvedere-dev に接続 ② **`belvedere-ticket-cycle` skill 新設** + `/loop 1h` で「web 起票→MCP 取得→実装→デプロイ→review (done はユーザー受け入れ)」を毎時自動巡回 (明確なら実装 / 曖昧は相談)。review 運用は memory でなく skill に集約 ③ 初回 dogfood: 自分が web で起票したバグ/US を MCP で取得し、**bug/incident の SP をポーカー化 (WC-9460f690)** + **スプリント表示を番号でなく付けた名前に (WC-c6d339fb)** を実装→デプロイ→review。CI/deploy/E2E 全 green。B-4 ドッグフード数字の計測が稼働開始。**主 LLM (Gemini)/デプロイ先 (Cloud Run)/自律性に変更なし**、クリティカルパス不変 (A-2 Gemini/ADK / B-1 動画 / Proto Pedia)。 |
| 2026-06-17 (監査) | **定期監査 (Gemini API provider 実装 + MCP HTTP 化後)**: ① **Notion 一次情報を loadPageChunk + cursor 連鎖で 4 チャンク (294 ユニークブロック) 完全再取得** → 開催概要 / 開発要件 (実行プロダクト 4 群: App Engine・GCE / GKE / Cloud Run・Cloud Functions / TPU・GPU、AI 技術 11 群: Gemini Enterprise Agent Platform(旧Vertex AI) / Gemini API / Gemma・Imagen・Agent Builder / ADK / STT・TTS / Vision・NLP / Translation / Flutter / Firebase / Veo / Elasticsearch) / 審査基準 5 項目 / 参加要件 (日本居住 18 歳以上・個人の私的活動・公務員等除外) / **スケジュールテーブル全 9 行 (table_row として取得: 参加登録 4/27-7/10 23:59 / チームビルディング 6/7 / Boot Camp 6 月 / ④プロジェクト提出〆切 7/10 23:59 / 一次審査 7/13-17 / 二次審査 7/21-24 / 受賞通知 7/30 / 最終発表 8/19 / アフターイベント 9 月)** / 応募 STEP①②③ / 賞金 (最優秀 50 万×1 / 優秀 30 万×3 / 特別 10 万×6) を全文照合 → **`HACKATHON_COMPLIANCE.md` と差分ゼロ**。お知らせ最新は 5/26 Elasticsearch Bootcamp のまま (ルール本体変更なし) ② **A-2 に実進展**: commit 71e5171 で `packages/llm/src/gemini.ts` の `GeminiLLMProvider` が throw → REST 直叩き本実装に昇格 (LLMProvider 抽象を Gemini にマップ / tool_calls 往復対応 / 単体テスト 6 件)。**ただし signpost は破られていない** — `agents.py` は依然 `NotImplementedError`、`GEMINI_API_KEY` 未設定で実トークン生成未検証、本番 Cloud Run は `/health` で `"llm":"mock"`。A-2 は 🟡 据え置きだが「TS provider 本実装済」へ実体前進 ③ 6/13〜17 の 20+ commits 検証: MCP→API HTTP クライアント化 / サービストークン・per-user API キーの 2 認証 (Firebase refresh token 経路は 2026-06-17 後刻に attack surface 削減で廃止) / createApp factory + full-stack テスト / 診断ロジック純粋関数抽出 / bug/incident SP ポーカー化 / スプリント名表示 / Gemini provider。**主 LLM(Gemini)・デプロイ先(Cloud Run)・自律性に縮退/差し替えゼロ** (grep で anthropic/openai/vercel/lambda 混入なし) ④ 実機確認: Cloud Run api 200 OK (`"llm":"mock","repo":"firestore"` / 5.4s ※コールドスタート) + web 200 OK、gcloud 個人 `mygolanglearn@gmail.com` + `belvedere-dev-atrium`、git author/committer 全コミット個人メアドのみ、`git grep` で会社名・会社ドメインの混入ゼロ + 廃止語 (Kazaguruma/風車/WindEvent/翼) の実コード使用ゼロ (.claude の検出ルール定義のみヒット)、typecheck 11/11 緑、**test 325/325 緑** (shared 19 + llm 21 + repo 35 + tools 47 + api 182 + mcp 21 / 243→325) ⑤ B-5 test 件数を 325 に / A-2 を「TS provider 本実装」へ更新 ⑥ **残るクリティカルパス不変: A-2 実トークン生成 + ADK Runner 経路 (Phase 3-A 6/27-30) + B-1 デモ動画 + B-4 ドッグフード数字 + Proto Pedia (Phase 3-C 7/8-10)**。提出 7/10 まで残り 23 日。 |
| 2026-06-19 | **定期監査 (Orchestrator 単一窓口 + Agent 運用モデル確定後)**: ① **Notion を cursor 連鎖で完全再取得** (294 ブロック / スケジュール table_row 全 9 行) → 開発要件・審査5基準・参加要件・スケジュール・応募方法・賞金とも **差分ゼロ** (お知らせ最新 5/26 のまま) ② **今セッションの運用モデル確定を検証**: Orchestrator を時刻ルーティング→**単一窓口=協議統括**へ (`agent.invoke` で 5 儀式 agent 子招集 / 深さ1・IDOR・コストキャップ / `app.ts` request-scoped childRuns / schemas.ts z.lazy 自己参照)。prompts/mock/agents.py 同期・detectRole anchor 無傷で Mock 協議が end-to-end 稼働 (web flag 既定 OFF)。**自律性 L1/L2 のみに統一** (L3/L4 不採用 / Slack 連携・スケジュール・Pub-Sub 自動起動も不採用 = 画面操作トリガのみ)。epic 必須化 + Review→reviewNotes + sprint.get IDOR fix ③ **Gemini: 無料枠キーで実トークン疎通確認済**だが本番 Cloud Run は `/health` `"llm":"mock"` のまま (cloudbuild `_LLM_PROVIDER: mock` / Secret Manager 注入はユーザー専権)。**ADK は agents.py が `NotImplementedError` 雛形のみ** (協議の実体は TS runAgent) → **A-2 🟡 据え置き**だが「本番切替だけ」に縮小 ④ **🟡 検出 (中): docs では「Slack 全除去」だがコードに `slack.message.post` ツールが buildTools 配列に残存** (`packages/tools/src/index.ts:274,346` / `shared/types.ts:341` slackUserId) → 要件違反ではないが docs↔コード乖離。提出前撤去推奨 ⑤ 実機: gcloud 個人アカウント + `belvedere-dev-atrium`、Cloud Run api/web 200 OK、会社識別子混入ゼロ・廃止語実使用ゼロ (禁止リスト定義のみ)・anthropic/openai/vercel/lambda は「Anthropic Prompting 101 準拠」コメントのみ (縮退/差し替えゼロ)、typecheck 11/11 緑、**test 全緑 (shared 46 + llm 26 + agent 7 + tools 86 + api 201 + web 31 + repo 44 + mcp smoke 21)** ⑥ B-1 自律的判断/同期トリガを 🟡→🟢 (Mock 協議実装) に昇格、A-2 Gemini に「無料枠疎通確認済」追記、Pub/Sub→不採用確定を B-5 / §D に反映、Phase 3-A を 🔴→🟡 (大幅前進)。残クリティカルパス: A-2 本番 Gemini 切替 (ユーザー) + B-1 動画 + B-4 数字 + Proto Pedia。提出 7/10 まで残り 21 日。 |
| 2026-06-16 | **定期監査 (DnD/UI 品質固め後)**: ① **Notion 一次情報を再帰 BFS クロールで完全再取得** (全 toggle 含む 280+ ブロック) → 前回まで 403 だったルール本体 / 審査5基準 / 参加要件 / 利用規約 全 18 条 / 個人情報取り扱い / Q&A / 応募方法 STEP①②③ / 賞金を全文取得 → `HACKATHON_COMPLIANCE.md` と照合し **差分ゼロ** (開発要件: 実行プロダクト App Engine・GCE / GKE / Cloud Run・Cloud Functions / TPU・GPU の 4 群、AI 技術: Gemini Enterprise Agent Platform (旧 Vertex AI) / Gemini API / Gemma・Imagen・Agent Builder / ADK / STT・TTS / Vision・NLP / Translation / Flutter / Firebase / Veo / Elasticsearch の 11 群。お知らせ最新は 5/26 のまま) ② **前回 🔴 (会社メアドハードコード) の解消を確認**: test がダミー `someone@company.example` 検証に書き換わり、`git grep` で全 tracked (docs 含む) に会社識別子の実値混入ゼロ → C 節を 🟢 解決へ昇格 ③ 6/12〜16 の **110 commits を検証**: 中身は vue-draggable-plus/SortableJS への DnD ライブラリ移行・区画移動バグ・⌘K フォーカス・AI 指摘ピル更新・generateId 衝突・Sprint カデンス常時稼働 + name 追加・Planning 新規作成導線撤去など UI/品質固め。**自律性を削る縮退・主 LLM/デプロイ先の差し替えは皆無** ④ 実機確認: Cloud Run api 200 OK (170ms `firestore`) / web 200 OK (115ms)、gcloud 個人 `mygolanglearn@gmail.com` + `belvedere-dev-atrium`、repo PUBLIC + MIT + KaedeAatou、typecheck 11/11 緑、**test 243/243 緑** (shared 13 + llm 15 + repo 35 + tools 34 + api 146 / 202→243)、A-2 signpost (factory.ts throw / agents.py NotImplementedError / main.py USE_REAL_ADK 分岐) 維持、5 儀式 + Backlog の 6 SFC + runtime ループ健在 ⑤ B-5 test 件数を 243 に更新、A-2 / B-1 デモ動画 / B-4 数字は前回同様 🟡/🔴 据え置き ⑥ **残るクリティカルパス変わらず: A-2 Gemini/ADK 実呼び出し (Phase 3-A 6/27-30) + B-1 デモ動画 (Phase 3-C 7/8-10) + B-4 ドッグフード数字 (Phase 1-D 6/20- 開始が事実上の最終機会) + Proto Pedia (7/8-10)**。提出 7/10 まで残り 24 日。 |
