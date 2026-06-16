# Belvedere — 作業仕分け & 依存度マップ

> 作成日: 2026-04-29 / **2026-06-09 改訂**: Phase 1-A 完了 (5/6) + Phase 1-Day0 完了 (6/8) + Phase 1-B コア完了 (6/9) の現状に同期。残作業を「Claude 自走可能」「ユーザー判断必要」に分けて整理。
> **2026-06-17 追記**: Phase 1-B 認証 (6/10) + Phase 1-C UI CRUD / 3 区画儀式画面 / スプリントライフサイクル (〜6/16) 完了。U-Auth1/U-Auth2 実行済、U-C1 スコープ判断は「フル CRUD + Sprint 切替」で決着。残るユーザー操作は U-Sub1〜4 (Proto Pedia / Elastic / 応募) と Phase 1-D の MCP OAuth。**次フェーズ = Phase 1-D (MCP Cloud Run / 6/20-)**。
> ハッカソン応募 〆切: **2026-07-10 23:59** / 最終ピッチ: 2026-08-19 (渋谷ストリーム)

---

## TL;DR — 現状の仕分け

| カテゴリ | 担当 | 進め方 |
|---|---|---|
| プロダクト企画・設計・コード | **Claude 自走** | 仕事中・睡眠中に並行で進める ([[Phase 1-Day0]] / [[Phase 1-B コア]] はこの形で完走済) |
| 運用系 GCP コマンド (Cloud Run / Firestore / Pub/Sub / Cloud Scheduler) | **Claude 直接 Bash で叩いてよい** ([[feedback-gcp-execution-policy]] / 2026-06-08 改訂) | run/firestore/pubsub は Bash 直接、デプロイは `gcloud builds submit` |
| IAM / billing / Secret / WIF / `--allow-unauthenticated` | **ユーザー必須** | コードブロック提示 → `!` で実行 |
| 認証フロー (Firebase Console) | **ユーザー必須** | ブラウザ UI 操作、Claude は手順書を出すのみ |
| 提出・ピッチ | **ユーザー必須** | Claude はピッチ素材・README・動画台本まで作る |

---

## 1. Claude 自走の進捗マップ (2026-06-09 時点)

### 1-A. 設計ドキュメント ── ✅ 完了
| # | タスク | 産出物 | 状態 |
|---|---|---|---|
| D1 | プロダクトブリーフ | `PRODUCT_BRIEF.md` | ✅ |
| D2 | アーキテクチャ案 + Mermaid 図 | `ARCHITECTURE.md` | ✅ |
| D3 | データモデル / 型定義 | `DATA_MODEL.md` + `packages/shared/src/types.ts` + 6/9 zod schema | ✅ |
| D4 | AI Agent 設計 | `AGENT_DESIGN.md` + `docs/PROMPTING_GUIDE.md` | ✅ |
| D5 | ロードマップ | `ROADMAP.md` (6/8 起点で全面改訂) | ✅ |
| D6 | ピッチ骨子 | `PITCH.md` | ✅ |
| D7 | ハッカソン要件チェック | `HACKATHON_COMPLIANCE.md` | ✅ (週次運用) |

### 1-B. コード実装
| # | タスク | 産出物 | 状態 |
|---|---|---|---|
| C1 | monorepo スキャフォールド (pnpm workspace 11 packages + Python uv) | `pnpm-workspace.yaml` | ✅ |
| C2 | バックエンド (Hono on Cloud Run) | `apps/api/` | ✅ |
| C3 | フロントエンド (Nuxt 3 + Vue 3 SSR、17 SFC) | `apps/web/` | ✅ |
| C4 | LLM プロバイダ抽象化 (mock 実装 / gemini/vertex は throw signpost) | `packages/llm/` | ✅ |
| C5 | Agent ランタイム (Tool 呼び出しループ、Mock LLM で動作) | `packages/agent/` | ✅ |
| C6 | Seed データ (1 project / 4 epics / 12 tickets / 3 sprints / 5 members) | `packages/seed/` | ✅ |
| C7 | Docker 化 (API + Web 両方) | `apps/{api,web}/Dockerfile` + `infra/cloudbuild{,.web}.yaml` | ✅ |
| C8 | MCP server (stdio mode / 11 Tools / Smoke 14/14 pass) | `apps/mcp-server/` | ✅ (stdio 完成 / HTTP は Phase 1-D) |
| C9 | テスト基盤 (vitest 34 件 + CI 自動実行) | `packages/{llm,repo}/test/` + `.github/workflows/ci.yml` | ✅ |
| C10 | README / 公開準備 / MIT LICENSE / repo public 化 | `README.md` + `LICENSE` | ✅ |
| C11 | **Firestore backend** (`firestore.ts` 9 リポジトリ + zod runtime validation) | `packages/repo/src/firestore.ts` | ✅ (6/9) |
| C12 | **seed-firestore + check-firestore スクリプト** (prod ガード付き) | `packages/repo/scripts/` | ✅ (6/9) |
| C13 | **prompts XML 構造化** (Anthropic Prompting 101 準拠、TS↔Python 同期) | `packages/agent/src/prompts.ts` + `apps/orchestrator-py/src/orchestrator/agents.py` | ✅ (6/9) |

### 1-C. CI/CD ── ✅ 完了
| # | タスク | 産出物 | 状態 |
|---|---|---|---|
| P1 | gcloud デプロイコマンド集 | `infra/cloudbuild.yaml` + `cloudbuild.web.yaml` | ✅ |
| P2 | Cloud Build パイプライン | 同上 | ✅ |
| P3 | GitHub Actions Workflow (WIF 経由) | `.github/workflows/deploy-{api,web}.yml` | ✅ (両方 push 自動デプロイ稼働中) |
| P4 | Firestore composite index 宣言 | `infra/firestore.indexes.json` | ✅ |
| P5 | 環境変数 / シークレット名一覧 | env 経由で運用、ENV.md は未作成 (Phase 1-B 認証着手時に必要なら) | ⚪ |

---

## 2. Claude 自走で次に取り組めるもの (仕事中に投げて OK)

| # | タスク | 所要 | リスク | 備考 |
|---|---|---|---|---|
| **N1** | mock.ts の他経路ガード強化 (justGotToolResult 完全パス、AgentStep の型レベルチェック) | 30 min | 低 | C3 の延長線、テスト追加で固めるだけ |
| **N2** | Eraser 図 (Mermaid) を最新 (Phase 1-B 完了 + deploy-web.yml ノード追加) に同期 | 30 min | 低 | ARCHITECTURE.md 内 Mermaid を編集 → Eraser へ反映 (skill: eraser-arch-sync) |
| **N3** | infra/firestore.rules (Firestore Security Rules) の雛形作成 | 60 min | 中 | Firebase Auth が無い状態でも個人 GCP では allow read,write; if false; から始める運用ルール文書化 |
| **N4** | docs/setup-firebase-auth.md (Firebase Console での手順書) | 30 min | 低 | ユーザーが U-Auth1 実行する時の手順書、Claude は手順書を作るだけ |
| **N5** | scripts/check-firestore.ts の expand (Refinement 6 観点を実機データで検証する CLI) | 45 min | 低 | Phase 2 配線時のデバッグツール |
| **N6** | apps/orchestrator-py の `/health` を Firestore 接続有無 / Gemini 接続有無を返すよう拡張 | 30 min | 低 | Phase 2 で Pub/Sub 配線時に役立つ |
| **N7** | PROJECT_PLAN.md (= 本ファイル) の最新化 | 10 min | ゼロ | 本タスクで実施中 |

---

## 3. ユーザー判断・実行が必要なもの (Claude では進められない)

優先順 (応募 7/10 から逆算):

### U-Auth: Phase 1-B 認証パート (6/14 まで)
| # | タスク | 内容 | 重要度 |
|---|---|---|---|
| U-Auth1 | **Firebase Console で Authentication を有効化** | Firebase Console → Project (belvedere-dev-atrium) → Authentication → Get Started → Google provider 有効化、許可 email に `mygolanglearn@gmail.com` 追加 | 🔥 |
| U-Auth2 | **Firestore Security Rules を deploy** | Phase 1-B の最後、Firebase Auth が動いた後。`firebase deploy --only firestore:rules` | 🔥 |

> 🤖 Claude 側で対応: 認証ミドルウェア (`apps/api` に Firebase Admin SDK で ID token 検証)、Web の Firebase JS SDK 統合、`workspaceId` フィルタの全層改修 (現在 IDOR リスク残)。これらは U-Auth1 完了後の Phase 1-B 締めくくり

### U-Phase 1-C 判断 (6/15 着手前)
| # | タスク | 内容 | 重要度 |
|---|---|---|---|
| U-C1 | **Web UI で「どこまで CRUD する?」スコープ判断** | 編集のみ / 起票も / Sprint 切替も / Mock のまま提出して Phase 3 で本物接続 のどれを取るか | 🟧 |

### U-Submit: 提出準備 (7/10 まで)
| # | タスク | 内容 | 重要度 |
|---|---|---|---|
| U-Sub1 | **Proto Pedia アカウント作成** | proto.pedia.jp で `mygolanglearn@gmail.com` 登録。提出 STEP③ で必須 | 🟧 |
| U-Sub2 | **Elastic Cloud アカウント開設** (Phase 3 末で使うなら) | 14 日無料トライアル、Phase 3 末 7/3-9 のタイミングで開始 | 🟢 |
| U-Sub3 | **ピッチ動画の参考動画選定** | Vercel/Stripe/Linear/Tailwind のローンチ動画を 1-2 本見て「これっぽいトーンで」決める。元気な時に | 🟢 |
| U-Sub4 | **ハッカソン応募フォーム提出 (7/10 23:59)** | GitHub URL / デプロイ URL / Proto Pedia URL + `findy_hackathon` タグ | 🔥 |

### U-Final: ピッチ (8/19)
| # | タスク | 内容 | 重要度 |
|---|---|---|---|
| U-F1 | **最終ピッチ出演 (8/19 渋谷ストリーム)** | Claude はピッチ素材 (動画 / スライド / デモシナリオ) まで作る、本番出演はユーザー | 🟢 |

### U-Done: ✅ 完了済 (履歴)
| # | タスク | 完了日 |
|---|---|---|
| U1 GCP アカウント (個人) | 2026-05-06 |
| U2 プロジェクト `belvedere-dev-atrium` / `belvedere-prod-atrium` | 2026-05-06 |
| U3 API 14 個有効化 | 2026-05-06 |
| U4 SA `belvedere-runtime` + 9 ロール (datastore.user 含む) | 2026-05-06 |
| U5 課金アラート $10/月 + ハッカソンクーポン ¥47,867 適用 | 2026-05-09 |
| U6 GitHub repo `KaedeAatou/belvedere` public + MIT LICENSE | 2026-05-06 |
| U7 WIF setup (`belvedere-ci-pool` / `belvedere-deployer`) | 2026-05-06 |
| U-Web-IAM `--allow-unauthenticated` for `belvedere-web-dev` | 2026-06-08 |

---

## 4. 依存度マップ (2026-06-09 改訂)

```
[完了済]
  D1-D7 docs ──▶ C1-C13 code ──▶ P1-P4 CI/CD ──▶ Web/API 公開 URL 稼働 + Firestore 接続済

[今ここ / Phase 1-B 残作業]
  U-Auth1 Firebase Console 有効化 (ユーザー操作)
    └──▶ Claude: apps/api に Firebase Admin SDK 認証ミドルウェア追加
    └──▶ Claude: Web に Firebase JS SDK ログイン UI
    └──▶ Claude: workspaceId 全層改修 (IDOR fix)
    └──▶ U-Auth2 Firestore Security Rules deploy (ユーザー操作)

[次フェーズ / Phase 1-C 6/15-21]
  Web UI CRUD 接続 (web ↔ api):
    Claude が ticket 編集 / 起票 UI と useFetch 接続を実装
    U-C1 スコープ判断が必要

[Phase 1-D 6/22-28]
  MCP HTTP + Cloud Run デプロイ
    └──▶ ドッグフード開始 (Belvedere チケットで Belvedere を作る)

[Phase 2 6/29-7/2]
  Pub/Sub + Cloud Scheduler + Mock Agent 配線

[Phase 3 7/3-9 / 提出ライン]
  本物 Gemini 接続 + Elastic RAG + ピッチ動画 + Proto Pedia 登録
    └──▶ U-Sub1 Proto Pedia アカウント (ユーザー操作)
    └──▶ U-Sub2 Elastic Cloud 契約 (ユーザー操作)

[提出 2026-07-10 23:59]
  U-Sub4 応募フォーム送信 (ユーザー操作)

[一次/二次審査 7/13-7/30]
  Reviewer Multimodal / ADK / CeremonyHealthScore 等の上積み

[Phase 4 7/28-8/19]
  OWASP / a11y / 観測 / ピッチ動画決定版 / リハーサル / 本番 (U-F1)
```

---

## 5. 「最も詰まりやすい所」(2026-06-09 改訂)

1. **U-Auth1 (Firebase Console)** → Phase 1-B 完走の唯一の blocker。30 分で終わるが、ユーザーが手を動かさないと止まる
2. **workspaceId 全層改修** → IDOR fix は Firebase Auth とセット。RepoContainer / TicketQuery / 全 caller の signature 変更を伴うため、着手前に方針確認が必要 ([[feedback-multitenancy-not-singleuser]])
3. **U-Sub1 Proto Pedia 登録** → 7/10 当日に詰まると致命的。6 月中に済ませる
4. **本物 Gemini 接続 (Phase 3 7/3-5)** → 残 24 日。Phase 1-B/C/D + Phase 2 が予定通り終わる前提
5. **Elastic Cloud 14 日トライアル** → 7/3 開始だと 7/17 まで。Elastic から延長交渉できれば 7/27 一次審査終了まで持つ
