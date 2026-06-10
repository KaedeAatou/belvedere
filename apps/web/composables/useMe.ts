// 現在ログイン中の Member を取得 / 更新する composable (Phase 1-C / 2026-06-11)。
// GET /api/me で取得して useState で reactive に共有する。
//
// 使い方:
//   const { me, isLoading, error, fetchMe, updateDisplayName } = useMe();
//   await fetchMe();
//   await updateDisplayName('新しい名前');

import type { Member } from '@belvedere/shared';

export const useMe = () => {
  const me = useState<Member | null>('me', () => null);
  const isLoading = useState<boolean>('me-loading', () => false);
  const error = useState<string | null>('me-error', () => null);

  const api = useApiClient();

  async function fetchMe(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      me.value = await api.get<Member>('/api/me');
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      me.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateDisplayName(displayName: string): Promise<void> {
    if (!me.value) {
      error.value = 'not logged in';
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      me.value = await api.patch<Member>(`/api/members/${me.value.userId}`, { displayName });
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  return { me, isLoading, error, fetchMe, updateDisplayName };
};
