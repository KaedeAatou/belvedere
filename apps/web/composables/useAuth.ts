// 認証状態の reactive state + sign in / sign out 操作。
// onAuthStateChanged で Firebase Auth の状態変化を watch して
// global state (useState) に同期する。
//
// 使い方:
//   const { user, isAuthenticated, signInWithGoogle, signOut, idToken } = useAuth();
//   await signInWithGoogle();
//   const token = await idToken();  // API 呼出時に Authorization Bearer ヘッダに使う

import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export const useAuth = () => {
  // SSR でも使える形にするため useState で global state を持つ
  const user = useState<AuthUser | null>('auth-user', () => null);
  const isInitialized = useState<boolean>('auth-initialized', () => false);

  const isAuthenticated = computed(() => user.value !== null);

  // client 側で 1 回だけ onAuthStateChanged を仕掛ける
  if (import.meta.client && !isInitialized.value) {
    const fb = useFirebase();
    if (fb) {
      onAuthStateChanged(fb.auth, (firebaseUser: User | null) => {
        user.value = firebaseUser
          ? {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
            }
          : null;
        isInitialized.value = true;
      });
    }
  }

  async function signInWithGoogle(): Promise<void> {
    const fb = useFirebase();
    if (!fb) throw new Error('Firebase not initialized (server side?)');
    await signInWithPopup(fb.auth, fb.googleProvider);
  }

  /**
   * メール/パスワードでログイン (ハッカソン審査員用デモアカウント / 2026-06-23)。
   * Google アカウント連携を強いずに触ってもらうための経路。
   * ユーザーは Firebase Console で事前作成済の前提 (サインアップは提供しない —
   * allowlist に無いメアドは workspaceMiddleware が 403 で弾くため新規登録は無意味)。
   */
  async function signInWithEmailPassword(email: string, password: string): Promise<void> {
    const fb = useFirebase();
    if (!fb) throw new Error('Firebase not initialized (server side?)');
    await signInWithEmailAndPassword(fb.auth, email, password);
  }

  async function signOut(): Promise<void> {
    const fb = useFirebase();
    if (!fb) return;
    await firebaseSignOut(fb.auth);
  }

  /** API 呼出時に使う ID token。期限切れなら自動で refresh される (Firebase SDK の機能)。 */
  async function idToken(): Promise<string | null> {
    const fb = useFirebase();
    if (!fb || !fb.auth.currentUser) return null;
    return await fb.auth.currentUser.getIdToken();
  }

  return {
    user,
    isAuthenticated,
    isInitialized,
    signInWithGoogle,
    signInWithEmailPassword,
    signOut,
    idToken,
  };
};
