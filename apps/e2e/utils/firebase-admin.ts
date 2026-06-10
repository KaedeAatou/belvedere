// Firebase Admin SDK helper (Stage 1 / 2026-06-10)。
// CI で OAuth ポップアップは自動化不可能なので、Admin SDK で custom token を発行し
// クライアント側 SDK の signInWithCustomToken でログイン状態を作る。
//
// SA 鍵の取得:
//   - CI: GitHub secret FIREBASE_SA_KEY (JSON 全文) を env 経由で展開
//   - ローカル: .env.local に GOOGLE_APPLICATION_CREDENTIALS=<path> または FIREBASE_SA_KEY=<json>
//
// 注意: 発行した custom token は単一 UID を識別する短命 token、漏洩しても影響限定的だが
// SA 鍵 (これを発行する側) は絶対 commit しない。

import { initializeApp, cert, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let _app: App | null = null;

/**
 * Admin SDK の初期化。env を優先順:
 * 1. FIREBASE_SA_KEY (JSON 全文 / CI 用)
 * 2. GOOGLE_APPLICATION_CREDENTIALS (ファイルパス / ローカル用)
 * 3. ADC (gcloud auth application-default login 済の場合)
 */
function adminApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0]!;
    return _app;
  }

  const saJson = process.env.FIREBASE_SA_KEY;
  if (saJson) {
    let parsed: { project_id?: string; client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(saJson);
    } catch (e) {
      throw new Error(`FIREBASE_SA_KEY is not valid JSON: ${(e as Error).message}`);
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('FIREBASE_SA_KEY missing required fields (project_id / client_email / private_key)');
    }
    _app = initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }),
      projectId: parsed.project_id,
    });
    return _app;
  }

  // フォールバック: ADC
  _app = initializeApp({
    credential: applicationDefault(),
    ...(process.env.GCP_PROJECT ? { projectId: process.env.GCP_PROJECT } : {}),
  });
  return _app;
}

/**
 * robot user 用の custom token を発行する。
 * UID は任意の文字列で良い (Firebase Auth に user を事前作成する必要なし、
 * createCustomToken は uid を identifier として token に焼き込むだけ)。
 *
 * email は emailAllowlist との突合のため claims に追加する想定だが、
 * Stage 1 では既存 mygolanglearn@gmail.com の allowlist を踏むため、
 * email を実際の Firebase user の primary email にしないと workspaceMiddleware で 403。
 *
 * → Stage 1 では Firebase Console で mygolanglearn@gmail.com として
 *   signInWithCustomToken した user の UID を robot UID として再利用する設計。
 *   Stage 2 で専用 robot user (robot-e2e@belvedere.test) に分離する。
 */
export async function mintCustomToken(uid: string, additionalClaims?: Record<string, unknown>): Promise<string> {
  const auth = getAuth(adminApp());
  return await auth.createCustomToken(uid, additionalClaims);
}

/**
 * SA 鍵の project_id を取得 (Web SDK 初期化に使う)。
 * Stage 1 では belvedere-dev-atrium 固定だが、env から動的に取れた方が安全。
 */
export function getProjectId(): string {
  const saJson = process.env.FIREBASE_SA_KEY;
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson) as { project_id?: string };
      if (parsed.project_id) return parsed.project_id;
    } catch {
      // fallthrough
    }
  }
  return process.env.GCP_PROJECT ?? 'belvedere-dev-atrium';
}
