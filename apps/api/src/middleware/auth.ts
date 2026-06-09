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
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const idToken = authHeader.substring(7);

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
