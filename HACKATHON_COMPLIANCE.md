# Hackathon Compliance Tracker

> このリポジトリの最終目的: **DevOps × AI Agent Hackathon 2026 への応募・受賞**
> 一次情報: https://findy.notion.site/devops-ai-agent-hackathon-2026
> 最終ピッチ: 2026-08-19 (渋谷ストリーム)
> 最終チェック: 2026-06-10 (このファイルが古ければ Claude が再取得して更新する)
>
> **2026-05-01 Notion 更新検知**: Google Cloud クーポン (300ドル分) を申込者全員に配布開始 (5/7 以降登録メールアドレスへ送付)。Phase 1 GCP 立ち上げ予算が確保されたため、Cloud Run / Gemini 接続着手の障害が1段階下がった。
>
> **2026-05-11 Notion 更新検知**: 「Agentic AI Bootcamp 2026」(グーグル・クラウド・ジャパン主催) 申込受付開始。開催 6/1 (月) 〜 6/12 (金)。ADK / Gemini Enterprise Agent Platform / Cloud Run / Gemini API を実機ハンズオンで習得できる無料・事前申込制。**今日 6/8 時点で会期内** — 残り 4 営業日。
>
> **2026-05-26 Notion 更新検知**: Elasticsearch 社による「Elastic Agent Builder 実践 Bootcamp」を 6/23 (火) 19:00–20:30 オンライン無料開催。A2A プロトコル経由で Elastic Agent を Gemini Enterprise に接続するハンズオン。利用チーム 1 組に「Findy Tools 記事化」特典あり。Belvedere は Vector Search で検討中の RAG 軸と直結 (`ROADMAP.md` Phase 3 / 7/18-)。
>
> **2026-06-08 監査ハイライト**: 前回チェック (5/6 夜) から **32 日間コミットゼロ** + Phase 1-B/C/D/E 全て未着手 (期限超過 5〜17 日)。Cloud Run /health は依然 200 OK (159ms / `belvedere-api-dev`) で **Phase 1-A 完了状態を保全**、GitHub repo public + MIT + `KaedeAatou` 個人アカウント維持、廃止語 (`Kazaguruma` / `風車` / `WindEvent` / 翼) のコード/docs 残骸ゼロ、会社識別子 (`***company-redacted***` / `***company-account-redacted***`) の混入ゼロ、`pnpm typecheck` 11/11 全通過。一方で Phase 1 全体 (6/9 = 明日) は事実上達成不能。**応募〆切 7/10 まで残り 32 日 — Phase 1-B/C/D/E 全部を 1 ヶ月で巻き取るか、Phase 1-D (MCP→Cloud Run) と Phase 1-E (動画) のみに絞った縮退ライン発動かをユーザーが判断する必要がある**。
>
> **2026-06-08 Notion 一次情報差分**: ルール / 開発要件 / 審査5基準 / 参加要件 / スケジュール (チーム提出までの全 9 マイルストーン) を Notion API で完全再取得し、`HACKATHON_COMPLIANCE.md` 記載内容と完全一致を確認 (差分ゼロ)。お知らせ欄の追加更新も 5/26 Elasticsearch Bootcamp が最新で、ルール本体に変更なし。`Cloud Run・Cloud Functions (旧 Cloud Functions)` の表記揺れは Cloud Functions 2nd gen 統合に伴う Notion 側の表記補正で実害なし。応募方法 STEP②/③ の詳細本文は Cloudflare ガードで syncRecordValues が弾かれたが、お知らせ欄に応募方法変更告知が存在しないため `§D` の記述で確度十分。

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
| **Gemini API** | ✅ 採用 | 🟡 計画 | `packages/llm/src/factory.ts` で `gemini` / `vertex` は明示的 throw (silent fallback しない signpost)。`mock` のみ実装。実装は GCP セットアップ後 |
| **ADK (Agents Development Kit)** | ✅ 採用 | 🟡 計画 | `apps/orchestrator-py/pyproject.toml` に `google-adk>=0.5` / `google-genai>=0.3` 依存追加済 / `agents.py` に5儀式 (planner/refinement/daily/reviewer/retrospective) + Orchestrator の INSTRUCTION 雛形完備 / `build_agents(use_real_adk=True)` で `NotImplementedError` raise (silent fallback なし)。本物実装は `USE_REAL_ADK=true` 切替待ち |
| Gemini Enterprise Agent Platform (旧 Vertex AI) | — | ⚪ | Notion 公式リスト (2026-05-01 確認) では「旧Vertex AI」表記。Gemini API + ADK で十分。観測やデータ管理で必要なら追加 |
| Vector Search | 🟡 検討 | ⚪ | 過去ふりかえり検索で使う案あり (`AGENT_DESIGN.md`)。Phase 2 後半で検討 |
| **Gemini 2.5 Pro Multimodal (動画入力)** | ✅ 採用 (2026-05-04) | 🟡 計画 | **Reviewer Agent が Sprint Review 録画から指摘を抽出して Ticket 起票候補を生成** (`AGENT_DESIGN.md §2-4`)。Speech-to-Text を経由せず動画を直接入力。ピッチキラーシーン (デモ #5) |
| Speech-to-Text / TTS | — | ⚪ 不採用 (2026-05-04) | Gemini Multimodal が音声 + 映像を統合処理するため不要。WC-111 (ペアプロ音声) の用途は別途要再検討 |
| Gemma / Imagen / Vision / NLP / Translation | — | ⚪ | 必要に応じて追加 |

**充足条件**: 本物の Gemini 推論が `apps/orchestrator-py` 経由で1回でも走る (= ADK Runner で実際にトークンが生成される) こと。
**Phase 1 期限**: 2026-05-17

---

## B. 審査5基準

### B-1. AIエージェントが価値の中心になっているか 🔥 最重要

| 観点 | 状態 | エビデンス / リスク |
|---|---|---|
| 単機能ではない (複数ツール組み合わせ) | 🟢 充足 (Mock) | `packages/agent/src/runtime.ts` で `thought → tool_call → tool_result → output` の反復ループ実装。Mock LLM が儀式別に複数 tool call sequence を返す |
| 自律的な判断と実行 | 🟡 計画 | 自律性レベル L0-L4 を `AGENT_DESIGN.md §4` で設計。デフォルト Daily=L3 / Planner=L2 / Refinement=L2 / Reviewer=L2 / Retro=L2 (Refinement Agent は 2026-05 に追加した5番目の儀式 agent) |
| 自律トリガ (時間/イベント/閾値) | 🟡 計画 | Cloud Scheduler + Pub/Sub で「儀式30分前」「障害発生」「停滞検出」などを起動条件に設計 |
| AIエージェントである必然性 | 🟢 充足 | `PRODUCT_BRIEF.md §5` の「単なる機能 vs エージェント」表で言語化済。**Multimodal 軸 (動画→チケット) は Gemini 2.5 Pro の独擅場**で「他 LLM でなく Gemini である必然性」が明確 |
| マルチエージェント構成 | 🟢 充足 (Mock) | 5儀式エージェント (Planner / Refinement / Daily / **Reviewer (Multimodal対応)** / Retrospective) + Orchestrator が `packages/agent/src/prompts.ts` `PER_AGENT` で定義済。Mock では役割別動作確認済。本物 ADK 連携は GCP セットアップ後 |
| ピッチ用デモ動画 | 🔴 未撮影 | 「自律的に動いた結果」を 90秒で見せる動画素材が無い。基準①の最大リスク |

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
| 直観的 UI | 🟢 充足 (公開 URL + API は Firestore 実データ) | `apps/web/` Nuxt 3 + Vue 3 SFC 17 ファイル実装済 + **2026-06-08 Web Cloud Run デプロイ完了 + 2026-06-09 API ↔ Firestore 接続済** (https://belvedere-web-dev-cpszmcqmuq-an.a.run.app/ 200 OK / https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/epics で 4 件返却)。Claude Designer から取り込んだ 5 画面 (`BacklogScreen.vue` / `PlanningScreen.vue` / `DailyScreen.vue` / `ReviewScreen.vue` / `RetroScreen.vue`) + Shell / RailPanel / AIPanel / DetailSheet / 6 primitives (Icon / TicketRow / StoryPoints / StatusDot / FlagPill / Avatar / TypeMark)。Web → API 接続は Phase 1-C (6/15-21) で実装予定 |
| 儀式別画面 (差別化軸) | 🟢 充足 | Jira の単一 Sprint Board に対し、Planning / Daily / Review / Retro + Backlog (Refinement 統合) の5枚を専用画面化。`useChecks.ts` で各儀式の AI Integrity Panel を描画 |
| 階層の情報設計 | 🟢 | Goal › Story › Task の3階層、SP / valueImpact / status / flag を1画面に圧縮表示 |
| ナビゲーション | 🟢 | Shell + RailPanel の2ペイン構成。AIPanel が常時 AI Integrity Signal を表示 |
| 高密度 (Jira問題への対処) | 🟢 | TicketRow を圧縮グリッドに展開し、スクロール無しで全タスクが1画面に見える設計 |
| コラボ表現 | 🟡 計画 | アバタースタックは表示あり (Avatar primitive) / ライブカーソルや Activity ログは UI 表示のみ実機能は未実装 |
| アクセシビリティ | 🔴 未着手 | Phase 3 (`ROADMAP.md`) で a11y 監査予定 |

**リスク**: 既に5画面 SFC 実装済。Nuxt 3 + Vue 3 strict TS 環境で `pnpm typecheck` 全 11 ワークスペース通過 (2026-06-09 時点)。**2026-06-08 Cloud Run Web 公開済 + 2026-06-09 API が Firestore に接続し `/epics` で実データ返却**。Web 公開 URL + API 公開 URL + Firestore backend + 自動 CI/CD (deploy-api/deploy-web) + zod runtime validation まで揃った状態。次の優先課題は (1) Web ↔ API 接続 (Phase 1-C / 6/15-21) で 5 儀式画面が Firestore 実データを表示すること、(2) Mock LLM ではなく Gemini 経由でリアルタイムに AI Integrity Signal を生成 (Phase 3 / 7/3-9)。

### B-4. 実用性・体験価値の魅力

| 観点 | 状態 | エビデンス |
|---|---|---|
| 体験の驚き | 🟡 計画 | 「儀式の前後で何かが片付いている」(`PRODUCT_BRIEF.md §7`) — デモで再現が必要 |
| 実利用検証 | 🔴 未着手 | 自分のチームでのドッグフード予定 (Phase 3, 7/13〜) |
| 数字で語れる効果 | 🔴 未着手 | ふりかえり健全性スコアの改善を測る計画あり / データ取得は本番デプロイ後 |

**リスク**: ピッチで「実際に使ったら〇〇減りました」と言える数字が無いと基準④で苦戦。ドッグフード期間 (7/13〜7/27) を死守する。

### B-5. 実装力

| 観点 | 状態 | エビデンス |
|---|---|---|
| 技術選定の納得度 | 🟢 | `ARCHITECTURE.md` で案A/B/C比較 / Cloud Run + Gemini + Firestore の理由言語化 |
| 拡張性 | 🟢 | LLMプロバイダ抽象 (`packages/llm/`) / Repository抽象 (`packages/repo/` の RepoContainer = tickets/sprints/projects/epics/stories/members/ceremonies/agentRuns/ceremonyHealth) / Tool factory (`buildTools(repo)`) ですべて差し替え式 |
| 実運用への配慮 | 🟡 | Secret Manager / WIF / Cloud Logging / 課金アラート / OWASP リリースゲート (WC-110) を設計 |
| コード品質 | 🟢 | TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes / Python mypy strict + ruff / `pnpm typecheck` 全 11 ワークスペース通過 (2026-06-09 確認) / **vitest 34 件 pass** (llm 15 + repo 19) + GitHub Actions CI で `pnpm test` 自動実行 / **zod runtime validation** (firestore.ts read 経路で safeParse + drift detection) / **prompts XML 構造化** (Anthropic Prompting 101 準拠、TS↔Python 同期) |
| GCPサービス活用度 | 🟡 計画 | 設計上は Cloud Run / Gemini (テキスト + Multimodal) / ADK / Firestore / **Cloud Storage (Sprint Review 録画)** / Pub/Sub / Cloud Scheduler / Vector Search / Cloud Build / Cloud Deploy / Secret Manager / Logging / Trace |
| 多階層モノレポ構成 | 🟢 | TS workspace 9 packages + Python uv workspace 1 (orchestrator-py)。shared / seed / repo / tools / llm / agent の依存方向が一方向 (循環なし) |

---

## C. 参加要件 (人の側) 🔥 アウト即失格

| 観点 | 状態 | 根拠 / 確認手段 |
|---|---|---|
| 日本居住 | 🟢 | `memory/user_cloud_background.md` (日本居住者) |
| 18歳以上 | 🟢 | (確認済) |
| **個人の私的活動** として参加 | 🟡 必確認 | 会社業務として / 会社代表としては不可。GCPプロジェクト/GitHubリポジトリは個人アカウントで作ること |
| 国家公務員等でない | 🟢 | 民間企業所属 |
| 個人 Google アカウントで GCP 利用 | 🔴 未着手 | `docs/setup-gcp.md §0` で「会社アカウントではなく個人」と注記済。**GCP プロジェクト未作成、5/7 以降配布の Google Cloud 300ドルクーポン受領時に個人アカウントへ紐付ける** |
| 個人 GitHub リポジトリで管理 | 🔴 リスク | **`git init` 未実行、リモート未設定**。`.github/workflows/deploy-api.yml` は WIF を前提にしているが、git リポジトリそのものが無いと CI が動かない。会社 GitHub Org に push しないよう注意 |
| seed データから会社情報の露出 | 🟢 解決 (2026-05-04) | `packages/seed/src/members.ts` の会社メールを `@example.com` ダミードメインに差し替え済 |

**ガード**: `docs/setup-gcp.md` §0 の警告 + `memory/hackathon_compliance.md` で Claude 側からも警告を出す。

---

## D. スケジュール要件

> **2026-05-06 Notion 再取得で全マイルストーン確定**: 前回チェック (2026-05-04) で「Coming Soon」だった応募方法・スケジュールが完全公開された。**中間提出は無し**。7/10 一発提出 → 一次/二次審査 → 7/30 通知 → 8/19 最終ピッチ。

| イベント | 日付 | 状態 |
|---|---|---|
| Google Cloud 300ドルクーポン配布開始 | 2026-05-07 以降 | 🟢 確認 (申込済参加者には登録メールアドレスへ送付) |
| ① 参加登録 (Findy Conference) | 2026-04-27 10:00 〜 2026-07-10 23:59 | 🔴 未確認 (個人 `owner@example.com` で実施 / クーポン受信のため早期推奨) |
| ② チームビルディングイベント (オフライン) | 2026-06-07 (日) 13:00–18:00 / ファインディ株式会社 イベントスペース | 🟡 個人参加判断中 |
| ③ Boot Camp (Agentic AI Bootcamp 2026) | 2026-06 上旬〜下旬 / オンライン無料 / 事前申込制 | 🟡 参加予定 |
| ④ **作品提出〆切 (Proto Pedia + Google Form)** | **2026-07-10 (金) 23:59** | 🔴 必須 3 件: **公開** GitHub URL / デプロイ URL / Proto Pedia URL |
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

### 自社マイルストーン (`ROADMAP.md` / 2026-05-05 4段階構成へ再編)

| マイルストーン | 期限 | 状態 |
|---|---|---|
| Phase 0: ローカル基盤 (Mock LLM / Web UI / MCP CRUD) | 2026-05-12 | ✅ 完了 |
| Phase 1-A: GCP セットアップ (project / API / Firestore / Artifact Registry / SA / 課金アラート $10/月) | 2026-05-06 | ✅ 完了 |
| **Phase 1-Day0: Web を Cloud Run にデプロイ** | 2026-06-08 | 🟢 **完了** (Nuxt 3 SSR / 200 OK) |
| Phase 1-B: Firestore + Firebase Auth | 2026-06-14 (改訂) | 🟡 6/9 着手予定 |
| Phase 1-C: Web UI で CRUD 動作 | 2026-06-21 (改訂) | 🟡 待機 |
| Phase 1-D: MCP を Cloud Run へ | 2026-06-28 (改訂) | 🟡 待機 |
| Phase 1 全体: 手動 Belvedere SaaS 完成 | 2026-06-28 (改訂) | 🟡 Day0 完了で公開 URL 入手、残作業は CRUD 接続 + MCP デプロイ |
| ピッチデモ動画 (旧 Phase 1-E) | 2026-07-08 (Phase 3 末) | 🟡 待機 (Proto Pedia 提出と一緒に撮影) |
| Phase 2: Agent トリガ可視化 (Pub/Sub + Cloud Scheduler + Mock Agent + AI Panel) | 2026-06-30 | 🟡 配線設計済、Phase 1 完了が前提 |
| Phase 3: Agent 本実装 (Gemini + ADK + Multimodal + RAG + GitHub 連携) | 2026-07-27 | 🟡 Mock 実装は機能、実 LLM 待ち。**応募提出 7/10 はこの中盤** |
| Phase 4: 仕上げ + ピッチ (a11y / OWASP / 動画 / リハ) | 2026-08-19 | 🔴 ピッチ素材未着手 |

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
| 2026-06-08 | **32 日コミットゼロ期間の監査**: ① Notion API で `rules` / `schedule` タブを完全再取得 → 開発要件 / 審査5基準 / 参加要件 / 9 マイルストーンの全て `HACKATHON_COMPLIANCE.md` 記載と一致 (差分ゼロ) ② Cloud Run `/health` 200 OK (159ms) を再確認、Phase 1-A 完了状態は保全 ③ `gh repo view KaedeAatou/belvedere` で public + MIT + 個人アカウント維持を再確認 ④ `pnpm typecheck` 11/11 全通過、`grep` で `Kazaguruma` / `風車` / `WindEvent` / 翼 のコード残骸ゼロ + `***company-redacted***` / `***company-account-redacted***` の混入ゼロを再確認 ⑤ Phase 1-B (5/22) / 1-C (5/29) / 1-D (6/3) / 1-E (6/9) が全て未着手 (期限超過 5〜17 日)、Phase 1 全体 (6/9) は達成不能 → 縮退ライン発動 or 一気通貫リプラン (7/10 まで 32 日) の判断が必要 ⑥ Notion 「お知らせ」欄に応募方法変更告知なし (5/26 Elasticsearch Bootcamp が最新) — STEP②/③ の詳細は前回監査 (5/6 夜) で確定済の記述で十分。 |
| 2026-06-10 | **ハッカソン応募方針の最終固定 (= ROADMAP 全面再構成)**: ユーザーから「7/11 以降コード作業ゼロ」「8/19 最終ピッチは提出物そのままで参加」が確定。これに伴い ROADMAP 全面再構成: ① **Phase 4 (7/28-8/19) 全面削除** (OWASP / a11y / 観測 / ドッグフード強化 / リハーサルは全カット、リハーサルは個人練習のみ) ② **提出後の一次/二次審査期間 (7/13-27) も追加実装ゼロ** (Reviewer Multimodal / ADK 後実装 / CeremonyHealthScore / GitHub 連携 を全削除) ③ **Reviewer Multimodal はキラーシーンから外し、Orchestrator Multi-Agent (= スクラムマスター AI) を B-1 中心軸に置換** (ADK 本物実装を Phase 3-A に圧縮、Gemini + ADK + Multi-Agent A2A を 4 日でまとめる) ④ **Pub/Sub + AI Integrity Panel リアル配線を Phase 2 として復活** (3 日確保、Mock のまま提出を回避) ⑤ **30 日バッファゼロ + 徹夜カバー前提**: ピッチ動画/スライド/Proto Pedia/応募を 3 日に圧縮 ⑥ 縮退判断ポイントを 6/14 / 6/19 / 6/24 / 6/26 / 6/30 / 7/3 / 7/7 / 7/10 朝に再設定。 |
| 2026-06-08 → 09 | **一気通貫リプラン → 1 セッション 23 commits で Phase 1-Day0 完了 + Phase 1-B コア完了** (6/8 監査の判断を受けて即実行): ① **Phase 1-Day0 完了**: Web (Nuxt 3 SSR) を Cloud Run へ初回デプロイ (`belvedere-web-dev` 200 OK) + `deploy-web.yml` 追加で push 自動デプロイ化 ② **Phase 1-B コア完了**: `packages/repo/src/firestore.ts` (217 行 + 9 リポジトリ実装) + seed/check スクリプト + Cloud Run API を `REPO_BACKEND=firestore` で再デプロイ → `/epics` で Firestore 実データ 4 件返却を実機確認 ③ **テスト基盤**: vitest 導入 + 34 件 pass (llm 15 / repo 19) + CI で `pnpm test` 自動実行 ④ **code-review max** で 15 findings 抽出 → 12 件 fix (memory↔firestore 契約一致 / startedAt null guard / firestore.indexes.json / `/health` env coerce / detectRole anchored / callCount FIFO cap / seed-firestore prod ガード / factory remediation message / undefined strip parity / deploy-api 明示 / web から repo 依存除去) ⑤ **zod runtime validation**: firestore read 経路で `as Ticket` キャストを safeParse に置換、shared/schemas.ts に 9 entity の zod schema + compile-time drift detection ⑥ **prompts.ts + agents.py を XML 構造化** (Anthropic Prompting 101 準拠、TS↔Python 同期 / detectRole anchor は `Your role: ` で互換維持) ⑦ **belvedere-commit skill 強化**: 「時間優先で 1 commit」例外条項を削除、`git add -A` 禁止を明文化 ⑧ docs 整合性: ROADMAP / HACKATHON_COMPLIANCE / ARCHITECTURE / PROJECT_PLAN を 6/9 現状に同期、`docs/setup-firebase-auth.md` 新設。Phase 1-B 残作業は Firebase Auth + workspaceId IDOR fix (ユーザー判断待ち)。 |
| 2026-06-10 | **Phase 1-B 全 4 ステップ完了 (4 日前倒し)**: ① **Step 1 — 認証ミドルウェア**: `apps/api/src/middleware/auth.ts` で Firebase Admin SDK で ID token 検証 + `apps/api/src/middleware/workspace.ts` で member ベース workspace 解決 + `/api/whoami` smoke test endpoint。Cloud Run deploy 後 `/health 200 / /api/whoami 401 missing_token` 実機確認 ② **Step 3 — IDOR fix 全層改修**: 全 entity (Ticket/Sprint/Epic/UserStory/Ceremony/AgentRun/CeremonyHealthScore) に `workspaceId: string` 必須化 + zod schema 同期 + `Equal<>` drift check 維持 + memory/firestore 両 backend に workspaceId フィルタ + buildTools(repo, workspaceId) closure cap で LLM への workspaceId 引数渡しを排除 + tools 層 IDOR ガード (workspace 跨ぎ get は not found 扱い) + 既存 `/tickets` 等を `/api/*` 配下に移動して認証必須化 (旧公開ルートは 404 化) + cli/mcp-server も WORKSPACE_ID env で単一 workspace 動作。memory.ts と firestore.ts は契約一致 (workspaceId フィルタの parity test 7 件追加) ③ **Step 2 — Web ログイン UI**: `apps/web/pages/login.vue` (Hoshino クリーム + Mohave BELVEDERE + Google ロゴボタン) + `composables/useFirebase.ts` (lazy singleton) + `useAuth.ts` (onAuthStateChanged で reactive state、idToken auto-refresh) + `useApiClient.ts` ($fetch ラッパーで Bearer 自動付与) + `middleware/auth.global.ts` (未認証 → /login リダイレクト、SSR では skip) + `nuxt.config.ts` の runtimeConfig.public に Firebase config + apiBaseUrl 注入。本番 deploy 後 owner@example.com でログイン → / リダイレクト → Backlog 表示の end-to-end 動作確認済 ④ **Step 4 — Firestore Rules**: `infra/firestore.rules` (全コレクション `allow read, write: if false` ラストガード、API は Firebase Admin SDK で bypass) + `infra/firebase.json` + `docs/setup-firestore-rules.md` (ユーザー手動 deploy 5 分手順) ⑤ **初回 owner 自動登録**: `apps/api/src/config/email-allowlist.ts` で owner@example.com → ws-belvedere owner を allowlist 化、workspaceMiddleware が listByUserId 0 件時に自動 upsert する設計。会社メアド絶対拒否を test で固定 ⑥ test 拡張: vitest を apps/api に追加 (allowlist 6 + firestore-rules 8 cases)、repo に Member upsert 3 cases、計 58/58 緑 (llm 15 + repo 29 + api 14) ⑦ typecheck 10/10 緑、コミットは belvedere-commit skill で 1 commit = 1 論理変更を厳守して 6 commit に分割 push。Phase 1-B 5 日予算を 1 日で前倒し完了、Phase 1-C UI CRUD 着手予定が 6/15 → 6/11 に。 |
