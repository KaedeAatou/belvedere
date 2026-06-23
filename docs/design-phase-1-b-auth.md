# Phase 1-B 認証パート 設計メモ

> 作成: 2026-06-10 (U-Auth1 待ち時間に準備) / 想定実装期間: 6/11-14 (4 日)
> 関連: `docs/setup-firebase-auth.md` (ユーザー手順) / `ROADMAP.md` Phase 1-B

---

## 1. 全体構成

```
[ユーザー] Web 画面で「Google でログイン」ボタン
   │
   ▼
[Firebase JS SDK]  signInWithPopup() → Google 認証ポップアップ
   │
   ▼
[Google OAuth]  ユーザーが mygolanglearn@gmail.com を選択 → 承認
   │
   ▼
[ID token 取得]  ブラウザに保存 (Firebase が localStorage に書く)
   │
   ▼
[Web → API リクエスト]  Authorization: Bearer <id_token> を毎回付与
   │
   ▼
[API 認証ミドルウェア]  Firebase Admin SDK で token 検証
   │  - 検証 OK → req.user に { userId, email } を載せる
   │  - 検証 NG → 401 Unauthorized
   ▼
[Workspace 解決]  repo.members.list({ userId }) で所属 Workspace を取得
   │  - 0 件 → 403 (invitation_required)
   │  - 1 件以上 → 1 件目を current workspace に
   ▼
[Tools / Repo 呼び出し]  すべてに workspaceId を渡す (IDOR fix)
   │
   ▼
[Firestore]  workspaceId == 自分の workspace のドキュメントのみ
   │  - Security Rules で API 経由しない直叩きも防御
   ▼
[レスポンス]  Web に返却
```

---

## 2. 実装ファイル一覧

### 2-A. apps/api (認証ミドルウェア)

| ファイル | 役割 | 新規/変更 |
|---|---|---|
| `apps/api/src/middleware/auth.ts` | Firebase Admin SDK で ID token 検証 + req.user 注入 | 新規 |
| `apps/api/src/middleware/workspace.ts` | req.user から member 取得 → req.workspaceId を確定 | 新規 |
| `apps/api/src/index.ts` | 上記 2 ミドルウェアを `/api/*` パスに適用、`/health` は除外 | 修正 |
| `apps/api/package.json` | `firebase-admin` 依存追加 | 修正 |

### 2-B. apps/web (ログイン UI)

| ファイル | 役割 | 新規/変更 |
|---|---|---|
| `apps/web/pages/login.vue` | Google ログインボタン 1 つだけの画面 | 新規 |
| `apps/web/composables/useFirebase.ts` | Firebase JS SDK 初期化 (一度だけ) | 新規 |
| `apps/web/composables/useAuth.ts` | ログイン状態 / signIn() / signOut() / 現在の user 取得 | 新規 |
| `apps/web/middleware/auth.global.ts` | 未ログインなら /login にリダイレクト | 新規 |
| `apps/web/composables/useApiClient.ts` | $fetch ラッパー、毎リクエストに ID token を付与 | 新規 |
| `apps/web/nuxt.config.ts` | Firebase の API キー等を runtimeConfig 経由で渡す | 修正 |
| `apps/web/package.json` | `firebase` 依存追加 (JS SDK) | 修正 |

### 2-C. packages/repo (IDOR fix)

| ファイル | 役割 | 変更内容 |
|---|---|---|
| `packages/repo/src/types.ts` | `TicketQuery` 等に `workspaceId` 追加 | 必須化 (`workspaceId: string`) |
| `packages/repo/src/memory.ts` | 全 list メソッドで workspaceId フィルタ | 必須引数化 |
| `packages/repo/src/firestore.ts` | 全 list メソッドで `.where('workspaceId', '==', X)` | 必須引数化 |
| `packages/repo/test/memory.test.ts` | workspaceId フィルタの parity テスト追加 | 追加 |

### 2-D. packages/tools / packages/agent / apps/cli / apps/mcp-server

`createRepoContainer()` の呼出箇所で workspaceId を渡せるよう全層改修。
- `buildTools(repo, workspaceId)` factory に変更
- runAgent 等に `workspaceId` を context 引数で通す

### 2-E. infra/firestore.rules

| ファイル | 役割 | 新規/変更 |
|---|---|---|
| `infra/firestore.rules` | Firestore Security Rules (個人 email allowlist + Member ベース判定) | 新規 |
| `infra/firebase.json` | Firebase CLI 設定 (deploy 用) | 新規 |

### 2-F. packages/repo/scripts/seed-firestore.ts

| 内容 |
|---|
| 初期 Workspace + 初期 owner Member (mygolanglearn@gmail.com) を seed に追加 |
| → ログイン直後の最初の 1 人が即 Workspace owner になれる |

---

## 3. 認証ミドルウェアの実装スケッチ

```typescript
// apps/api/src/middleware/auth.ts
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { MiddlewareHandler } from 'hono';

// アプリ起動時に 1 度だけ初期化
const app = initializeApp({ credential: applicationDefault() });

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const idToken = authHeader.substring(7);
  try {
    const decodedToken = await getAuth(app).verifyIdToken(idToken);
    c.set('user', {
      userId: decodedToken.uid,
      email: decodedToken.email,
    });
    await next();
  } catch (e) {
    return c.json({ error: 'invalid_token' }, 401);
  }
};
```

---

## 4. Workspace 解決ミドルウェアの実装スケッチ

```typescript
// apps/api/src/middleware/workspace.ts
import type { MiddlewareHandler } from 'hono';
import type { RepoContainer } from '@belvedere/repo';

export function workspaceMiddleware(repo: RepoContainer): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as { userId: string; email: string };

    // この user が member として登録されている Workspaces を取得
    const memberships = await repo.members.list({ userId: user.userId });

    if (memberships.length === 0) {
      return c.json({ error: 'invitation_required', email: user.email }, 403);
    }

    // 最初の Workspace を current に (将来は header X-Workspace-Id で切替可能に)
    c.set('workspaceId', memberships[0].workspaceId);
    c.set('role', memberships[0].role);
    await next();
  };
}
```

---

## 5. Web ログイン UI のスケッチ

### 5-A. `composables/useFirebase.ts`

```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

export const useFirebase = () => {
  const config = useRuntimeConfig();
  const firebaseApp = getApps().length === 0
    ? initializeApp({
        apiKey: config.public.firebaseApiKey,
        authDomain: config.public.firebaseAuthDomain,
        projectId: config.public.firebaseProjectId,
      })
    : getApps()[0];

  const auth = getAuth(firebaseApp);
  const googleProvider = new GoogleAuthProvider();

  return { auth, googleProvider };
};
```

### 5-B. `pages/login.vue`

```vue
<script setup lang="ts">
import { signInWithPopup } from 'firebase/auth';
const { auth, googleProvider } = useFirebase();
const router = useRouter();

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
    router.push('/');
  } catch (e) {
    console.error('login failed', e);
  }
}
</script>

<template>
  <div class="login-screen">
    <h1>Belvedere</h1>
    <p class="subtitle">Spiral Project Management</p>
    <button @click="loginWithGoogle" class="login-button">
      Google でログイン
    </button>
    <p class="hint">招待制 — 招待されたメンバーのみ利用可能</p>
  </div>
</template>
```

### 5-C. `middleware/auth.global.ts`

```typescript
export default defineNuxtRouteMiddleware((to) => {
  // /login は認証不要
  if (to.path === '/login') return;

  const { auth } = useFirebase();
  if (!auth.currentUser) {
    return navigateTo('/login');
  }
});
```

### 5-D. `composables/useApiClient.ts`

```typescript
export const useApiClient = () => {
  const { auth } = useFirebase();
  const config = useRuntimeConfig();

  async function fetch<T>(path: string, options: any = {}): Promise<T> {
    const token = await auth.currentUser?.getIdToken();
    return $fetch<T>(`${config.public.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  return { fetch };
};
```

---

## 6. IDOR fix 全層改修の手順

### 6-A. 型レベル

```typescript
// packages/repo/src/types.ts
export interface TicketQuery {
  workspaceId: string;  // 必須化 (前は無かった)
  projectId?: string;
  sprintId?: string;
  status?: Status;
  assigneeId?: string;
  ritual?: Ritual;
  storyId?: string;
}

export interface EpicRepository {
  list(opts: { workspaceId: string; projectId?: string }): Promise<Epic[]>;
  // ...
}
```

### 6-B. 全層改修順 (bottom-up)

1. `packages/repo/src/types.ts` — interface に workspaceId 必須化
2. `packages/repo/src/memory.ts` — `xs.filter(t => t.workspaceId === q.workspaceId)` 追加
3. `packages/repo/src/firestore.ts` — `query.where('workspaceId', '==', q.workspaceId)` 追加
4. `packages/tools/src/index.ts` — `buildTools(repo, workspaceId)` factory に変更
5. `packages/agent/src/runtime.ts` — runAgent に `workspaceId` を context に追加
6. `apps/api/src/index.ts` — c.get('workspaceId') を Tools に渡す
7. `apps/mcp-server/src/server.ts` — MCP request の context から workspaceId を抽出
8. `apps/cli/src/index.ts` — env or arg で workspaceId 指定
9. テスト全更新 + typecheck

### 6-C. seed 修正

`packages/seed/src/projects.ts` 等の seed データに workspaceId フィールドを追加 (まだ全部に無ければ)。`workspaceId: 'ws-belvedere-demo'` で統一。

---

## 7. Firestore Security Rules

```javascript
// infra/firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 認証必須 + member テーブルに存在することを必須化
    function isAuthenticated() {
      return request.auth != null;
    }
    function isMemberOf(wsId) {
      return isAuthenticated()
        && exists(/databases/$(database)/documents/members/$(request.auth.uid))
        && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.workspaceId == wsId;
    }

    match /tickets/{ticketId} {
      allow read, write: if isMemberOf(resource.data.workspaceId);
    }
    match /epics/{epicId} {
      allow read, write: if isMemberOf(resource.data.workspaceId);
    }
    // ... 他のコレクションも同様
  }
}
```

**注意**: 本番では API 経由が前提なので、Security Rules はラストガード。フロント直叩きを基本許可しない設計でも OK。最小実装は `allow read, write: if false;` で API のみ通す、でもよい (議論ポイント)。

---

## 8. 招待 UI 最小実装 (Phase 1-E / 6/25-26)

```vue
<!-- apps/web/pages/settings/members.vue -->
<script setup lang="ts">
const { fetch } = useApiClient();
const members = await fetch<Member[]>('/members');
const newEmail = ref('');
const newRole = ref<'po' | 'sm' | 'dev'>('dev'); // 'guest' は 2026-06-23 権限再設計で廃止

async function invite() {
  await fetch('/members', {
    method: 'POST',
    body: { email: newEmail.value, role: newRole.value },
  });
  // member list 再取得
}
</script>

<template>
  <h2>Members</h2>
  <ul>
    <li v-for="m in members">
      {{ m.displayName }} ({{ m.email }}) — {{ m.role }}
    </li>
  </ul>
  <input v-model="newEmail" placeholder="email@example.com" />
  <select v-model="newRole">
    <option value="sm">Scrum Master</option>
    <option value="po">Product Owner</option>
    <option value="dev">Developer</option>
    <option value="guest">Guest</option>
  </select>
  <button @click="invite">招待</button>
</template>
```

API 側で `POST /members` を受けて Firestore に Member レコード作成。招待メール送信は最小実装では省く (= ユーザーが手動で「招待したよ」と通知する形)。

---

## 9. テスト計画

| テスト | 観点 |
|---|---|
| memory.test.ts | workspaceId フィルタ追加 |
| auth middleware ユニット | invalid token / missing token / valid token |
| workspace middleware ユニット | memberships 0 件 → 403 / 1 件 → req に workspaceId 注入 |
| IDOR シナリオテスト | A の workspace に B の token でアクセス → 403 |

---

## 10. 縮退ライン (6/14 時点で判断)

| 状況 | 縮退案 |
|---|---|
| 認証ミドルウェアが動くが IDOR fix 全層改修が間に合わない | TicketQuery 等の workspaceId を optional のままにして「現在の単一 Workspace 専用」で提出。ピッチで「マルチテナント設計は完備、フィルタ enforcement は次フェーズ」と説明 |
| Firestore Rules で詰まる | Rules を `allow read, write: if request.auth != null;` まで緩めて、API 層だけで防御 |
| Web ログイン UI のデザインが時間切れ | Tailwind なしのプレーン HTML + ボタン 1 個だけで OK |

---

## 11. U-Auth1 完了後の Claude 自走の流れ

1. `pnpm add firebase-admin --filter @belvedere/api` + `pnpm add firebase --filter @belvedere/web`
2. `apps/api/src/middleware/auth.ts` + `workspace.ts` 実装
3. `apps/web` のログイン UI 4 ファイル実装
4. `packages/repo/src/types.ts` + `memory.ts` + `firestore.ts` の IDOR fix
5. `packages/tools` / `packages/agent` / `apps/cli` / `apps/mcp-server` の caller 改修
6. `seed-firestore.ts` に初期 Workspace + owner Member 追加
7. `infra/firestore.rules` 雛形 + `firebase.json`
8. typecheck + test 全緑確認
9. commit を 5-7 個に分割 (Auth middleware / Login UI / IDOR types / IDOR fix impl / seed update / rules / tests)
10. push → CI 緑 + Deploy で /login が公開 URL で見える状態に
