# GitHub Actions ↔ GCP Workload Identity Federation セットアップ

> 想定時間: 15分 / 1回だけの作業
> ゴール: GitHub Actions から鍵ファイルなしで `gcloud` を実行できるようにする

**AWS的に言うと**: GitHub Actions の OIDC を使った IAM Role 連携 (`AssumeRoleWithWebIdentity`) と同じ仕組み。

---

## 0. 前提

- `docs/setup-gcp.md` の §1〜§8 が完了していること
- GitHub リポジトリが作成済み

---

## 1. 変数を決める

```bash
export PROJECT=belvedere-dev-atrium
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
export POOL_ID=github
export PROVIDER_ID=github
export GH_OWNER=YOUR_GITHUB_USERNAME    # ← あなたのGitHubアカウント
export GH_REPO=ai-agent-hackathon       # ← リポジトリ名
export SA_NAME=github-actions
export SA_EMAIL=${SA_NAME}@${PROJECT}.iam.gserviceaccount.com
```

## 2. Workload Identity Pool 作成

```bash
gcloud iam workload-identity-pools create $POOL_ID \
  --project=$PROJECT \
  --location=global \
  --display-name="GitHub Actions Pool"
```

## 3. Provider 作成 (GitHub OIDC)

```bash
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
  --project=$PROJECT \
  --location=global \
  --workload-identity-pool=$POOL_ID \
  --display-name="GitHub Actions Provider" \
  --attribute-condition="assertion.repository_owner == '$GH_OWNER'" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

`attribute-condition` で「自分のorgのリポジトリからのリクエストのみ受け付ける」制限を入れている。

## 4. デプロイ用サービスアカウント作成

```bash
gcloud iam service-accounts create $SA_NAME \
  --project=$PROJECT \
  --display-name="GitHub Actions Deployer"

# Cloud Build / Cloud Run / Artifact Registry に必要な権限
for ROLE in \
  roles/cloudbuild.builds.editor \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/storage.admin \
  roles/logging.logWriter
do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None
done
```

## 5. WIF と SA を結びつける

```bash
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --project=$PROJECT \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GH_OWNER}/${GH_REPO}"
```

## 6. workflow に値を埋める

`.github/workflows/deploy-api.yml` の env を実値に置換:

```yaml
env:
  WIF_PROVIDER: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
  WIF_SA: github-actions@belvedere-dev-atrium.iam.gserviceaccount.com
```

`PROJECT_NUMBER` を §1 で取得した値に置換。

```bash
echo $PROJECT_NUMBER
# → 出力値で workflow を sed か手動で書き換え
```

## 7. GitHub Environments (任意だが推奨)

`Settings > Environments` で `dev` / `prod` を作成。
prod は手動承認 (Required reviewers) を有効にする。

## 8. テスト

リポジトリに push → Actions タブで `Deploy API to Cloud Run` が走る。
失敗した場合の典型エラー:

| エラー | 対処 |
|---|---|
| `Permission denied: iam.serviceAccounts.getAccessToken` | §5 の binding 漏れ |
| `Repository '...' is not allowed` | §3 の attribute-condition で repository_owner が違う |
| `pool ... not found` | §2 の pool ID が workflow と不一致 |

---

## 9. これで何が嬉しいか

- リポジトリに JSON 鍵を置かなくて済む (漏洩リスク0)
- 鍵のローテーションが不要
- `roles/iam.workloadIdentityUser` を外せば即遮断できる
- AWS の GitHub OIDC 連携と同じ運用感覚
