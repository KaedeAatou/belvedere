// API クライアント。$fetch ラッパーで毎リクエストに Firebase ID token を付与する。
// 失敗時のリトライ / エラー UI 表示はここで集約。
//
// 使い方:
//   const api = useApiClient();
//   const tickets = await api.get<Ticket[]>('/api/tickets');
//   const me = await api.get<{ userId: string; email: string; workspaceId: string; role: string }>('/api/whoami');

import type { NitroFetchOptions } from 'nitropack';

export interface ApiClient {
  get<T>(path: string, opts?: NitroFetchOptions<string>): Promise<T>;
  post<T>(path: string, body?: Record<string, unknown>, opts?: NitroFetchOptions<string>): Promise<T>;
  put<T>(path: string, body?: Record<string, unknown>, opts?: NitroFetchOptions<string>): Promise<T>;
  patch<T>(path: string, body?: Record<string, unknown>, opts?: NitroFetchOptions<string>): Promise<T>;
  delete<T>(path: string, opts?: NitroFetchOptions<string>): Promise<T>;
}

export const useApiClient = (): ApiClient => {
  const config = useRuntimeConfig();
  const { idToken, isInitialized } = useAuth();
  const baseUrl = config.public.apiBaseUrl as string;

  /**
   * Page navigation (hard reload) 直後は Firebase auth インスタンスが再初期化され、
   * IndexedDB から currentUser を復元するのに少し時間がかかる (非同期)。
   * その間に onMounted の fetchMe / fetchTickets が走ると idToken=null → missing_token に。
   * isInitialized が true になる (= onAuthStateChanged の初回 callback 完了) を待つ。
   * これにより全 composable (useMe / useTickets / etc) が一律 auth 確定を保証される。
   */
  async function waitAuthReady(timeoutMs = 10_000): Promise<void> {
    if (isInitialized.value) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { stop(); resolve(); }, timeoutMs);
      const stop = watch(isInitialized, (v) => {
        if (v) { clearTimeout(timer); stop(); resolve(); }
      });
    });
  }

  async function call<T>(path: string, opts: NitroFetchOptions<string>): Promise<T> {
    await waitAuthReady();
    const token = await idToken();
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string> | undefined),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // current Workspace が選択済なら X-Workspace-Id を付与 (API の workspaceMiddleware が解釈)。
    // localStorage を直接読む (useWorkspaces への循環依存を避けるため。key は WORKSPACE_ID_KEY と一致)。
    if (import.meta.client) {
      const wsId = window.localStorage.getItem('belvedere.workspaceId');
      if (wsId) headers['X-Workspace-Id'] = wsId;
    }
    try {
      return await $fetch<T>(`${baseUrl}${path}`, { ...opts, headers });
    } catch (e) {
      // needs_workspace = ログイン許可済だが所属 Workspace ゼロ (招待されたが部屋未作成)。
      // onboarding (自分の Workspace を作る画面) へ一度だけ誘導する。既に profile 上なら無限ループを避ける。
      const err = e as { data?: { error?: string } };
      if (import.meta.client && err?.data?.error === 'needs_workspace') {
        const route = useRoute();
        if (!route.path.startsWith('/settings/profile')) {
          await navigateTo('/settings/profile?onboard=1');
        }
      }
      throw e;
    }
  }

  return {
    get: <T>(path: string, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'GET' }),
    post: <T>(path: string, body?: Record<string, unknown>, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'POST', body }),
    put: <T>(path: string, body?: Record<string, unknown>, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'PUT', body }),
    patch: <T>(path: string, body?: Record<string, unknown>, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'PATCH', body }),
    delete: <T>(path: string, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'DELETE' }),
  };
};
