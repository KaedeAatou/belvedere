# @belvedere/e2e — Playwright e2e + 失敗時 Belvedere 自動起票

> Phase 1-B 完了確認 + ハッカソン B-1 ドッグフード閉ループ用 (2026-06-10 開設)

## 概要

```
GitHub Actions (deploy 完了)
    ↓
Playwright e2e (Cloud Run dev 環境を実ブラウザで操作)
    ├─ pass → CI ✅
    └─ fail → POST /api/tickets で Belvedere 自身にチケット起票
            → 翌朝 Daily / Refinement Agent が拾う
```

## ローカル実行

```bash
# 1. Playwright ブラウザ install (初回のみ)
pnpm --filter @belvedere/e2e install-browsers

# 2. env 設定 (.env.local or shell)
export FIREBASE_SA_KEY='<Firebase SA key JSON 全文>'
export E2E_ROBOT_UID='SUJvQ0XsrNQRhodNpM3BhAAKRn62'  # owner@example.com の Firebase UID
export WEB_BASE_URL='https://belvedere-web-dev-cpszmcqmuq-an.a.run.app'
export API_BASE_URL='https://belvedere-api-dev-cpszmcqmuq-an.a.run.app'

# 3. テスト実行
pnpm --filter @belvedere/e2e test

# 4. UI モード (デバッグ用)
pnpm --filter @belvedere/e2e test:ui
```

## CI 実行 (GitHub Actions)

`.github/workflows/e2e.yml` が deploy-api / deploy-web の完了後に自動起動。

必要な GitHub secrets:
- `FIREBASE_SA_KEY` — Firebase Admin SDK サービスアカウント鍵 JSON 全文
- `E2E_ROBOT_UID` — robot user の Firebase UID
- `E2E_ROBOT_EMAIL` — robot user の email (任意、display 用)

## ディレクトリ構造 (Stage 1)

```
apps/e2e/
  package.json
  playwright.config.ts
  tsconfig.json
  fixtures/
    auth.fixture.ts            # test.extend で authedPage 注入 (signInWithCustomToken)
  utils/
    firebase-admin.ts          # Admin SDK で custom token 発行
    ticket-client.ts           # Belvedere POST /api/tickets ラッパー (Stage 3 で重複検出追加予定)
    post-failure-tickets.ts    # results.json を読んで失敗を Belvedere 起票
  tests/
    profile.spec.ts            # Stage 1: login → /settings/profile → 表示名 / Whoami
```

## Stage 2 / 3 の予定

- **Stage 2** (Phase 1-C UI CRUD 中): Page Object Model 導入 + Backlog UI シナリオ追加 + ws-e2e-test 専用 workspace 分離
- **Stage 3** (Phase 3 余裕あれば): 重複起票防止 (同 testName で open チケットあれば PATCH 追記) + Playwright trace / screenshot 添付の充実

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `Firebase signInWithCustomToken failed: auth/internal-error` | E2E_ROBOT_UID が Firebase Auth に存在しない UID。owner@example.com で 1 回ログインしてから Firebase Console で UID 確認 |
| `failed to exchange custom token: 400 INVALID_CUSTOM_TOKEN` | SA 鍵と UID のプロジェクトが不一致 |
| Playwright が画面要素を見つけられない | `pnpm --filter @belvedere/e2e test:ui` で UI モード起動して locator を確認 |
| `failed to create ticket: 403 invitation_required` | robot UID が emailAllowlist で bootstrap されない。Stage 1 では owner の UID を robot として使う想定なので、その UID で必ず /login → ログイン経験させてから e2e 実行 |

## 関連ドキュメント

- `docs/dev-process.md` — 開発プロセス全体
- `docs/setup-firebase-auth.md` — Firebase Auth セットアップ
- `docs/setup-firestore-rules.md` — Firestore Security Rules deploy
- `ROADMAP.md` — Phase 1-B / 1-C / 1-D / 1-E のマイルストーン
