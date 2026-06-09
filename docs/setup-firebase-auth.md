# Firebase Auth セットアップ手順書 (Phase 1-B 認証パート)

> 2026-06-09 作成 / 想定所要 15 分 / Belvedere `belvedere-dev-atrium` プロジェクト用
> 個人 Google アカウント `owner@example.com` だけが利用できる認証を設定する。

## 前提

- GCP プロジェクト `belvedere-dev-atrium` が存在し、ユーザー = `owner@example.com` がオーナー
- Firestore は既に有効化済 (Phase 1-A で完了)
- Cloud Run の API / Web が稼働済 (今夜の Phase 1-Day0 / 1-B コアで完了)

## なぜユーザー操作が必要か

Firebase Console のブラウザ UI でしか有効化できない操作があるため。CLI からは `firebase auth:enable` 等のコマンドが存在せず、必ず GUI を 1 回通る必要がある。

---

## STEP 1: Firebase Console を開く (2 分)

1. ブラウザで https://console.firebase.google.com/ を開く
2. **個人アカウント `owner@example.com` でログイン**していることをアバターで確認
   - ⚠ 会社アカウント (`@***company-domain-redacted***`) で入ってしまったら **必ずログアウト**して個人で入り直す (ハッカソン参加要件)
3. 既存プロジェクト一覧から `belvedere-dev-atrium` を選択
   - GCP で作ったプロジェクトは Firebase Console から自動的に見える (Firebase は GCP のサブセット)
   - 見えない場合: 「プロジェクトを追加」→「Google Cloud プロジェクトを追加」→ `belvedere-dev-atrium` を選択 (リンク作業)

---

## STEP 2: Authentication を有効化 (3 分)

1. 左メニューの **「構築」→「Authentication」** をクリック
2. 「**始める**」ボタン (英語版なら「Get started」) をクリック
3. **「Sign-in method」** タブが開く
4. プロバイダ一覧から **「Google」** をクリック

---

## STEP 3: Google プロバイダの設定 (3 分)

1. **「有効にする」** をオンに
2. **「プロジェクトのサポートメール」**: `owner@example.com` を選択 (プルダウンで表示される)
3. 「保存」をクリック
4. プロバイダ一覧の Google が **「有効」** になっていることを確認

---

## STEP 4: 許可ドメイン / 許可アカウントの制限 (5 分) — **重要**

デフォルトで Google アカウント全員 (= 世界中の Google ユーザー) がログインできてしまう。Belvedere は個人開発作品なので、**自分だけ通す** 設定にする。

### 方法 A: メール allowlist (Cloud Functions Auth Triggers 不要、推奨)

Firebase Console では直接 allowlist 機能が無いので、**Custom Claims** か **アプリ層のチェック** で防ぐ。Belvedere では後者を採用予定。

→ **STEP 4 は今は何もしなくて OK**。アプリ層 (`apps/api`) の認証ミドルウェアで `decodedToken.email === 'owner@example.com'` をチェックする実装を Claude 側で追加します (この手順書の対象外)。

### 方法 B: 認可ドメイン制限 (任意 / 余裕があれば)

1. **「Settings」タブ** → 「承認済みドメイン」
2. デフォルトで `localhost` と `belvedere-dev-atrium.firebaseapp.com` 等が登録されている
3. 本番デプロイ用 Cloud Run ドメインを追加: `belvedere-web-dev-cpszmcqmuq-an.a.run.app`
   - これを追加しないと公開 URL からの Google ログインがリダイレクト時に弾かれる
4. 「追加」をクリックして反映

---

## STEP 5: Firebase Admin SDK のサービスアカウントを準備 (5 分) — **任意 / Phase 1-B 後半で必要**

API 側で ID token を検証するために Firebase Admin SDK を使う。runtime SA `belvedere-runtime` には既に `roles/firebaseauth.admin` を付けてあるか確認:

```bash
gcloud projects get-iam-policy belvedere-dev-atrium \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:belvedere-runtime@belvedere-dev-atrium.iam.gserviceaccount.com" \
  --format="value(bindings.role)"
```

期待される行: `roles/datastore.user` (✅ あり) + `roles/firebaseauth.admin` (これが無ければ追加が必要)。

無ければ追加 (IAM 変更なのでユーザー実行):

```bash
gcloud projects add-iam-policy-binding belvedere-dev-atrium \
  --member="serviceAccount:belvedere-runtime@belvedere-dev-atrium.iam.gserviceaccount.com" \
  --role="roles/firebaseauth.admin"
```

---

## STEP 6: 完了確認 (1 分)

1. Firebase Console → Authentication → **「ユーザー」タブ**を開く
2. まだ 0 件で OK (誰もログインしていない状態)
3. Settings タブ → **「全般」** で「プロジェクト ID」が `belvedere-dev-atrium` であることを最終確認

---

## 完了後 Claude 側でやること (ユーザー操作不要)

ここまで終わったら Claude に「Firebase Auth セットアップ完了」と伝えてください。以下を自走で実装します:

1. `apps/api` に Firebase Admin SDK 認証ミドルウェア追加 (Authorization: Bearer <ID token> を検証 + email allowlist)
2. `apps/web` に Firebase JS SDK の Google ログイン UI 追加 (signInWithPopup)
3. Web → API リクエスト時に ID token を付与する composable
4. `workspaceId` 全層改修 (RepoContainer / TicketQuery / 全 caller) — IDOR fix
5. `infra/firestore.rules` で `request.auth.token.email == 'owner@example.com'` のみ許可

これで Phase 1-B 完了。

---

## トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| Firebase Console にプロジェクトが見えない | GCP プロジェクトと Firebase がリンクされていない | 「プロジェクトを追加」→「Google Cloud プロジェクトを追加」→ `belvedere-dev-atrium` |
| 会社アカウントで入ってしまった | ブラウザの既存ログイン | プライベートウィンドウで `owner@example.com` 専用に開く |
| Google プロバイダ有効化時にエラー | サポートメール未選択 | プルダウンで `owner@example.com` を必ず選ぶ |
| 認証ドメインに `*.run.app` を追加できない | サブドメイン指定が必要 | 完全な URL (例 `belvedere-web-dev-cpszmcqmuq-an.a.run.app`) を 1 つずつ追加 |
| `roles/firebaseauth.admin` 付与で permission denied | ログインアカウントが project Owner でない | gcloud config get-value account で個人アカウントを確認 |

---

## 関連ドキュメント

- 公式: https://firebase.google.com/docs/auth/web/google-signin
- Belvedere の他のセットアップ: `docs/setup-gcp.md` / `docs/setup-github-wif.md`
- 後続作業: `PROJECT_PLAN.md` §3 U-Auth
- 個人参加要件: `memory/feedback_personal_account_only.md`
