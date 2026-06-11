---
name: gcp-setup
description: docs/setup-gcp.md の 11 ステップ (gcloud install / プロジェクト + billing / API 有効化 / Firestore / Artifact Registry / IAM / 課金アラート / WIF) を対話的に進めるための手引き。ユーザーは AWS 実務経験あり / GCP 未経験のため、各ステップで AWS の対応サービスを併記すること。billing 有効化やプロジェクト作成などコスト発生操作はユーザーの明示的な Yes を取ってから流す。`disable-model-invocation: true` のためユーザーが `/gcp-setup` と入力した時のみ起動する。※基盤セットアップは 2026-05-06 完了済 — 残る用途は Phase 3-A の Vertex AI / Gemini API 有効化のみ。Phase 3-A 完了後に削除予定 (2026-06-12 usage-audit 判定)。
disable-model-invocation: true
color: yellow
---

# GCP Setup Walkthrough

ユーザーは GCP未経験 / AWS実務経験者。Belvedere プロジェクトの最大のクリティカルパスである GCP セットアップを、`docs/setup-gcp.md` を一次情報として進める対話型ガイド。

## 進め方の原則

1. **AWS対応を必ず併記**: 各ステップで「AWS的に言うと～」を最初に出す
2. **コマンドは1ブロックで提示し、ユーザー実行を待つ**: gcloud は対話的なログインや課金確認を含むため、`!` プレフィックスでユーザー自身が実行する形が安全
3. **エラーが出たら setup-gcp.md §13 トラブルシュートを参照**
4. **billing をリンクするまでは課金が発生しない** ことを安心材料として伝える
5. **`docs/setup-gcp.md` を一次情報として、内容を勝手に変えない**: 手順がズレたら setup-gcp.md を更新してから skill を呼び直す

## 手順 (要約 — 詳細は docs/setup-gcp.md)

各ステップ前に「これから〇〇をやります。AWS的に言うと〇〇です。続けていいですか?」を聞く。

| # | ステップ | 想定時間 | AWS対応 |
|---|---|---|---|
| 1 | gcloud CLI install (`brew install --cask google-cloud-sdk`) | 5min | aws-cli install |
| 2 | `gcloud auth login` + `application-default login` | 3min | `aws configure` |
| 3 | プロジェクト作成 (dev/prod 各1) + billing link | 5min | AWSアカウント2つ + billing 集約 |
| 4 | API 有効化 (run, cloudbuild, aiplatform, firestore, ...) | 5min | (AWSは不要、GCP特有) |
| 5 | リージョン固定 `asia-northeast1` | 1min | `aws configure set default.region` |
| 6 | Firestore 初期化 | 3min | DynamoDB テーブル作成 |
| 7 | Artifact Registry 作成 | 3min | ECR repository 作成 |
| 8 | サービスアカウント (`belvedere-runtime`) + IAM | 5min | IAM Role + Policy |
| 9 | (任意) Gemini API key を Secret Manager へ | 3min | Secrets Manager |
| 10 | 課金アラート ($10/月、ハッカソン期間 2026-08-19 までのコスト保護) | 3min | AWS Budgets |
| 11 | (Phase 1 終盤で) GitHub Actions WIF — `docs/setup-github-wif.md` 参照 | 15min | IAM OIDC Provider |

## 完了の合図

ユーザーが「GCPできた」と言えるのは:
- §1〜§8 が完了
- `gcloud config list` で project が `belvedere-dev-atrium` (or 類似)
- `gcloud services list --enabled --project=$PROJECT | grep run` で Cloud Run が enable

完了したら、Claude (このスキル外) で以下を進める:
1. `packages/llm/` に Gemini provider 実装
2. `packages/repo/` に Firestore 実装
3. 初回 Cloud Run デプロイ (`gcloud run deploy` or `gcloud builds submit`)

## 注意

- `disable-model-invocation: true` のため、ユーザーが `/gcp-setup` と入力した時のみ起動する
- billing link 後は課金発生レンジに入る。事前に `docs/setup-gcp.md §10` の課金アラートを必ず設定すること
- 個人アカウントで進めること (会社アカウント禁止 — ハッカソン規約)
