// Phase 1-B 認証ミドルウェア (2026-06-10)。
// Firebase Admin SDK で Authorization: Bearer <ID token> を検証し、req に user を載せる。
// 検証失敗は 401。/health と /login (もし作るなら) は除外する設計。
//
// 動作要件:
//   - ADC (Application Default Credentials) が解決可能 (Cloud Run なら runtime SA、ローカルなら gcloud auth application-default login)
//   - SA に roles/firebaseauth.admin が必要 (= memory: project_wif_setup_state)

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { MiddlewareHandler } from 'hono';
import type { RepoContainer } from '@belvedere/repo';
import { matchesServiceToken, MCP_SERVICE_USER_ID, MCP_SERVICE_EMAIL } from '../config/service-token';
import { hashApiKeyToken, looksLikeApiKey } from '../config/api-key';

// アプリ起動時に 1 度だけ初期化 (lazy singleton)
let _firebaseApp: ReturnType<typeof initializeApp> | null = null;
function firebaseApp() {
  if (_firebaseApp) return _firebaseApp;
  if (getApps().length > 0) {
    _firebaseApp = getApps()[0]!;
    return _firebaseApp;
  }
  _firebaseApp = initializeApp({
    credential: applicationDefault(),
    ...(process.env.GCP_PROJECT ? { projectId: process.env.GCP_PROJECT } : {}),
  });
  return _firebaseApp;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

/**
 * Hono ミドルウェア。Authorization ヘッダの Bearer token を Firebase で検証し、
 * 成功時は c.set('user', { userId, email }) を行う。
 *
 * 失敗パターン:
 *   - ヘッダなし / 不正フォーマット → 401 { error: 'missing_token' }
 *   - token 検証失敗 (改ざん / 期限切れ / 偽造) → 401 { error: 'invalid_token' }
 *   - email 取得不能 (匿名ログイン等) → 401 { error: 'no_email' }
 *
 * 機械認証パス (MCP service token / 2026-06-17):
 *   - env MCP_SERVICE_TOKEN が設定済で Bearer がそれと定数時間一致する場合のみ、
 *     Firebase 検証を skip して専用サービスプリンシパル (svc:mcp) として通す。
 *   - env 未設定時はこのパスは無効 (Firebase のみ)。詳細は config/service-token.ts。
 *
 * per-user API キーパス (2026-06-17):
 *   - Bearer が `blv_` prefix を持つ場合、sha256 ハッシュで repo.apiKeys.getByHash を引き、
 *     発行ユーザー本人 (userId/email) として通す。lastUsedAt を best-effort 更新。
 *   - repo を引くため factory 化 (workspaceMiddleware(repo) と同形)。詳細は config/api-key.ts。
 *
 * 経路順: service token → API キー (prefix 分岐) → Firebase。`blv_` トークンは Firebase に回さない。
 */
export function authMiddleware(repo: RepoContainer): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'missing_token' }, 401);
    }
    const idToken = authHeader.substring(7);

    // --- 機械認証パス (MCP service token) ---
    // 人間の Firebase ログインができない MCP server 用。env MCP_SERVICE_TOKEN と一致する時だけ有効。
    // 一致したら Firebase 検証を経ずにサービスプリンシパルを set し、後段の workspaceMiddleware で
    // email-allowlist 経由 ws-belvedere の po member にブートストラップされる (= 人間と同じ経路)。
    if (matchesServiceToken(idToken)) {
      const user: AuthenticatedUser = { userId: MCP_SERVICE_USER_ID, email: MCP_SERVICE_EMAIL };
      c.set('user', user);
      await next();
      return;
    }

    // --- per-user API キーパス ---
    // prefix `blv_` で Firebase JWT (`eyJ...`) と曖昧さなく分岐。提示トークンを sha256 して
    // getByHash で本人を解決し、見つかれば発行ユーザーとして通す (workspace は X-Workspace-Id で選択)。
    if (looksLikeApiKey(idToken)) {
      const key = await repo.apiKeys.getByHash(hashApiKeyToken(idToken));
      if (!key) {
        return c.json({ error: 'invalid_token' }, 401);
      }
      const user: AuthenticatedUser = { userId: key.userId, email: key.ownerEmail };
      c.set('user', user);
      // キーは発行元 workspace に固定する (ユーザ×ワークスペース scope / 2026-06-26)。
      // workspaceMiddleware がこの値を見て X-Workspace-Id 横断を禁止 → 漏洩時の blast radius を
      // 発行元 1 workspace に限定する。人間の Firebase ログインはこの値を持たないので従来通り切替可。
      c.set('apiKeyWorkspaceId', key.workspaceId);
      // lastUsedAt は best-effort 更新 (await せず、失敗してもリクエストは通す)。
      void repo.apiKeys.upsert({ ...key, lastUsedAt: new Date().toISOString() });
      await next();
      return;
    }

    try {
      const decodedToken = await getAuth(firebaseApp()).verifyIdToken(idToken);
      if (!decodedToken.email) {
        return c.json({ error: 'no_email' }, 401);
      }
      const user: AuthenticatedUser = {
        userId: decodedToken.uid,
        email: decodedToken.email,
      };
      c.set('user', user);
      await next();
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[auth] token verification failed: ${msg}`);
      return c.json({ error: 'invalid_token' }, 401);
    }
  };
}
