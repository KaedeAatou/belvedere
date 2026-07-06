# Belvedere — Roadmap

> 起点: 2026-04-29 / **唯一のゴール: 2026-07-10 23:59 (作品提出)** / 8/19 最終ピッチ は提出物そのままで参加
> 個人参加確定 (チーム化なし)
>
> **2026-06-10 確定改訂 (= ハッカソン応募方針の固定)**:
> - **7/11 以降コード作業ゼロ**を方針確定 ([[memory: feedback-post-submission-no-code]])
> - **Phase 4 (7/28-8/19) を全面削除**: OWASP / a11y / 観測 / ドッグフード強化 / リハーサルは全カット
> - **提出後の一次/二次審査期間 (7/13-27) も追加実装ゼロ**: Reviewer Multimodal / ADK 後実装 / CeremonyHealthScore / GitHub 連携 を全削除
> - **ADK 本物実装を Phase 3-A に圧縮**: Gemini 接続 + Orchestrator Multi-Agent と同時に完成させる (= スクラムマスター AI として複数 Agent を操る構成)
> - **Pub/Sub + AI Integrity Panel リアル配線を復活**: Mock のままだと「動く SaaS」と言えないため Phase 2 として 3 日確保
> - **Reviewer Multimodal は削除**: Orchestrator Multi-Agent をキラーシーンの中心に据える (B-1 強化軸の置換)
> - 8/19 最終ピッチに進出した場合は **提出時の動画・スライド・GitHub をそのまま使う**
>
> **設計指針**: 提出は 7/10 23:59 をハードラインとし、バッファゼロ + 徹夜カバー前提の 30 日計画。

---

## ガントチャート (Mermaid)

```mermaid
gantt
    title Belvedere Roadmap (2026-04-29 → 2026-07-10 提出) — 2026-06-10 確定改訂
    dateFormat  YYYY-MM-DD
    section 0. ローカル基盤 (完了)
    Mock LLM + Web UI + Type 設計    :done, 2026-04-29, 2026-05-04
    MCP server (stdio + CRUD)        :done, 2026-05-05, 1d
    section 1-A. GCP 基盤 (完了)
    WIF + Cloud Run 初回 deploy      :done, milestone, 2026-05-06, 1d
    section 1-Day0/1-B コア (完了)
    Web Cloud Run 初回 deploy        :done, 2026-06-08, 1d
    Firestore backend 実装           :done, 2026-06-09, 1d
    deploy-web.yml 自動デプロイ化    :done, 2026-06-09, 1d
    vitest 34 件 + zod validation    :done, 2026-06-09, 1d
    prompts XML 構造化               :done, 2026-06-09, 1d
    section 1-B. 認証 (これから)
    U-Auth1 Firebase Console 有効化  :crit, 2026-06-10, 1d
    Firebase Auth + IDOR fix         :2026-06-11, 4d
    section 1-C. UI CRUD
    Web ↔ API 接続 / 編集 / 起票    :2026-06-15, 5d
    section 1-D. MCP Cloud Run
    MCP HTTP + Cloud Run + ドッグフード :2026-06-20, 5d
    section 1-E. マルチテナント完成
    招待 UI 最小実装                 :done, 2026-06-25, 2d
    section 3-A. Agent 本実装
    Gemini + ADK + Orchestrator A2A  :2026-06-27, 4d
    section 2. AI Panel リアル配線
    画面操作トリガ + AI Panel 配線    :2026-07-01, 3d
    section 3-B. RAG
    Elastic Cloud + Gemini RAG       :2026-07-04, 4d
    section 3-C. 提出準備
    ピッチ動画 / スライド / Proto Pedia :crit, 2026-07-08, 3d
    作品提出 (7/10 23:59)            :crit, milestone, 2026-07-10, 1d
    section 提出後 (コード作業ナシ)
    一次審査                         :milestone, 2026-07-13, 5d
    二次審査                         :milestone, 2026-07-21, 4d
    結果通知                         :milestone, 2026-07-30, 1d
    最終ピッチ (進出時のみ参加)      :crit, milestone, 2026-08-19, 1d
```

---

## マイルストーン詳細

### Phase 0 / 4/29 〜 5/12 — ✅ 完了
ローカルで Mock LLM + Web UI + MCP まで動く状態。詳細は git 履歴参照。

### Phase 1-A / 5/13-17 → ✅ 完了 (5/6)
GCP セットアップ + WIF setup。`belvedere-dev-atrium` プロジェクトでの鍵レス CI/CD 確立。

### Phase 1-Day0 + 1-B コア / 6/8-9 → ✅ 完了
- [x] Web Cloud Run デプロイ + 自動デプロイ
- [x] Firestore backend (`packages/repo/src/firestore.ts`) 実装 + zod runtime validation
- [x] vitest 34 件 + CI で自動実行
- [x] prompts.ts + agents.py を XML 構造化 (Anthropic Prompting 101 準拠)
- [x] アジャイル知識ベース (references/agile-knowledge-base/ 7 ファイル / 1037 行)

### Phase 1-B 認証 / 2026-06-10 〜 6/14 (5 日 → 1 日で前倒し完了)

- [x] **U-Auth1 (👤)**: Firebase Console で Authentication 有効化 + Google provider (15 分、docs/setup-firebase-auth.md 参照)
- [x] `apps/api` に Firebase Admin SDK 認証ミドルウェア (Authorization: Bearer 検証) — Step 1 / 2026-06-10
- [x] `apps/web` に Firebase JS SDK ログイン UI (`/login` ページ + signInWithPopup) — Step 2 / 2026-06-10
- [x] Web → API リクエストに ID token 自動付与 (composable useApiClient)
- [x] **workspaceId 全層改修 (IDOR fix)**: RepoContainer / TicketQuery / 全 caller に workspaceId を通す — Step 3 / 2026-06-10
- [x] **初回 owner 自動登録** (email allowlist で Firebase UID 自動 bind / `apps/api/src/config/email-allowlist.ts`)
- [x] `infra/firestore.rules` ラストガード (allow if false で API 経由を強制) — Step 4 / 2026-06-10
- [x] **U-Rules1 (👤)**: `firebase deploy --only firestore:rules` 実行済 (2026-06-12 / `released rules to cloud.firestore` 確認。ライブは `allow read,write: if false` でクライアント直叩きを全 block)

**達成**: 6/10 深夜にログイン → /api/whoami → 200 OK で owner@example.com が ws-belvedere の owner として認識される end-to-end 動作確認済。
test 58/58 緑 (llm 15 + repo 29 + api 14)、typecheck 10/10 緑。
4 日前倒し完了で Phase 1-C 着手が 6/11 に早まる。

### Phase 1-C Web UI CRUD / 6/11 〜 6/19 (Phase 1-B 前倒し完了で 9 日確保)
- [x] バックログから新規チケット起票 (Live セクション + 作成ダイアログ / 2026-06-10)
- [x] e2e 基盤 Stage 1-3 (Playwright + 失敗時 Belvedere 自動起票 + 重複防止 / 2026-06-10 前倒し)
- [x] **R1: Reviewer Multimodal 死骸の除去 + 死設定掃除** (2026-06-11 / コード完了。docs 訴求部 = PITCH キラーシーンはエスカレーション保留)
- [x] **R2: stripUndefined / ID 採番の重複排除** (2026-06-11)
- [x] **T1-T4 + T6: チケット種別 + ルールエンジン (17 ルール) + ルール API + 見積もりポーカー API** (2026-06-11 / バックエンド完結、test 154/154 緑)
- [x] **R3: Demo/Live UI 統一** (DemoTicket→shared Ticket / 5 画面の実 API 化、2026-06-11 UI epic 無人実行 + §V スクショ検証で完了)
- [x] **T5: 種別バッジ + 作成ダイアログ種別セレクタ + 行内 finding バッジ** (2026-06-11)
- [x] **T7: 見積もりパネル (DetailSheet) + ポーリング** (2026-06-11)
- [x] **T8: ポーカー happy-path + Backlog バッジ e2e** (2026-06-11 / e2e で API バグ 3 件検出→修正)
- [x] **T9: Refinement 専用画面** (2026-06-11 / ルール別ワークキュー + ポーカー開始導線。2026-06-13 儀式モデル確定で **3 区画ビューへの作り直しが必要になった** → 下の「儀式画面を 3 区画モデルに再設計」項目で扱う / コード未追随)
- [x] **T10: DetailSheet チケット編集 + 削除** (2026-06-11)
- [x] **velocity 用語統一** (capacity 廃止 → SPRINT_OVER_VELOCITY。UI/ルール/prompt/Mock LLM/docs 一括 / 2026-06-11)
- [x] **UI 再設計 (デザインフィードバック)**: 画面タイトル/stat 重複の排除、Daily Burndown を SP×velocity で再構成、Retro Try carry-forward 積み上げ (d&d)、サイドバー Artifacts 整理 (Firestore 永続 + retro.tries.list Tool で儀式 Agent のコンテキスト化 / 2026-06-12)
- [x] **Sprint 開始フロー (B案)**: PATCH /api/sprints/:id + POST /api/sprints/:id/start (planned→active + velocity 確定)。ゴールは Planning のアウトプット + POST /api/sprints 新規作成 (0 から計画する入口 / 2026-06-12)
- [△] AI Integrity Panel: Mock LLM 経由の Agent 会話 (`useAgentChat` → POST /api/agents/:name) + 静的ルールチェック finding ピル表示は実装済。**Pub/Sub リアル配線 (本物 Agent 出力のリアルタイム表示) は Phase 2 待ち**
- [x] **儀式画面を 3 区画モデルに再設計 (2026-06-13 着手 / 2026-06-16 完了)**: Backlog / Refinement / Planning を CURRENT/NEXT/BACKLOG の 3 区画共通ビュー (`SprintSectionedList.vue` + `useSprintSections.ts`) に統一 (orderIndex 共有 / 区画跨ぎ d&d でスプリント移動)。画面差は起票できる種別と目的のみ。チケットの流れは Backlog で US 起票 → Refinement で最小価値 Story に分割 → Planning で task/spike に分割
- [x] **スプリント常時稼働 + カデンス前進 (2026-06-16)**: active 1 + planned 1 を常在 (`ensureSprintCadence` を GET で lazy 補充)。開始 = 現スプリント完了 → next 繰上げ → 新 'Next Sprint' 自動生成。`Sprint.name` 新設。手動「新規作成」UI 撤去
- [x] **d&d 並び替えの堅牢化 (2026-06-16)**: `orderIndex` 破綻を区画密再採番 (`ORDER_STEP`) で根治 / `generateId` を短いランダム id 化し同一ミリ秒衝突を根絶 / 自前 native DnD を vue-draggable-plus へ移行し死蔵 `useTicketReorder` を撤去 (Tier1 完了、Tier2/3 は未実施)
- [x] **テスト規律 + 実機 UI 検証 SOP 常設化 (2026-06-16/17)**: `.claude/rules/testing.md` (共有純粋関数の直接テスト / 実データ状態 / 再現テスト先行) + `compareTicketOrder`・未設定状態 d&d の回帰テスト + `scripts/dev-local-noauth.sh` + `local-ui-verify` skill

> **2026-06-17 現在地**: Phase 1-C 実質完了 (test 284 緑 / typecheck 緑) + **Phase 1-D (MCP ドッグフード) も前倒し完了** — MCP を本人認証 (per-user API キー) で本番接続し、`belvedere-ticket-cycle` skill + 毎時 /loop で「web 起票→MCP→修正→review」を自動化 (done はユーザー受け入れ)。**残るクリティカルパス = Phase 3-A (Gemini + ADK 本実装 / A-2 要件・B-1 キラー)** + 提出物 (Phase 3-C)。AI Integrity Panel のリアル配線 (Phase 2) は Phase 3-A の後。**次の着手対象 = Phase 3-A**。

### Phase 1-D MCP HTTP クライアント化 + ドッグフード開始 / 2026-06-17 ✅ 実質完了 (前倒し / 縮退ライン通り stdio)
- [x] **MCP server を Belvedere API の HTTPS クライアントに刷新** (stdio のまま。Cloud Run への MCP デプロイは縮退ライン 6/24 通り見送り = ローカル Claude Code 経由)。デプロイ済み dev Firestore を実データで読み書き
- [x] **2 認証モード**: サービストークン (`svc:mcp` / po 最小権限 / 機械用) / **per-user API キー (`blv_...` / sha256 ハッシュ保管 / 発行・失効 UI を設定画面に追加 / 本人用)**。OAuth 2.1 でなく per-user API キーで簡素化。Firebase refresh token 経路は attack surface 削減のため 2026-06-17 廃止 (① で代替可・取得 UI 無し)
- [x] Claude Code から本番 Belvedere の MCP に **本人認証で接続** (ws-belvedere-dev)
- [x] **ドッグフード開始**: 「web で起票 → MCP 取得 → ローカル修正 → デプロイ → review」が実データで稼働。`belvedere-ticket-cycle` skill + `/loop 1h` で毎時自動巡回 (明確は実装→review / 曖昧は相談、done はユーザー受け入れ)。初回: SP ポーカー化 (WC-9460f690) / スプリント名表示 (WC-c6d339fb)

### Phase 1-E マルチテナント完成 (招待 UI 最小実装) / 6/25 〜 6/26 (2 日)
(2026-06-12 前倒し完了 — Phase 1-C 中に実装。Workspace 作成 + 切替 UI も追加)
- [x] Workspace owner 画面に「メンバ招待」セクション追加
- [x] email 入力 → Firestore に Member レコード作成 (role: 'po' / 'sm' / 'dev' から選択 / 'guest' は 2026-06-23 権限再設計で廃止)
- [x] 招待された人がログインすると自動加入
- [x] (最小実装: 招待メール送信は手動コピペ通知で OK / Cloud Function 不要)

### Phase 3-A Gemini + ADK + Orchestrator Multi-Agent / 6/27 〜 6/30 (4 日) ★★ B-1 キラー

- [x] **`packages/llm/src/gemini.ts` 実装** — `LLM_PROVIDER=gemini` で Mock を置換 (本番 Cloud Run dev/prod で稼働 / `/health` llm=gemini)
- [x] **ADK 本物実装** (`apps/orchestrator-py/src/orchestrator/agents.py:build_agents(use_real_adk=True)` が実 `LlmAgent`×6 + `FunctionTool` を構築)
- [x] **Orchestrator Multi-Agent (= スクラムマスター AI / 単一窓口)**:
  - Orchestrator が画面操作を受けて 5 儀式 Agent を `agent.invoke` で協議招集・統括 (**本番編成は自前 TS runAgent** / 子には invoke を渡さず**深さ1を構造保証** + コストキャップ / トリガは画面操作のみ)
  - **Refinement のみ ADK ピアに A2A 委譲**できる (Strangler Fig / 不達時は TS へ自動 fallback)。← 旧「Orchestrator が 5 子を ADK で宣言編成」案は不採用、Refinement 単位の A2A 委譲に確定 (2026-06-25)
  - ふりかえりで Retrospective が Try 集約 → 翌スプリント Planner に引き継ぎ (RAG で意味検索)
  - (スケジュール / 時刻ルーティングによる自動起動は不採用)
- [x] FastAPI `/agents/{name}/invoke` + A2A (`to_a2a`) を実 ADK 経路で実装
- [ ] Cloud Run に orchestrator-py をデプロイ (⚠ deployer SA の artifactregistry 権限が前提で未完 = 提出前の作業。A2A 委譲は既定 OFF なので本番 5 儀式は無傷)

### Phase 2 AI Integrity Panel リアル配線 / 7/1 〜 7/3 (3 日)
- [x] 画面操作 → `/api/agents/:name` 同期起動 → Orchestrator が該当 Agent を協議招集・統括
- [x] AI Integrity Panel が本物の Agent 出力を表示 (同期応答 + Web polling)
- [x] (スケジュール / Pub-Sub による自動起動・自律 Slack 通知は不採用)

### Phase 3-B Gemini RAG (Firestore Vector / Elastic 切替可) / 7/4 〜 7/7 (4 日)
- [x] `references/agile-knowledge-base/*` を chunk して Gemini Embeddings (768 次元) で vector 化 → **Firestore Vector に投入** (Elastic にも env 1 つで切替可)
- [x] Refinement / Retrospective Agent に `knowledge.search` Tool 追加
- [x] 過去 Try (retro.tries) も同じ RAG に投入 (workspace 別) → 「前回 Try は守られたか」を sourceId 付きで参照
- [x] デモシナリオ: 相談 → Agent が過去 Try + Scrum 知識を引いて講評 (dev で findNearest ヒット実証済)
- [ ] U-Sub2 (👤): Elastic Cloud トライアル契約 (任意 / 本番は Firestore Vector を主に採用)

### Phase 3-C 提出準備 / 7/8 〜 7/10 (3 日 + 徹夜カバー)
- [ ] **ピッチ動画 (3 分以下)** 撮影 + 編集
- [ ] **スライド (10 枚以内)** 作成
- [ ] **U-Sub3 (👤)**: Proto Pedia に動画アップ + 説明文 + `findy_hackathon` タグ
- [ ] **U-Sub4 (👤)**: 応募フォーム送信 (GitHub URL / デプロイ URL / Proto Pedia URL 必須)
- [ ] **2026-07-10 23:59 ✉ 提出**

---

## 提出後 / 8/19 最終ピッチ (コード作業なし)

| 期間 | 動き |
|---|---|
| 7/11-12 | コード作業なし (休息) |
| 7/13-17 | 一次審査期間 (運営事務局)、こちらは何もしない |
| 7/21-24 | 二次審査期間 (外部有識者)、同上 |
| 7/30 | 結果通知 |
| 7/31-8/18 | 進出した場合のみ: スライド読み合わせ / プレゼン練習 (コードは触らない) |
| 2026-08-19 | 最終ピッチ in 渋谷ストリーム (進出時のみ参加) — **提出時の動画・スライド・GitHub をそのまま使う** |

---

## 縮退判断ポイント (2026-06-10 改訂)

| 期限 | 条件 | 縮退案 |
|---|---|---|
| **2026-06-14** | Phase 1-B (認証 + IDOR fix) 完了見えない | IDOR fix を諦め、workspaceId 引数を全層に通すだけで実フィルタは Phase 5 (= 提出後別件) に逃がす |
| **2026-06-19** | Phase 1-C (UI CRUD) 完了見えない | チケット起票機能だけに絞る、編集は提出後 |
| **2026-06-24** | Phase 1-D (MCP Cloud Run) 完了見えない | MCP は stdio のまま提出、ドッグフードはローカル Claude Code 経由 |
| **2026-06-26** | 招待 UI 完了見えない → 2026-06-12 完了済 | 「個人開発 SaaS」のまま提出、ピッチで「マルチテナント設計は完備、招待 UI は次フェーズ」と説明 |
| **2026-06-30** | Phase 3-A (ADK Multi-Agent) 不調 | 雛形 + Gemini 1 回呼び出しまで縮退、A-2 要件は守る |
| **2026-07-03** | Phase 2 AI Panel 配線が不調 | finding ピル + 静的ルールチェックの提示に絞り、Agent 出力は手動更新で縮退 |
| **2026-07-07** | Elastic RAG 完成見えない | L2 markdown を prompt 埋込で擬似 RAG (Elastic 接続なし)、協賛企業活用枠は失うが提出は守る |
| **2026-07-10 朝** | ピッチ動画未完成 | 60 秒の短縮版を朝撮り直し、徹夜カバー |

---

## 個人参加確定

- **チーム化なし** (6/7 チームビルディング参加済だが個人完走方針)
- Claude (= 私) が全タスク担当 + Belvedere + MCP + Claude Code を駆使してドッグフード
- ボトルネックは「ユーザーが GCP 操作する時間」と「個人の睡眠時間」のみ
- Bootcamp 不参加、Phase 4 削除のため 8 月のリハーサル期間もコード作業なし
