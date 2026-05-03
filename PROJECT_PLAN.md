# Belvedere — 作業仕分け & 依存度マップ

> 作成日: 2026-04-29 / ハッカソン最終ピッチ: 2026-08-19（約16週間）
> 参加: DevOps × AI Agent Hackathon (Findy / GCP)

---

## TL;DR — 仕分けの結論

| カテゴリ | 担当 | 進め方 |
|---|---|---|
| プロダクト企画・設計・コード | **Claude単独で進められる** | 寝てる間/UI確認中に並行で進める |
| GCPプロビジョニング・課金・鍵 | **ユーザー必須**（CLI/コンソール作業） | 朝起きたとき30分で済む手順を用意する |
| デプロイ・本番運用 | **両方必要**（Claudeがgcloudコマンド出す → ユーザーが実行） | 詰まりやすい所だけCLI手順化 |
| 提出・ピッチ | **ユーザー必須** | Claudeはピッチ用素材まで作る |

ユーザーがGCP未経験なので、私がやれる範囲は前倒しで全部進めて、**ユーザーがやる必要があるものは「コピペで終わる手順書」**に落とす方針。

---

## 1. Claude単独で進められる作業（ローカル完結）

依存度: ⚪ なし / 🟡 他Claudeタスク待ち / 🔴 ユーザー判断待ち

### 1-A. ドキュメント・企画 (今夜中に大半着手)

| # | タスク | 産出物 | 依存 | 状態 |
|---|---|---|---|---|
| D1 | プロダクトブリーフ（誰の何を解決するか / AIエージェント必然性 / 競合差別化） | `PRODUCT_BRIEF.md` | ⚪ | 着手 |
| D2 | アーキテクチャ案 2-3 通り (GCP↔AWS対応表付き) | `ARCHITECTURE.md` | 🟡 D1 | 着手 |
| D3 | データモデル / 型定義 (Project / Epic / Story / Ticket / 儀式 / CeremonyHealthScore / エージェント実行ログ) | `DATA_MODEL.md` | 🟡 D1 | 待機 |
| D4 | AIエージェント設計 (責務・ツール・プロンプト方針・自律性レベル) | `AGENT_DESIGN.md` | 🟡 D1, D3 | 待機 |
| D5 | ロードマップ (4月末→8/19) | `ROADMAP.md` | ⚪ | 着手 |
| D6 | ピッチ骨子（Belvedere / 螺旋階段比喩 / 儀式別画面が差別化軸） | `PITCH.md` | 🟡 D1 | 待機 |

### 1-B. コード・実装 (UIモック以降の実プロダクト)

| # | タスク | 産出物 | 依存 | 状態 |
|---|---|---|---|---|
| C1 | リポジトリ構造 (monorepo) スキャフォールド | `package.json`, ワークスペース定義 | ⚪ | 着手 |
| C2 | バックエンド最小スケルトン (FastAPI or Hono on Cloud Run想定) | `apps/api/` | 🟡 C1, D3 | 待機 |
| C3 | フロントエンド最小スケルトン (Nuxt 3 / Vue 3 SSR — ガラ完了 / 中身は Claude Design 確定後) | `apps/web/` | 🟡 UI案決定待ち | 着手 |
| C4 | LLMプロバイダ抽象化 (mock / gemini / vertex 切替) | `packages/llm/` | 🟡 C1 | 待機 |
| C5 | ローカル動作する Agent ランタイム (Tool呼び出しループ) | `packages/agent/` | 🟡 C4, D4 | 待機 |
| C6 | ダミーデータシード (現在のWC-101〜112を実データ化) | `packages/seed/` | 🟡 D3 | 待機 |
| C7 | Docker化 (Cloud Run 互換) | `Dockerfile`, `cloudbuild.yaml` | 🟡 C2 | 待機 |
| C8 | ローカル開発用 docker-compose | `docker-compose.yml` | 🟡 C2, C7 | 待機 |
| C9 | テスト (ユニット最小限 + LLMはモック注入) | `*/tests/` | 🟡 C5 | 待機 |
| C10 | README / 開発手順 / トラブルシュート | `README.md` | 🟡 C1〜C9 | 待機 |

### 1-C. デプロイ準備（Claude側で書ける範囲）

| # | タスク | 産出物 | 依存 | 状態 |
|---|---|---|---|---|
| P1 | gcloud デプロイコマンド集 (ユーザーが流すだけにする) | `scripts/deploy.sh`, `DEPLOY.md` | 🟡 C7 | 待機 |
| P2 | Cloud Build / Cloud Deploy 設定 | `cloudbuild.yaml`, `clouddeploy.yaml` | 🟡 C7 | 待機 |
| P3 | GitHub Actions の Workflow (Workload Identity Federation想定) | `.github/workflows/` | 🟡 P2 | 待機 |
| P4 | 環境変数 / シークレット名一覧 (Secret Manager) | `ENV.md` | 🟡 C2 | 待機 |

---

## 2. ユーザーがやる必要のある作業（私単独不可）

依存度: 🔥 ブロッキング / 🟧 早めに / 🟢 直前でOK

### 2-A. アカウント・課金（最優先 / Boot Camp前にやっておきたい）

| # | タスク | 内容 | 依存 | 重要度 |
|---|---|---|---|---|
| U1 | Google Cloud アカウント作成 / 課金有効化 | コンソールで作業。$300無料枠あり | ⚪ | 🔥 |
| U2 | プロジェクト作成 (`kazaguruma-prod` / `kazaguruma-dev`) | gcloudで作る手順書を私が用意 | 🟡 U1 | 🔥 |
| U3 | 必要API有効化 (Cloud Run / Cloud Build / Vertex AI / Secret Manager / Artifact Registry) | gcloud services enable のスクリプト化 | 🟡 U2 | 🔥 |
| U4 | サービスアカウント発行 / IAM設定 | スクリプト化済 | 🟡 U2 | 🔥 |
| U5 | 課金アラート設定 ($50/月くらい) | コンソール作業 | 🟡 U1 | 🟧 |

### 2-B. リポジトリ・組織

| # | タスク | 内容 | 依存 | 重要度 |
|---|---|---|---|---|
| U6 | GitHub リポジトリ作成 (Public か Private か判断) | ハッカソン提出時にPublicである必要があるか要確認 | ⚪ | 🟧 |
| U7 | GitHub Secrets / Workload Identity 連携 | 私が手順書を出す | 🟡 U4, U6 | 🟧 |
| U8 | チームメンバー招待 (もしチーム参加なら) | ⚪ | ⚪ | 🟢 |

### 2-C. 提出・本番

| # | タスク | 内容 | 依存 | 重要度 |
|---|---|---|---|---|
| U9 | ハッカソン応募フォーム提出 | 応募方法は Coming Soon 中 | ⚪ | 🟧 |
| U10 | チームビルディングイベント参加 (2026/06/07 個人参加者向け) | 必要なら | ⚪ | 🟢 |
| U11 | Boot Camp 参加 (Agentic AI Bootcamp 2026) | 無料・事前申込 | ⚪ | 🟧 |
| U12 | 中間提出（あれば） | スケジュール公表待ち | ⚪ | 🟢 |
| U13 | 最終ピッチ録画 / 出演 (8/19 渋谷) | 私はピッチ素材まで | 🟡 D6 | 🟢 |
| U14 | デプロイ実行 (`gcloud run deploy`) | スクリプト化したものをユーザーが流す | 🟡 P1, U1〜U4 | 🔥 |

---

## 3. 依存度マップ（クリティカルパス）

```
[Claude] D1 PRODUCT_BRIEF
   │
   ├──▶ D2 ARCHITECTURE ──▶ C1 monorepo scaffold ──┬──▶ C2 API skeleton ──▶ C7 Docker ──▶ P1 deploy script
   │                                                │                                      ▲
   │                                                ├──▶ C4 LLM abstraction                │
   │                                                │       ▲                              │
   │                                                │       │                              │
   ├──▶ D3 DATA_MODEL ──▶ C6 seed                  └──▶ C3 web skeleton                   │
   │       │                                                                               │
   │       └──▶ D4 AGENT_DESIGN ──▶ C5 Agent runtime                                       │
   │                                                                                       │
   └──▶ D5 ROADMAP ─── D6 PITCH                                                            │
                                                                                           │
[User]                                                                                     │
   U1 GCP account ──▶ U2 project ──▶ U3 APIs ──▶ U4 service account ──────────────────────▶ U14 deploy
                                                                       │
                                                                       └──▶ U7 GitHub WIF
```

**最も詰まりやすいポイント**:
1. `U1〜U4` のGCPセットアップ → 私が手順書を完成させ、ユーザーは30分で終わるようにする
2. `C5` Agent ランタイム → モックLLMで先に動かして、本物Geminiは差し替え式に
3. `U14` の初回デプロイ → 必ず詰まるので、Claudeがログ見れる状態（!gcloud … で出力共有）でやる

---

## 4. 私のこれからの動き（auto mode）

ユーザーがUIを見ている / 寝ている間に並行で：

1. **D1 PRODUCT_BRIEF.md** を書く（Belvedere のコンセプトを審査基準1〜5に合わせて言語化）
2. **D5 ROADMAP.md** を書く（16週間を逆算）
3. **D2 ARCHITECTURE.md** を書く（GCP↔AWS対応表 + Mermaid図）
4. **D3 DATA_MODEL.md** + **D4 AGENT_DESIGN.md**
5. **C1 monorepoスキャフォールド** + **C4 LLM抽象化** + **C5 mock Agent runtime** で「ローカルでエージェントが動く」最小プロトタイプ
6. **U1〜U4の手順書 (`docs/setup-gcp.md`)** を完成させる

UIは20案のうちユーザーが選んだ方向性を聞いてから C3 を着手する（Tailwind移植かCSS Modulesかも含めて）。
