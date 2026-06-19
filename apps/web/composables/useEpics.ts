// Epic 取得 composable (案A / 2026-06-19)。
// GET /api/epics で取得して useState 共有。Story 作成フォームの親 Epic セレクタが参照する単一 source。
// story は親 Epic 必須 (案A) なので、作成ダイアログを開く前に epics が揃っている必要がある。

import type { Epic } from '@belvedere/shared';

export const useEpics = () => {
  const epics = useState<Epic[]>('epics', () => []);
  const isLoading = useState<boolean>('epics-loading', () => false);
  const error = useState<string | null>('epics-error', () => null);

  const api = useApiClient();

  async function fetchEpics(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      epics.value = await api.get<Epic[]>('/api/epics');
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      epics.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /** story の親に選べる Epic (cancelled / completed は除外)。セレクタの候補に使う。 */
  const selectableEpics = computed<Epic[]>(() =>
    epics.value.filter((e) => e.status !== 'cancelled' && e.status !== 'completed'),
  );

  return { epics, selectableEpics, isLoading, error, fetchEpics };
};
