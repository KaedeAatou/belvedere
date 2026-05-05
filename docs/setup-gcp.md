# GCP セットアップ手順書 (ユーザー作業)

> 想定時間: **30〜45分**
> 想定読者: AWSは触れる / GCPは初めて
> ゴール: Belvedereをローカルから Cloud Run にデプロイできる状態にする

各ステップの **AWS的に言うと** を併記している。詰まったらClaudeに「ここで○○エラーが出た」と渡せばOK。

---

## 0. 前提

- macOS / Apple Silicon (Darwin)
- ブラウザで Google アカウント（個人）にログイン済み
- 課金アラート設定で精神的負担を減らす方針 ($50/月で警告)

⚠️ ハッカソン参加要件: 個人の私的活動のため、**会社アカウントではなく個人Googleアカウント** で進めること。

---

## 1. gcloud CLI のインストール (5分)

```bash
brew install --cask google-cloud-sdk
```

**AWS的に言うと**: `aws-cli` のインストールと同じ。`gcloud` が `aws` コマンド相当。

確認:
```bash
gcloud --version
```

`!` プレフィックス（このClaude Codeセッション内）で実行できるので、コマンドをそのまま打ってよい。

---

## 2. ログイン (3分)

```bash
gcloud auth login
gcloud auth application-default login
```

ブラウザが開いてGoogleアカウント認可。後者の `application-default login` は **AWS的に言うと** `aws configure` 相当（プログラムから使う既定資格情報）。

---

## 3. プロジェクト作成 (5分)

GCPでは **すべてが「プロジェクト」** に紐づく。AWSアカウント1つ ≒ GCPプロジェクト1つ、と考えると近い。

開発用と本番用の2つを作る:

```bash
# 課金アカウントID (請求先) を取得
gcloud billing accounts list
# → 出力された ACCOUNT_ID をメモ
export BILLING_ID="XXXXXX-XXXXXX-XXXXXX"  # 適宜置き換え

# 開発プロジェクト
gcloud projects create belvedere-dev-atrium \
  --name="Belvedere Dev"
gcloud billing projects link belvedere-dev-atrium --billing-account=$BILLING_ID

# 本番プロジェクト
gcloud projects create belvedere-prod-atrium \
  --name="Belvedere Prod"
gcloud billing projects link belvedere-prod-atrium --billing-account=$BILLING_ID
```

> プロジェクトIDはグローバルでユニーク。すでに存在したら `belvedere-dev-atrium-2` のように suffix を増やす、もしくは別のコードネーム (Atrium → Borealis 等) に切替。display name は英数字/スペース/`-`/`'`/`"`/`!` のみ可 (カッコ・記号は INVALID_ARGUMENT エラー)。
>
> **AWS的に言うと**: プロジェクトの作成はAWSアカウントを2つ作るのに近い（ただし課金は1つの billing account にまとめられる）。

デフォルトプロジェクトを dev に向ける:
```bash
gcloud config set project belvedere-dev-atrium
```

---

## 4. 必要API有効化 (5分 / バックグラウンドで進む)

Belvedere で使うAPIを一括ON:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  generativelanguage.googleapis.com \
  pubsub.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  cloudtrace.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=belvedere-dev-atrium
```

**AWS的に言うと**: AWSはAPIを有効化する概念がなく、SDKを叩けば動く。GCPはまずAPIを有効化する必要がある (慣れるまで違和感)。

本番にも同じことを:
```bash
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com aiplatform.googleapis.com \
  generativelanguage.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com \
  storage.googleapis.com iamcredentials.googleapis.com cloudtrace.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com \
  --project=belvedere-prod-atrium
```

---

## 5. リージョン決定 (1分)

Belvedereは **asia-northeast1 (東京)** で固定。

```bash
gcloud config set run/region asia-northeast1
gcloud config set artifacts/location asia-northeast1
```

**AWS的に言うと**: `aws configure set default.region ap-northeast-1` 相当。

---

## 6. Firestore 初期化 (3分)

```bash
gcloud firestore databases create \
  --location=asia-northeast1 \
  --type=firestore-native \
  --project=belvedere-dev-atrium
```

**AWS的に言うと**: DynamoDBテーブルに最初に1個作る感覚。Firestoreはプロジェクトごとに1個 (またはデータベースID付きで複数) 作る。

本番側も同様に。

---

## 7. Artifact Registry (Dockerイメージ置き場) (3分)

```bash
gcloud artifacts repositories create belvedere \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Belvedere container images" \
  --project=belvedere-dev-atrium
```

**AWS的に言うと**: ECR リポジトリ作成。

Docker認証ヘルパー設定:
```bash
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

---

## 8. サービスアカウント (5分)

Belvedere のCloud Runが他GCPサービスにアクセスするためのIDを作る。

```bash
PROJECT=belvedere-dev-atrium
SA_NAME=belvedere-runtime
SA_EMAIL=${SA_NAME}@${PROJECT}.iam.gserviceaccount.com

gcloud iam service-accounts create $SA_NAME \
  --display-name="Belvedere Runtime" \
  --project=$PROJECT

# 必要な権限を付与
for ROLE in \
  roles/datastore.user \
  roles/secretmanager.secretAccessor \
  roles/aiplatform.user \
  roles/storage.objectUser \
  roles/pubsub.publisher \
  roles/pubsub.subscriber \
  roles/logging.logWriter \
  roles/monitoring.metricWriter \
  roles/cloudtrace.agent
do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None
done
```

**AWS的に言うと**: IAMロール作って必要なポリシーをアタッチ。

⚠️ **鍵ファイルは作らない**。Cloud Run にデプロイするときに `--service-account` でこのSAを指定するだけで使える (Workload Identity)。

---

## 9. Gemini API キー (任意 / 開発用) (3分)

ローカル開発で Vertex AI 経由ではなく直接 Gemini API を叩きたい場合だけ:

[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) で発行 → Secret Manager に保存:

```bash
echo -n "YOUR_API_KEY_HERE" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --project=belvedere-dev-atrium
```

> 本番は Vertex AI 経由が推奨 (キー不要、SAだけで叩ける)。

---

## 10. 課金アラート (3分)

「気づいたら $200 課金されていた」を防ぐ。

ブラウザで:
1. https://console.cloud.google.com/billing/budgets
2. プロジェクト = `belvedere-dev-atrium` 選択
3. Budget 作成: 月額 $50, 50% / 90% / 100% で通知

**AWS的に言うと**: AWS Budgets と同じ。

---

## 11. GitHub Actions と GCP 連携 (Workload Identity Federation) (10分)

> このステップは Phase 1 の終盤 (5月中旬) でOK。今すぐは不要。

詳細は別ドキュメント `docs/setup-github-wif.md` (これからClaudeが書く) で。

---

## 12. ここまでで何ができるようになるか

- [x] `gcloud run deploy` でCloud Runにデプロイできる
- [x] Firestoreにデータを書ける
- [x] Vertex AI / Gemini API を叩ける
- [x] Secret Manager に秘密を保存できる
- [x] 課金が暴走しない

これでClaudeが用意した `scripts/deploy.sh` を実行するだけでデプロイできる。

---

## 13. トラブルシュート

| 症状 | 対処 |
|---|---|
| `gcloud: command not found` | `brew install --cask google-cloud-sdk` してターミナル再起動 |
| `Permission denied: project does not have billing enabled` | §3 の billing link を再実行 |
| `API not enabled` | §4 の `services enable` を該当APIで再実行 |
| `Quota exceeded` | リージョン変更 or プロジェクト変えて試す |

---

## 14. 私 (Claude) が次にやれること

GCPセットアップが終わったら、私が以下を進められる:
- `gcloud run deploy` をローカルから実行 (ユーザーの権限で)
- Firestore Emulator → 本物Firestore への接続切替
- Vertex AI / Gemini SDK のコード追加
- Cloud Build パイプライン構築
- 観測の構築

GCPセットアップが終わったら **「GCPできた」とだけ伝えて** くれれば次に進めます。
