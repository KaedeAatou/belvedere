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
  post<T>(path: string, body?: unknown, opts?: NitroFetchOptions<string>): Promise<T>;
}

export const useApiClient = (): ApiClient => {
  const config = useRuntimeConfig();
  const { idToken } = useAuth();
  const baseUrl = config.public.apiBaseUrl as string;

  async function call<T>(path: string, opts: NitroFetchOptions<string>): Promise<T> {
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
  };
};
