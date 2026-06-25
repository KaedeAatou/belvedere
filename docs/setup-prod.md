# Belvedere prod 昇格 runbook (dev → prod / 2026-06-25)

> **ゴール**: `belvedere-prod-atrium` を dev と同等(Cloud Run + Gemini + Firestore + RAG)に立ち上げ、
> 審査員が触れる公開 URL を用意する。DevOps お題の **CI/CD 昇格(dev→prod)** ストーリーの完成。
>
> **前提 / 厳守**: 個人 GCP アカウントのみ(会社メアド・会社名は絶対に使わない = ハッカソン個人参加要件)。
> 個人アカウントで `gcloud auth login` 済みであること。dev の手順 (`docs/setup-gcp.md` /
> `docs/setup-github-wif.md`) を prod 用にもう一周する圧縮版。**所要 ~30分**。
>
> **分担**: 🧑 YOU = IAM / billing / secret / WIF / `--allow-unauthenticated`(方針で必須)。
> 🤖 ME(Claude)= env 可変化コード / deploy / Firestore seed / RAG コーパス・index・検証(運用系)。

---

## 🧑 YOU パート(IAM/secret/WIF)— 上から順にコピペ

```bash
export PROJECT=belvedere-prod-atrium
export REGION=asia-northeast1
export GH_OWNER=KaedeAatou
export GH_REPO=belvedere
```

### 1. プロジェクト + billing(既に作成済みならスキップ可)
```bash
gcloud billing accounts list                      # ACCOUNT_ID をメモ
export BILLING_ID="XXXXXX-XXXXXX-XXXXXX"           # 置き換え
gcloud projects create $PROJECT --name="Belvedere Prod" 2>/dev/null || echo "既存"
gcloud billing projects link $PROJECT --billing-account=$BILLING_ID
```

### 2. 必要 API 有効化
```bash
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com aiplatform.googleapis.com \
  generativelanguage.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com \
  storage.googleapis.com iamcredentials.googleapis.com cloudtrace.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com \
  --project=$PROJECT
```

### 3. Firestore (native / 東京)
```bash
gcloud firestore databases create --location=$REGION --type=firestore-native --project=$PROJECT
```

### 4. Artifact Registry
```bash
gcloud artifacts repositories create belvedere \
  --repository-format=docker --location=$REGION \
  --description="Belvedere container images" --project=$PROJECT
```

### 5. runtime SA + 9 ロール(Cloud Run 実行 SA)
```bash
SA_EMAIL=belvedere-runtime@${PROJECT}.iam.gserviceaccount.com
gcloud iam service-accounts create belvedere-runtime --display-name="Belvedere Runtime" --project=$PROJECT
for ROLE in roles/datastore.user roles/secretmanager.secretAccessor roles/aiplatform.user \
  roles/storage.objectUser roles/pubsub.publisher roles/pubsub.subscriber \
  roles/logging.logWriter roles/monitoring.metricWriter roles/cloudtrace.agent; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" --condition=None
done
```

### 6. Secret `GEMINI_API_KEY`(大文字固定)+ runtime SA に読み取り権限
```bash
RUNTIME_SA=belvedere-runtime@${PROJECT}.iam.gserviceaccount.com
read -rs -p 'Gemini API key を貼り付けて Enter: ' GEMINI_KEY; echo
printf '%s' "$GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project="$PROJECT"
unset GEMINI_KEY
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --project="$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor"
```
> ⚖️ **判断 (B4)**: 無料枠キー(課金未有効プロジェクト発行)は `gemini-2.5-flash` のみ・レート制限あり。
> prod で安定運用 or pro を使うなら **有料キー(実カード入金 / GCP クレジットは Gemini に効かない)**。
> 迷ったら flash 無料枠で開始可(デモは flash で十分)。

### 7. WIF Pool + Provider + deployer SA + binding
```bash
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
SA_EMAIL=belvedere-deployer@${PROJECT}.iam.gserviceaccount.com

gcloud iam workload-identity-pools create belvedere-ci-pool \
  --project=$PROJECT --location=global --display-name="Belvedere CI/CD Pool"

gcloud iam workload-identity-pools providers create-oidc belvedere-ci-github \
  --project=$PROJECT --location=global --workload-identity-pool=belvedere-ci-pool \
  --display-name="GitHub Actions OIDC Provider" \
  --attribute-condition="assertion.repository_owner == '$GH_OWNER'" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts create belvedere-deployer \
  --project=$PROJECT --display-name="Belvedere CI/CD Deployer"
for ROLE in roles/cloudbuild.builds.editor roles/run.admin roles/artifactregistry.writer \
  roles/iam.serviceAccountUser roles/storage.admin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" --condition=None
done

gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL --project=$PROJECT \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/belvedere-ci-pool/attribute.repository/${GH_OWNER}/${GH_REPO}"
```

### 8. 🤝 受け渡し: prod projectNumber を ME に伝える
```bash
echo "PROD_PROJECT_NUMBER=$PROJECT_NUMBER"
```
→ この値(例 `987654321098`)を Claude に渡す。ME が deploy-*.yml の WIF を env 可変化する(下記)。

---

## 🤖 ME パート(YOU 完了後 / Claude が実行)

1. **env 可変化コード**(deploy-api.yml / deploy-web.yml / deploy-orchestrator.yml): `WIF_PROVIDER` / `WIF_SA` を
   `*_DEV` / `*_PROD` の 2 系統にし、`Resolve target project` で env=prod 時に PROD を解決。
   `WIF_PROVIDER_PROD` に上記 `PROD_PROJECT_NUMBER` を埋める(これが受け渡し B2 のゲート)。
2. **seed スクリプトの prod 許可**: `scripts/seed-firestore-dev.ts` の project ガード(現 `belvedere-dev-atrium` 固定)を
   prod も許可するよう一般化(または prod 変種)。
3. **prod 初回デプロイ**: GitHub Actions で `deploy-api`(env=prod / llm_provider=gemini / search_backend=firestore)+
   `deploy-web`(env=prod)を workflow_dispatch。🧑 **初回 `--allow-unauthenticated` deploy の承認 (B5)** が要る場合あり。
4. **prod Firestore seed**: `GCP_PROJECT=belvedere-prod-atrium REPO_BACKEND=firestore tsx scripts/seed-firestore-dev.ts`
   (tickets 13 / retroTries 2 / retroNotes 10)。
5. **prod RAG コーパス + index**:
   ```bash
   GCP_PROJECT=belvedere-prod-atrium GEMINI_API_KEY=... tsx scripts/index-knowledge.ts --apply
   GCP_PROJECT=belvedere-prod-atrium GEMINI_API_KEY=... tsx scripts/index-tries.ts --apply
   gcloud firestore indexes composite create --collection-group=belvedere-kb-scrum \
     --query-scope=COLLECTION --field-config=field-path=embedding,vector-config='{"dimension":768,"flat":{}}' --project=belvedere-prod-atrium
   gcloud firestore indexes composite create --collection-group=belvedere-kb-tries-ws-belvedere \
     --query-scope=COLLECTION --field-config=field-path=embedding,vector-config='{"dimension":768,"flat":{}}' --project=belvedere-prod-atrium
   ```
6. **検証**: prod `/health` = `{"llm":"gemini","repo":"firestore","knowledge":"firestore"}` / CI・Deploy・E2E 緑 /
   prod で retrospective が過去 Try を sourceId 付きで言及。

---

## 受け入れ条件(完了の定義)
- [ ] 🧑 prod GCP リソース一式(1–7)作成 + `PROD_PROJECT_NUMBER` 受け渡し(8)
- [ ] 🤖 deploy-*.yml env 可変化 + prod デプロイ(api/web)緑
- [ ] 🤖 prod Firestore seed + RAG コーパス(KB+Try)+ ベクトル index READY
- [ ] prod `/health` knowledge=firestore / retrospective が前回 Try 言及
- [ ] dev は引き続き flags ON で無傷(prod 昇格が dev を壊していない)

> dev は既に完成・稼働(seed + RAG + 前回 Try 言及をライブ実証済 / 2026-06-25)。この runbook は
> 「審査員が触れる prod 公開 URL」を足すための増分。dev 単独でも提出物(動画)は撮影可能。
