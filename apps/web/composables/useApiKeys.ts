// per-user API キーの発行 / 一覧 / 失効 (2026-06-17)。
// useMembers と同じ流儀: useApiClient で /api/api-keys を叩き、reactive state を返す。
// tokenHash は API が返さない (ApiKeyView)。平文 token は発行レスポンスでのみ 1 回返るので
// newToken に保持し、画面で 1 度だけ表示する (再取得不可)。

import type { ApiKeyView } from '@belvedere/shared';

export const useApiKeys = () => {
  const api = useApiClient();

  const keys = ref<ApiKeyView[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  /** 直近に発行したキーの平文 (今だけ表示)。発行時のみ非 null になる。 */
  const newToken = ref<string | null>(null);

  function errText(e: unknown): string {
    return apiErrorMessage(e);
  }

  async function fetchKeys(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      keys.value = await api.get<ApiKeyView[]>('/api/api-keys');
    } catch (e) {
      error.value = errText(e);
    } finally {
      isLoading.value = false;
    }
  }

  /** キーを発行する。成功時は newToken に平文が入り、一覧を再取得する。 */
  async function createKey(name: string): Promise<boolean> {
    error.value = null;
    newToken.value = null;
    try {
      const res = await api.post<ApiKeyView & { token: string }>('/api/api-keys', { name });
      newToken.value = res.token;
      await fetchKeys();
      return true;
    } catch (e) {
      error.value = errText(e);
      return false;
    }
  }

  async function revokeKey(id: string): Promise<void> {
    error.value = null;
    try {
      await api.delete(`/api/api-keys/${id}`);
      await fetchKeys();
    } catch (e) {
      error.value = errText(e);
    }
  }

  /** 「今だけ表示」のバナーを閉じる (平文をメモリから消す)。 */
  function dismissNewToken(): void {
    newToken.value = null;
  }

  return { keys, isLoading, error, newToken, fetchKeys, createKey, revokeKey, dismissNewToken };
};
