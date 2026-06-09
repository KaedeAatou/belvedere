# Belvedere — Roadmap

> 起点: 2026-04-29 / **中間ゴール: 2026-07-10 23:59 (作品提出)** / 最終ゴール: 2026-08-19 最終ピッチ in 渋谷ストリーム
> 個人参加確定 (チーム化なし)
> **2026-06-08 改訂**: Phase 1-B/C/D が期限超過 (Phase 1-A 完了 5/6 以降 33 日コミットゼロ)。6/8 起点で残り 32 日に圧縮再計画。
> 改訂の主な変更:
> - 「今夜 Web を Cloud Run にデプロイ」を Phase 1-B 着手前の **Day 0** に追加 (動く SaaS の最短取得)
> - Phase 1-E (ピッチデモ動画) を Phase 3 末 7/8-9 に移動
> - Phase 3 に **Elastic + Gemini RAG 連携 (B 案: 過去 Retrospective 横断検索)** を追加。協賛 Elastic 技術活用 + B-1 評価加点狙い
> - 縮退判断ポイントを 6/14 / 6/21 / 6/28 / 7/5 / 7/9 に再設定

---

## 設計指針 (4 段階に分割した理由)

1. **Agent 開発が初経験** → まず Jira 風 SaaS を作る経験を Phase 1 で積む
2. **トリガ可視化を先に作る** → Phase 2 で「いつ AI が動くか」を Mock のまま UI に出すことで、Phase 3 で本物 LLM に置換した時に UI 体験は無変更で質だけ上がる
3. **MCP を Phase 1 に前倒し** → Phase 2-3 の開発期間中、Belvedere 自身を Belvedere + MCP + Claude Code で管理する究極のドッグフード
4. **Elastic + Gemini RAG を Phase 3 末に滑り込ませ** → 「過去 Try を横断検索する Agent」をピッチキラーシーン化 (B-1 評価加点)

---

## ガントチャート (Mermaid)

```mermaid
gantt
    title Belvedere Roadmap (2026-04-29 → 2026-08-19) — 2026-06-08 改訂
    dateFormat  YYYY-MM-DD
    section 0. ローカル基盤 (完了)
    Mock LLM + Web UI + Type 設計 :done, 2026-04-29, 2026-05-04
    MCP server (stdio + CRUD)     :done, 2026-05-05, 1d
    section 1. 手動 Belvedere SaaS
    GCP セットアップ + WIF        :done, milestone, 2026-05-06, 1d
    Cloud Run API 初回デプロイ    :done, milestone, 2026-05-06, 1d
    Web を Cloud Run にデプロイ   :crit, active, 2026-06-08, 1d
    Firestore + Firebase Auth     :crit, 2026-06-09, 6d
    Web UI で CRUD 動作           :2026-06-15, 7d
    MCP server Cloud Run デプロイ :2026-06-22, 7d
    section 2. Agent トリガ可視化 (Mock)
    Pub/Sub + Cloud Scheduler     :2026-06-29, 4d
    AI Integrity Panel (Mock)     :2026-07-01, 2d
    section 3. Agent 本実装 (提出ライン)
    Vertex AI Gemini 接続         :2026-07-03, 3d
    Elastic + Gemini RAG          :2026-07-05, 5d
    ピッチ動画 / Proto Pedia 登録 :2026-07-08, 3d
    作品提出 (7/10 23:59)         :crit, milestone, 2026-07-10, 1d
    一次審査 (運営事務局)         :2026-07-13, 5d
    Reviewer Multimodal           :2026-07-13, 5d
    Python ADK ランタイム接続     :2026-07-18, 4d
    二次審査 (外部有識者)         :2026-07-21, 4d
    CeremonyHealthScore 計算      :2026-07-23, 4d
    GitHub 連携 (activity/pr.diff) :2026-07-27, 3d
    結果通知                      :crit, milestone, 2026-07-30, 1d
    section 4. 仕上げ + ピッチ
    OWASP / a11y / 観測           :2026-07-31, 7d
    ドッグフード強化              :2026-08-04, 5d
    ピッチ動画決定版 / スライド   :2026-08-09, 5d
    リハーサル                    :2026-08-13, 5d
    最終ピッチ                    :crit, milestone, 2026-08-19, 1d
```

---

## マイルストーン

### Phase 0 / 4/29 〜 5/12 — **「ローカル基盤」** ✅ 完了

ゴール: GCP 接続なしで `pnpm dev` から Mock LLM + Web UI + MCP まで動く状態。

- [x] UI スタディ → Claude Design に切替 (5/3)
- [x] PRODUCT_BRIEF / ARCHITECTURE / DATA_MODEL / AGENT_DESIGN / PITCH 確定 (5 儀式 + Project + valueImpact + ReviewRecording + Epic.rationale)
- [x] monorepo scaffold (TypeScript pnpm workspace 11 packages + Python uv)
- [x] LLM プロバイダ抽象 (mock 実装 / gemini / vertex は throw)
- [x] Mock Agent runtime (Tool 呼び出しループ + 6 ロール)
- [x] Web UI 最小版 (Nuxt 3 + Vue 3 SSR / Claude Design 由来 5 画面 + AI Panel)
- [x] git init + 個人 GitHub push (KaedeAatou/belvedere、5/6 public 化)
- [x] Eraser アーキ図 + 自動同期 hook
- [x] **MCP server (stdio mode / 11 Tools)**: 読み取り 6 + invoke_agent + **CRUD 4 本実装** (前倒し)。Smoke test **14/14 pass**

### Phase 1 / 5/13 〜 6/28 — **「手動 Belvedere SaaS」** 🟡 進行中

ゴール: **Agent なしの Jira 風 SaaS** が Cloud Run で動く。Web UI で人間がチケット起票・編集・進捗変更ができる。MCP も Cloud Run 上にホストされ、Claude Code から本番 Belvedere を操作できる = ここから自分が Belvedere の最初のヘビーユーザーに。

#### Phase 1-A: GCP 基盤 (5/13-17 → ✅ 完了 2026-05-06)
- [x] **GCP セットアップ** (個人 `owner@example.com` / `belvedere-dev-atrium` + `belvedere-prod-atrium` / API 14 個有効化 / Firestore Native asia-northeast1 / Artifact Registry "belvedere" / Service Account `belvedere-runtime` + 9 ロール / 課金アラート $10/月)
- [x] **WIF セットアップ**: `belvedere-ci-pool` + `belvedere-ci-github` Provider + `belvedere-deployer` SA (6 ロール)
- [x] `.github/workflows/deploy-api.yml` 修正完了 (WIF_PROVIDER 実値置換 + push トリガ復活)
- [x] **Cloud Run API 初回デプロイ完了** (2026-05-06): `https://belvedere-api-dev-cpszmcqmuq-an.a.run.app/health` で 200 OK
- [x] Cloud Build → Cloud Run CI (WIF 経由) 動作確認済
- [x] **GCP クレジット適用済** (2026-05-09): ハッカソンクーポン ¥47,867 + Free Trial ¥47,847 = 計 ¥95,714

#### Phase 1-Day0: Web を Cloud Run にデプロイ (2026-06-08 → ✅ 完了)
- [x] **`apps/web/Dockerfile` + `infra/cloudbuild.web.yaml` 作成** (commit `1f1129b`)
- [x] **`gcloud builds submit` で Web を Cloud Run にデプロイ** (1m59s 完了)
- [x] `https://belvedere-web-dev-cpszmcqmuq-an.a.run.app/` で 5 儀式 UI が見える状態 (Mock データ)
- [x] 動く SaaS 公開 URL 入手 → ハッカソン審査用デモ URL の初期版
- [x] **(追加 2026-06-09)** `.github/workflows/deploy-web.yml` で push 時自動デプロイ化 (commit `af417d1`)

> なぜこれを最初に: UI は既に Mock データで動いている (17 SFC 実装済)。Firestore より先にデプロイすれば「動く SaaS の公開 URL」が今夜手に入る。Firestore 接続 (Phase 1-B) は明日以降でも、見た目は今夜から動く。

#### Phase 1-B: データ層 + 認証 (6/9-14)
- [x] **Firestore データ層** (`packages/repo/src/firestore.ts` 実装 2026-06-09 / commit `ccc9983`)
- [x] seed の Firestore 投入スクリプト + 読出検証 (`scripts/seed-firestore.ts` + `check-firestore.ts` / commit `e932a2f`)
- [x] **Cloud Run API を REPO_BACKEND=firestore で再デプロイ + `/health` / `/epics` で実データ返却確認** (commit `9d2aed5`)
- [ ] Firestore セキュリティルール (個人 Google アカウントだけ read/write)
- [ ] **Firebase Auth (個人 Google)** で UI / API / MCP を保護 ← Phase 1-B 残作業

#### Phase 1-C: Web UI で CRUD 動作 (6/15-21)
- [ ] チケット詳細画面で **編集 / status 変更 / Epic 紐付け / SP 設定** が UI でできる
- [ ] バックログから新規チケット起票
- [ ] Sprint 切替 / Epic 一覧 / メンバ表示
- [ ] AI Integrity Panel は **空の枠だけ** (Phase 2 で中身を流し込む準備)

#### Phase 1-D: MCP を Cloud Run へ (6/22-28)
- [ ] **MCP server を Cloud Run にデプロイ** (HTTP / Streamable HTTP transport 追加、stdio と両対応)
- [ ] OAuth 2.1 認証 (個人 Google アカウント) で MCP HTTP を保護
- [ ] Claude Code から本番 Belvedere の MCP に接続 → CRUD 操作の実利用開始
- [ ] **「Belvedere 自身の開発を Belvedere + MCP + Claude Code で管理する」ドッグフード開始**

---

### Phase 2 / 6/29 〜 7/2 — **「Agent トリガ可視化 (Mock)」** (圧縮 4 日)

ゴール: 「**いつ AI が動くか**」が UI で見える。Agent 中身は Mock のままだが、Pub/Sub / Cloud Scheduler / AI Panel の **配線が完成** していて、Phase 3 で本物 Gemini に差し替えれば即動く状態。

- [ ] **Pub/Sub トピック設計**: `ticket.created` / `ceremony.upcoming` / `try.persisted` / `review_recording.uploaded`
- [ ] **チケット保存 → Pub/Sub publish → Mock Agent runtime 起動** (チケット詳細画面で「AI が診断中...」表示)
- [ ] **AI Integrity Panel が Mock 応答を即時表示** (現在の `packages/llm/src/mock.ts` 出力を JSON で受けて UI レンダリング)
- [ ] **Cloud Scheduler 設定**: 月曜 08:30 (Planner) / 平日 09:55 (Daily) / 木曜 14:30 (Refinement) / レビュー前日 17:00 (Reviewer) / ふりかえり当日 16:00 (Retro)
- [ ] Live Activity 画面 / Slack 通知は時間が許せば、ダメなら Phase 3 後ろに回す
- [ ] **(2026-05-06 確定)** 応募提出は **2026-07-10 (金) 23:59** 1 発提出 (中間提出は無し)。提出 STEP③ で **公開 GitHub URL / デプロイ URL / Proto Pedia URL** の 3 件必須

---

### Phase 3 / 7/3 〜 7/27 — **「Agent 本実装」** (提出前半 + 一次審査期間中)

ゴール: Mock LLM を本物 Gemini に差し替え、Multimodal / RAG / マルチエージェントが本気で動く。
**7/3-9 は提出ライン (Gemini 接続 + Elastic RAG + ピッチ動画)、7/13 以降は一次審査期間中の追加実装**。

#### 提出前 (7/3-9): A-2 達成 + ピッチ動画
- [ ] **Vertex AI Gemini 接続** (`packages/llm/src/gemini.ts` 実装) — `LLM_PROVIDER=gemini` に切替で Phase 2 の枠に本物応答が流れ込む
- [ ] **Elastic + Gemini RAG (B 案 5〜7 日)**: 過去 Retrospective Try を Elastic Cloud に index、Refinement / Retrospective Agent が「似た Try あった?」で横断検索 → 提案精度UP
  - 7/3-4: Elastic Cloud 契約 + index 設計 (dense_vector + BM25 ハイブリッド)
  - 7/5-7: Gemini Embeddings (text-embedding-004) で ingest pipeline 構築
  - 7/8-9: Refinement / Retrospective Agent から RAG 呼び出し統合 + ピッチデモシーン録画
- [ ] **ピッチ動画 (3 分 / Proto Pedia 用)** + Proto Pedia 登録 + README 仕上げ
- [ ] **作品提出 (7/10 23:59)**: 公開 GitHub URL / デプロイ URL / Proto Pedia URL + `findy_hackathon` タグ

#### 提出後 (一次審査期間中 7/13-27): 上積み
- [ ] **Reviewer Multimodal**: Sprint Review 録画 → 指摘抽出 → Ticket 起票候補 (Gemini 2.5 Pro Vision + Cloud Storage)
- [ ] **Python ADK ランタイム接続** (`USE_REAL_ADK=true` 経路実装、`apps/orchestrator-py/src/orchestrator/agents.py`)
- [ ] **CeremonyHealthScore 計算** (出席率 / onTime / actionableOutputs / qualityRate を 4 軸で実計算)
- [ ] **ユーザー GitHub 連携**: `github.activity` (Daily の停滞検出強化) / `github.pr.diff` (Reviewer のデモシナリオ補強)
- [ ] **エージェント間メッセージング** (A2A) — Orchestrator から各 Agent への fan-out
- [ ] prompts.ts の XML 構造化 + Few-shot 例追加 (`docs/PROMPTING_GUIDE.md` 準拠)

---

### Phase 4 / 7/28 〜 8/19 — **「仕上げ + 最終ピッチ」**

- [ ] OWASP リリースゲート (Cloud Build に組込み)
- [ ] a11y 監査 (5 画面 / WCAG AA)
- [ ] Cloud Logging + Cloud Trace でコスト・レイテンシ監視
- [ ] パフォーマンスチューニング (Mock LLM → 本物 Gemini への置換でレイテンシ増を吸収)
- [ ] ドッグフード強化 (友人 2-3 人にも触ってもらい、UX 修正)
- [ ] **ピッチ動画決定版 (3 分)** + スライド (10 枚以内)
- [ ] デモシナリオ確定 (90 秒で価値が伝わる流れ — `PITCH.md §4`)
- [ ] リハーサル ×3 (8/13-)
- [ ] 最終ピッチ in 渋谷ストリーム (8/19)

---

## 週次の作業リズム (推奨)

- 月: 計画 / 先週ふりかえり (Phase 1-D 完了後は Belvedere + MCP + Claude Code でドッグフード実施)
- 火-木: 実装
- 金: 統合 / デプロイ / ドッグフード
- 土: 文書整理 / ピッチ素材
- 日: 休息

---

## 中止・縮退の判断ポイント (2026-06-08 全面改訂)

| 期限 | 条件 | 縮退案 |
|---|---|---|
| **2026-06-08 夜** | Web Cloud Run デプロイで /health 200 が出ない | `infra/cloudbuild.web.yaml` を見直し / Nuxt Dockerfile を multi-stage 化検討 |
| **2026-06-14** | Phase 1-B (Firestore) 完了見えない | memory backend のまま提出 (Firestore 諦め)、REPO_BACKEND=memory で運用 |
| **2026-06-21** | Phase 1-C (UI CRUD) 完了見えない | UI CRUD 縮退 (read-only)、編集は MCP 経由のみに集約 |
| **2026-06-28** | Phase 1-D (MCP Cloud Run) 完了見えない | MCP は stdio のままで提出、ドッグフードはローカル Claude Code 経由 |
| **2026-07-05** | Gemini 本物推論 1 回も動かない | Mock 提出 (A-2 🔴 受容、ピッチで「配線済み・本物は将来差し替え」と説明) |
| **2026-07-09** | Elastic + Gemini RAG が間に合わない | 提出後 Phase 3 後半 (7/13-27) に追加。ピッチでは「展望」として触れる |
| **2026-08-04** | **無料トライアル終了** | GCP クレジット ¥95,714 適用済で 8/末まで残予算十分 (`memory/project_gcp_credit_state.md`)、要モニタリング |

---

## 個人参加確定 (2026-06-08 確定)

- **チーム化なし** (6/7 チームビルディング参加済だが個人完走方針)
- Claude (= 私) が全タスク担当 + Belvedere + MCP + Claude Code を駆使してドッグフード
- ボトルネックは「ユーザーが GCP 操作する時間」と「個人の睡眠時間」のみ
- 6/27 19:00 のイベント 1 件のみ予定 (詳細別途)
- Bootcamp (Agentic AI / Elasticsearch) **不参加**
