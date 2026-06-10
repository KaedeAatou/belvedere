// Firebase JS SDK 初期化 (lazy singleton)。
// SSR 中 (server side) では Firebase Auth が動作しないので、client side のみで初期化する。
// `process.client` ガードで SSR 中は null を返し、template 側は v-if="auth" 等で扱う。

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCustomToken, type Auth } from 'firebase/auth';

interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
}

let _cached: FirebaseHandles | null = null;

export const useFirebase = (): FirebaseHandles | null => {
  // SSR 中は Firebase 初期化しない (window 依存のため)
  if (!import.meta.client) return null;
  if (_cached) return _cached;

  const config = useRuntimeConfig();
  const firebaseConfig = {
    apiKey: config.public.firebaseApiKey as string,
    authDomain: config.public.firebaseAuthDomain as string,
    projectId: config.public.firebaseProjectId as string,
    appId: config.public.firebaseAppId as string,
  };

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();

  _cached = { app, auth, googleProvider };

  // E2E 用に window scope に signInWithCustomToken を露出 (Phase 1-C / 2026-06-11)
  // bare specifier ('firebase/auth') は page.evaluate からは解決不可だが、
  // build 時に bundle 済の関数を window 経由で渡せば e2e fixture から呼べる。
  //
  // セキュリティ: signInWithCustomToken は custom token (= SA 鍵で署名された JWT) が
  // 必須なので、攻撃者が任意 user としてログインすることはできない (SA 鍵を持ってない限り)。
  // window 露出による追加リスクはない (Firebase JS SDK の standard pattern)。
  if (typeof window !== 'undefined') {
    (window as unknown as { __belvedereFirebase?: unknown }).__belvedereFirebase = {
      auth,
      signInWithCustomToken: (token: string) => signInWithCustomToken(auth, token),
    };
  }

  return _cached;
};
