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
    return await $fetch<T>(`${baseUrl}${path}`, { ...opts, headers });
  }

  return {
    get: <T>(path: string, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'GET' }),
    post: <T>(path: string, body?: Record<string, unknown>, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'POST', body }),
    patch: <T>(path: string, body?: Record<string, unknown>, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'PATCH', body }),
    delete: <T>(path: string, opts: NitroFetchOptions<string> = {}) =>
      call<T>(path, { ...opts, method: 'DELETE' }),
  };
};
