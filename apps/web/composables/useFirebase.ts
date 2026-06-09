// Firebase JS SDK 初期化 (lazy singleton)。
// SSR 中 (server side) では Firebase Auth が動作しないので、client side のみで初期化する。
// `process.client` ガードで SSR 中は null を返し、template 側は v-if="auth" 等で扱う。

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

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
  return _cached;
};
