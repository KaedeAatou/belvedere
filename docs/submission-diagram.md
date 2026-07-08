# Proto Pedia 提出用アーキ図 (簡素版 v7 / 2026-07-09)

> **v6→v7 差分 (改行の微調整 3 点)**: ① `CRUD(業務データ)` の矢印ラベルが折り返していたため `CRUD` のみに短縮(役割は Firestore ノード側の「DB+RAG」表記で既に伝わるため重複削除) ② Firestore ラベルを「Firestore」/「DB+RAG」の2行に分割(旧「Firestore: DB + RAG」は1行で詰まりがち) ③ `(belvedere-api 内部)` → `(api内部)` に短縮し折り返しを解消。

> **✅ 清書完了 (2026-07-09)**: Eraser で作成・PNG 書き出し済み。
> - Eraser 編集ページ: https://app.eraser.io/workspace/3rStTPW8UT5qKzle9PnM?diagram=QXaih1615vij_5Lu0Nd6&layout=canvas
> - Proto Pedia アップロード用 PNG はこのページの「Export → PNG」からダウンロード可
>
> **v4→v5 差分**: 「これで要件(GCP採用)を満たしていることが伝わるか」の確認を受け、GCP ネイティブサービス (Firebase Auth / Cloud Run×2 / Cloud Build / Gemini API / Firestore) を **`Google Cloud` という 1 つの境界(バウンダリ)で囲む**標準的なクラウドアーキ図の描き方に変更。外部アクター (Scrum Team / GitHub / GitHub Actions / Claude Code) は枠の外に残し、5秒だけ図を見る審査員にも「GCP + Gemini で構築している」ことが一目で伝わるようにした。
>
> **v5→v6 差分 (ユーザーレビュー 3 点を反映)**:
> 1. **WIF鍵レスを図から削除**: セキュリティ上良い実践だが、審査員が5秒で意味を汲み取れない運用の細部と判断 (IAM/SA同様、詳細図に委ねる方針と整合)。「GitHub Actions」のみに簡略化、デプロイ系の矢印ラベルも「デプロイ」で日英表記を統一。
> 2. **「Orchestrator」「5 Ceremony Agents」を API のネスト(入れ子グループ)から独立ノードへ変更**: Eraser はグループ(入れ子)とリーフノードを自動で別スタイル(枠色・大文字化)にするため、同じ Cloud Run なのに API 側だけ青枠+全角大文字になり「特別扱い」に見えて誤解を招いていた。ネストをやめて全ノードを同じ見た目に統一し、「(belvedere-api 内部)」という文言で関係性を明示。
> 3. **Firestore ラベルに DB と RAG の役割を明記**: 「正本」という一般的でない用語をやめ、「Firestore: DB + RAG」ヘッダー + 「業務データ / 過去Try検索」で何をしているかが一目で分かるようにした。

> **これは提出 (Proto Pedia) 用の簡素図**。リポジトリの詳細図 (`ARCHITECTURE.md` の Mermaid / 既存 Eraser ~40 ノード) は実装力エビデンスとして**残す**。提出図は別物。
>
> **v4 で方針転換 (2026-07-09)**: v1〜v3 は「つくる・まわす・とどける」の概念フレームで押していたが、ユーザーから「アーキテクチャ図なら GCP のサービス名を主役にすべき」との指摘。**実デプロイ構成を再確認した結果、v3 までは不正確だった**:
> - **「Orchestrator」「5 Ceremony Agents」は別 Cloud Run サービスではない**。`apps/api/src/app.ts` が `@belvedere/agent` の `runAgent` / `buildOrchestratorTools` を直接 import しており、**単一の `belvedere-api` Cloud Run サービス内で動くコード**(別ネットワークホップなし)。v1〜v3 は両方に `icon: gcp-cloud-run` を付けて別サービスであるかのように描いていた誤り。
> - **MCP Server は Cloud Run にデプロイされていない**。`apps/mcp-server` は Claude Code が**ローカルでspawnする stdio プロセス**で、そこから `belvedere-api` へ HTTPS で接続する (API トークン認証)。Cloud Run アイコンを付けるべきではない。
> - 実際に CI/CD で自動デプロイされる Cloud Run サービスは **`belvedere-api` と `belvedere-web` の 2 つだけ** (`deploy-api.yml` / `deploy-web.yml` の `SERVICE:` 変数で確認)。
>
> **v4 の方針**: GCP サービス名を一次ラベルにする。Orchestrator → 5 Agents の協議招集(B-1 の核)は消さず、**`belvedere-api` サービスの内部構成としてネスト表示**する(= 1 つの Cloud Run サービスの中身、という正しい粒度)。「つくる・まわす・とどける」のバンドは外す。
>
> **使い方**: 下の Eraser DSL を [app.eraser.io](https://app.eraser.io) で **新規 diagram** に貼り付け → レイアウト確認 → PNG 書き出し → Proto Pedia にアップロード。

---

## Eraser DSL (cloud-architecture-diagram / コピペ用)

```
title Belvedere — Architecture

User [icon: user, label: "Scrum Team\n(PO / SM / Dev)"]
ClaudeCode [icon: anthropic, label: "Claude Code\nローカル・MCP経由"]

GCP [label: "Google Cloud"] {
  FirebaseAuth [icon: firebase, label: "Firebase Auth\nGoogle / Email+Pw"]

  Web [icon: gcp-cloud-run, label: "Cloud Run: belvedere-web\nNuxt 3 SSR"]

  API [icon: gcp-cloud-run, label: "Cloud Run: belvedere-api\nHono"]
  Orchestrator [label: "Orchestrator\n(api内部)"]
  Agents [label: "5 Ceremony Agents\n(api内部)"]

  Gemini [icon: gcp-vertex-ai, label: "Gemini API"]
  Firestore [icon: gcp-firestore, label: "Firestore\nDB+RAG\n業務データ / 過去Try検索\n⇄ Elastic 切替可"]
  CloudBuild [icon: gcp-cloud-build, label: "Cloud Build"]
}

GitHub [icon: github, label: "GitHub"]
Actions [icon: github-actions, label: "GitHub Actions"]

User > Web: 画面操作
User > FirebaseAuth: ログイン
ClaudeCode > API: MCP → HTTPS
Web > API: REST
API > Orchestrator: 内部で実行
Orchestrator > Agents: agent.invoke で協議招集・統括(スクラムマスター役)
Agents > Gemini: 推論
Agents > Firestore: 意味検索(RAG) + read/write
API > Firestore: CRUD
GitHub > Actions: push main
Actions > CloudBuild: デプロイ
CloudBuild > Web: デプロイ
CloudBuild > API: デプロイ
```

---

## ノード一覧 (9 トップレベル、ネストなし) と「描かないもの」

**`Google Cloud` 境界の中 (7)**: Firebase Auth / Cloud Run: belvedere-web / Cloud Run: belvedere-api / Orchestrator(belvedere-api内部) / 5 Ceremony Agents(belvedere-api内部) / Gemini API / Firestore(DB+RAG) / Cloud Build
**境界の外・外部アクター (3)**: Scrum Team(User) / GitHub + GitHub Actions / Claude Code

> **注 (2026-07-09 実デプロイ構成を確認して修正 / v5 で GCP 境界、v6 でネスト解消・WIF削除・DB/RAG明記)**:
> - Cloud Run に実際にデプロイされるのは **`belvedere-api` と `belvedere-web` の 2 サービスのみ** (`deploy-api.yml` / `deploy-web.yml`)。
> - Orchestrator / 5 Ceremony Agents は `belvedere-api` プロセス内のコード (`packages/agent` の `runAgent`)。**v6 でネスト(入れ子グループ)をやめ、独立ノード + ラベル「(belvedere-api 内部)」で表現** — Eraser がグループとリーフノードを自動で別スタイル(枠色・全角大文字)にして「API だけ特別扱い」に見える誤解を生んでいたため。
> - MCP Server はローカル stdio プロセス (Claude Code が起動) であり Cloud Run ではない。図では「ClaudeCode」ノードのラベルに含め、Cloud Run アイコンは付けない。
> - **ADK Peer は引き続き図に含めない** (v3 の判断を維持): 実装はあるが `orchestrator-py` は Cloud Run 未デプロイ・テストはモックのみ。README / Proto Pedia 本文で文章として触れる程度に留める。
> - **WIF(Workload Identity Federation)鍵レス認証は v6 で図から削除**。実装は本物 (GitHub Actions が長期鍵を持たず短命トークンで GCP に認証) だが、IAM/SA と同格の運用詳細と判断し、審査員が5秒で読めない専門用語を削った。ラベルは単に「GitHub Actions」。
> - **Firestore は v6 で「DB + RAG」の役割を明記** (旧ラベル「正本」は一般的でない法律用語の転用だったため削除)。DB = チケット等の業務データ、RAG = 過去 Try の意味検索。`SEARCH_BACKEND` env で Elastic にも切替可 (両方実装済)。

**描かない (詳細図に委ねる)**: Artifact Registry 単独箱 / SA・IAM ロール数 / WIF (Workload Identity Federation) の仕組み / Cloud Logging・Trace・Error Reporting / Secret Manager / Cloud Storage / Firebase Hosting rewrite の詳細 / ADK Peer(未デプロイ)/ 実装ステータス色分け。
→ これらは `ARCHITECTURE.md` の詳細図にあり、GitHub 上で実装力として見せる。

## チェック
- [x] `Google Cloud` 境界の中に A-1(Cloud Run)・A-2(Gemini API)候補が入っているか (2026-07-09 確認済)
- [ ] `findy_hackathon` タグは Proto Pedia 側で付ける (図ではなくメタ)
- [x] PNG 書き出し後、文字が潰れていないか確認 (2026-07-09 v6 で「業務データ」等の単語途中折返しを修正済)
- [x] Orchestrator→Agents の矢印(協議招集)が視覚的に目立っているか (B-1 の核 / 2026-07-09 確認済)
- [x] GCP サービス名 (Cloud Run / Firestore / Gemini API / GitHub Actions / Cloud Build / Firebase Auth) が一次ラベルとして読めるか (2026-07-09 確認済)
- [x] Cloud Run 2 ノードのスタイルが統一されている・DB/RAG の役割が読めるか (2026-07-09 v6 で確認済)
