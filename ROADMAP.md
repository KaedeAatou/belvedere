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
    招待 UI 最小実装                 :2026-06-25, 2d
    section 3-A. Agent 本実装
    Gemini + ADK + Orchestrator A2A  :2026-06-27, 4d
    section 2. Pub/Sub リアル配線
    Pub/Sub + Cloud Scheduler + Panel:2026-07-01, 3d
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
- [ ] **U-Rules1 (👤)**: `firebase deploy --only firestore:rules` を 1 回実行 (5 分、docs/setup-firestore-rules.md 参照)

**達成**: 6/10 深夜にログイン → /api/whoami → 200 OK で mygolanglearn@gmail.com が ws-belvedere の owner として認識される end-to-end 動作確認済。
test 58/58 緑 (llm 15 + repo 29 + api 14)、typecheck 10/10 緑。
4 日前倒し完了で Phase 1-C 着手が 6/11 に早まる。

### Phase 1-C Web UI CRUD / 6/11 〜 6/19 (Phase 1-B 前倒し完了で 9 日確保)
- [x] バックログから新規チケット起票 (Live セクション + 作成ダイアログ / 2026-06-10)
- [x] e2e 基盤 Stage 1-3 (Playwright + 失敗時 Belvedere 自動起票 + 重複防止 / 2026-06-10 前倒し)
- [ ] **R1: Reviewer Multimodal 死骸の除去 + 死設定掃除** (docs/refactoring-plan.md / 案 A 承認 2026-06-10)
- [ ] **R2: stripUndefined / ID 採番の重複排除** (同上)
- [ ] チケット詳細画面で **編集 / status 変更 / Epic 紐付け / SP 設定** が Firestore に永続化 (= R3 Demo/Live 統一)
- [ ] Sprint 切替 / Epic 一覧 / メンバ表示が実データで動く (= R3)
- [ ] **R4: チケット種別導入 (Story/Task/Spike/Bug/Incident) + Refinement 新 3 観点** (1-C 末尾)
- [ ] AI Integrity Panel は **空の枠だけ** (Phase 2 で配線)

### Phase 1-D MCP Cloud Run + ドッグフード開始 / 6/20 〜 6/24 (5 日)
- [ ] **MCP server を Cloud Run にデプロイ** (HTTP / Streamable HTTP transport 追加、stdio と両対応)
- [ ] OAuth 2.1 認証 (個人 Google アカウント) で MCP HTTP を保護
- [ ] Claude Code から本番 Belvedere の MCP に接続
- [ ] **「Belvedere 自身の開発を Belvedere + MCP + Claude Code で管理する」ドッグフード開始**

### Phase 1-E マルチテナント完成 (招待 UI 最小実装) / 6/25 〜 6/26 (2 日)
- [ ] Workspace owner 画面に「メンバ招待」セクション追加
- [ ] email 入力 → Firestore に Member レコード作成 (role: 'sm' / 'po' / 'dev' / 'guest' から選択)
- [ ] 招待された人がログインすると自動加入
- [ ] (最小実装: 招待メール送信は手動コピペ通知で OK / Cloud Function 不要)

### Phase 3-A Gemini + ADK + Orchestrator Multi-Agent / 6/27 〜 6/30 (4 日) ★★ B-1 キラー

- [ ] **`packages/llm/src/gemini.ts` 実装** — `LLM_PROVIDER=gemini` で Mock を置換
- [ ] **ADK 本物実装** (`apps/orchestrator-py/src/orchestrator/agents.py:build_agents(use_real_adk=True)`)
- [ ] **Orchestrator Multi-Agent (= スクラムマスター AI)**:
  - Orchestrator が SubAgent として 5 儀式 Agent を持つ ADK 構成
  - 月曜朝 → Planner + Daily 並列起動
  - 木曜 14:30 → Refinement 単独起動
  - ふりかえり時刻 → Retrospective → Try 集約 → 翌スプリント Planner に引き継ぎ
- [ ] FastAPI `/agents/{name}/invoke` を本物 ADK 経路で動かす
- [ ] Cloud Run に orchestrator-py をデプロイ (Phase 1-D の延長)

### Phase 2 Pub/Sub + AI Integrity Panel リアル配線 / 7/1 〜 7/3 (3 日)
- [ ] Pub/Sub Topic 4 種: `ticket.created` / `ceremony.upcoming` / `try.persisted` / `ticket.updated`
- [ ] チケット保存 → Pub/Sub publish → Subscriber が Orchestrator 起動
- [ ] AI Integrity Panel が本物の Agent 出力をリアルタイム表示
- [ ] Cloud Scheduler 設定: 月曜 08:30 / 平日 09:55 / 木曜 14:30 / レビュー 17:00 / ふりかえり 16:00
- [ ] (簡略化: Slack 通知 / Live Activity 画面は時間が許せば、ダメなら Phase 5 で後回し)

### Phase 3-B Elastic + Gemini RAG / 7/4 〜 7/7 (4 日)
- [ ] **U-Sub2 (👤)**: Elastic Cloud 14 日トライアル契約
- [ ] `references/agile-knowledge-base/*` を chunk して Gemini Embeddings で vector 化 → Elastic に投入
- [ ] Refinement / Retrospective Agent に `knowledge.search` Tool 追加
- [ ] 過去 Try (Ceremony.tries[]) も同じ index に投入 (workspace 別)
- [ ] デモシナリオ: 「テストが遅い」相談 → Refinement Agent が過去 3 回の Try と公式 Scrum Guide 引用を提示

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
| **2026-06-26** | 招待 UI 完了見えない | 「個人開発 SaaS」のまま提出、ピッチで「マルチテナント設計は完備、招待 UI は次フェーズ」と説明 |
| **2026-06-30** | Phase 3-A (ADK Multi-Agent) 不調 | 雛形 + Gemini 1 回呼び出しまで縮退、A-2 要件は守る |
| **2026-07-03** | Phase 2 Pub/Sub 不調 | 「API 同期実行 + Web polling」の擬似リアルタイムに縮退 (見た目はリアルタイム) |
| **2026-07-07** | Elastic RAG 完成見えない | L2 markdown を prompt 埋込で擬似 RAG (Elastic 接続なし)、協賛企業活用枠は失うが提出は守る |
| **2026-07-10 朝** | ピッチ動画未完成 | 60 秒の短縮版を朝撮り直し、徹夜カバー |

---

## 個人参加確定

- **チーム化なし** (6/7 チームビルディング参加済だが個人完走方針)
- Claude (= 私) が全タスク担当 + Belvedere + MCP + Claude Code を駆使してドッグフード
- ボトルネックは「ユーザーが GCP 操作する時間」と「個人の睡眠時間」のみ
- Bootcamp 不参加、Phase 4 削除のため 8 月のリハーサル期間もコード作業なし
