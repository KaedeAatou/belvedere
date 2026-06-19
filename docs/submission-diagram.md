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

// ===== AI 層 =====
AI [label: "つくる: AI"] {
  Gemini [icon: gcp-vertex-ai, label: "Gemini API + ADK\nマルチエージェント宣言的編成"]
}

// ===== データ + まわす(改善) =====
Data [label: "Data"] {
  Firestore [icon: gcp-firestore, label: "Firestore (正本)\nWorkspace>Project>Epic>Story>Task"]
  Elastic [icon: elasticsearch, label: "Elastic RAG (意味検索)\nまわす: 使うほど賢くなる"]
}

// ===== まわす: CI/CD 鍵レス (DevOps テーマ直結) =====
CICD [label: "まわす: CI/CD 鍵レスデプロイ"] {
  GitHub [icon: github, label: "GitHub\nKaedeAatou/belvedere"]
  Actions [icon: github-actions, label: "GitHub Actions + WIF\n(鍵レス / 464 テスト gate)"]
  CloudBuild [icon: gcp-cloud-build, label: "Cloud Build"]
}

// ===== 接続: 実行時 =====
User > Web: 画面操作
Web > API: REST
Web > Orchestrator: 画面操作 = 単一窓口
Orchestrator > Agents: agent.invoke で協議招集
Agents > Gemini: LLM 推論
Agents > Firestore: read / write
Agents > Elastic: 意味検索 (過去 Try / Scrum Guide)
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

## ノード一覧 (12) と「描かないもの」

**描く (12)**: User / ClaudeCode / Web / API / Orchestrator / 5 Agents / MCP / Gemini+ADK / Firestore / Elastic RAG / GitHub / Actions+WIF / Cloud Build
→ 厳密には 13 だが、Agents を 1 箱に畳んでいるので体感 12。**つくる (Agent) / まわす (CI/CD + Elastic) / とどける (Cloud Run)** がラベルで一目で読める。

**描かない (詳細図に委ねる)**: Artifact Registry 単独箱 / belvedere-deployer・belvedere-runtime SA とロール数 / Cloud Logging・Trace・Error Reporting / Secret Manager / Load Balancer / IAP / Cloud Storage / Vector Search / 実装ステータス色分け。
→ これらは `ARCHITECTURE.md` の詳細図にあり、GitHub 上で実装力として見せる。提出図に盛ると「フローが読めない」減点になる。

## チェック
- [ ] `findy_hackathon` タグは Proto Pedia 側で付ける (図ではなくメタ)
- [ ] PNG 書き出し後、文字が潰れていないか確認 (Agents の複数行ラベルが長め)
- [ ] 「つくる・まわす・とどける」のラベルが残っているか (審査軸への直接の対応)
