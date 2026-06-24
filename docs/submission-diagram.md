# Proto Pedia 提出用アーキ図 (簡素版 / 2026-06-20)

> **これは提出 (Proto Pedia) 用の簡素図**。リポジトリの詳細図 (`ARCHITECTURE.md` の Mermaid / 既存 Eraser ~40 ノード) は実装力エビデンスとして**残す**。提出図は別物として「コアフロー + CI/CD 1レーン」≒ 12 ノードに絞る。
>
> **なぜ簡素化**: 世界・日本のハッカソン受賞作のアーキ図は **4〜10 ノード**が標準で、IAM/SA/監視/Secret は描かない (デモ動画 ≫ アーキ図)。ただし本ハッカソンは **DevOps がお題 = CI/CD は主催の採点軸 (「まわす」)** なので、**CI/CD レーンだけは残す**。
>
> **使い方**: 下の Eraser DSL を [app.eraser.io](https://app.eraser.io) で **新規 diagram** に貼り付け (既存の詳細図は上書きしない) → レイアウト確認 → PNG 書き出し → Proto Pedia にアップロード。`eraser-arch-sync` skill は ARCHITECTURE.md 詳細図用なので**これには使わない**。

---

## Eraser DSL (cloud-architecture-diagram / コピペ用)

```
title Belvedere — Architecture (つくる・まわす・とどける / 2026-06-20)

// ===== 外部アクター =====
User [icon: user, label: "Scrum Team\n(PO / SM / Dev)"]

// ===== AI Agent エコシステム (差別化 / MCP) =====
AIClients [label: "AI Agent クライアント"] {
  ClaudeCode [icon: anthropic, label: "Claude Code / Cursor\n(MCP で Belvedere を呼ぶ)"]
}

// ===== とどける: Cloud Run 本番 =====
Frontend [label: "とどける: Frontend (Cloud Run)"] {
  Web [icon: gcp-cloud-run, label: "Web (Nuxt 3 SSR)"]
}
Backend [label: "つくる: Backend (Cloud Run)"] {
  API [icon: gcp-cloud-run, label: "API (Hono CRUD)\nbelvedere-api-dev"]
  Orchestrator [icon: gcp-cloud-run, label: "Orchestrator = SM 単一窓口\n(Gemini 2.5 Flash)"]
  Agents [icon: gcp-cloud-run, label: "5 Ceremony Agents\nPlanning/Daily/Refinement/Review/Retro\n+ 種別ルールエンジン"]
}
MCP [icon: gcp-cloud-run, label: "MCP Server\n(stdio + HTTP / 14 Tools)"]

// ADK ピア (Refinement を A2A 越しに招集 / 自前くるくるは本体のまま = Strangler Fig)
ADKPeer [icon: gcp-cloud-run, label: "ADK Refinement ピア\n(orchestrator-py / Gemini+ADK)\nA2A で招集"]

// ===== AI 層 =====
AI [label: "つくる: AI"] {
  Gemini [icon: gcp-vertex-ai, label: "Gemini API\n(本番実推論で稼働)"]
}

// ===== データ + まわす(改善) =====
Data [label: "Data"] {
  Firestore [icon: gcp-firestore, label: "Firestore (正本 + Vector)\nWorkspace>Project>Epic>Story>Task"]
  RAG [icon: gcp-firestore, label: "RAG 意味検索 (差し込み式)\nFirestore Vector ⇄ Elastic 切替可\nまわす: 使うほど賢くなる"]
}

// ===== まわす: CI/CD 鍵レス (DevOps テーマ直結) =====
CICD [label: "まわす: CI/CD 鍵レスデプロイ"] {
  GitHub [icon: github, label: "GitHub\nKaedeAatou/belvedere"]
  Actions [icon: github-actions, label: "GitHub Actions + WIF\n(鍵レス / 462 テスト + agent eval gate)"]
  CloudBuild [icon: gcp-cloud-build, label: "Cloud Build"]
}

// ===== 接続: 実行時 =====
User > Web: 画面操作
Web > API: REST
Web > Orchestrator: 画面操作 = 単一窓口
Orchestrator > Agents: agent.invoke で協議招集 (TS / 本体)
Orchestrator > ADKPeer: A2A で Refinement を委譲 (flag / 不達は TS へ fallback)
ADKPeer > Gemini: ADK 推論
ADKPeer > API: 6観点を tool で取得
Agents > Gemini: LLM 推論
Agents > Firestore: read / write
Agents > RAG: 意味検索 (Scrum 標準 / 過去 Try)
RAG > Agents: 根拠 (sourceId) を引用 → 検出強化 (まわす)
API > Firestore: CRUD
ClaudeCode > MCP: stdio / HTTP
MCP > API: HTTPS (service token / IDOR ガード)

// ===== 接続: まわす (CI/CD) =====
GitHub > Actions: push main
Actions > CloudBuild: WIF OIDC (鍵レス)
CloudBuild > API: deploy
CloudBuild > Web: deploy
```

---

## ノード一覧 (13) と「描かないもの」

**描く (13)**: User / ClaudeCode / Web / API / Orchestrator / 5 Agents / MCP / ADK Refinement ピア / Gemini / Firestore / RAG(Firestore Vector⇄Elastic) / GitHub / Actions+WIF / Cloud Build
→ **つくる (Agent + ADK) / まわす (CI/CD + agent eval + RAG) / とどける (Cloud Run)** がラベルで一目で読める。

> **注 (overclaim 回避 / 2026-06-25 更新)**: 実装ステータスを正確に:
> - **Gemini API = 本番実推論で稼働** (`/health` llm=gemini)。
> - **ADK = 実体化済** (orchestrator-py が google-adk 1.31 LlmAgent + FunctionTool / `to_a2a` で A2A 公開)。
>   本体の協議は TS runAgent (自前くるくる)、Refinement だけ A2A 越しに ADK ピアへ委譲 (flag / 不達は TS へ fallback)。
> - **RAG = 差し込み式**。本番は GCP ネイティブ **Firestore Vector** (Gemini 埋め込み / 無料・無期限)、
>   協賛 **Elastic** にも env 1 つで切替可能 (両者とも実装済 / コーパス点火は運用手順)。
> - **agent eval = CI ゲートで稼働**。
> 図は到達構成 (全 flag OFF で本番は安全に保ちつつ、デモで ADK/A2A/RAG を点火して見せる)。

**描かない (詳細図に委ねる)**: Artifact Registry 単独箱 / belvedere-deployer・belvedere-runtime SA とロール数 / Cloud Logging・Trace・Error Reporting / Secret Manager / Load Balancer / IAP / Cloud Storage / Vector Search / 実装ステータス色分け。
→ これらは `ARCHITECTURE.md` の詳細図にあり、GitHub 上で実装力として見せる。提出図に盛ると「フローが読めない」減点になる。

## チェック
- [ ] `findy_hackathon` タグは Proto Pedia 側で付ける (図ではなくメタ)
- [ ] PNG 書き出し後、文字が潰れていないか確認 (Agents の複数行ラベルが長め)
- [ ] 「つくる・まわす・とどける」のラベルが残っているか (審査軸への直接の対応)
