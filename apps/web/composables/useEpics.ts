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
      error.value = apiErrorMessage(e);
      epics.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Epic を新規作成 (POST /api/epics)。案A の決定2部目「Story を作れる儀式で Epic も追加できる」。
   * 成功時はローカル epics に追記して selectableEpics に即反映する (作成→即選択を可能にする)。
   */
  async function createEpic(input: { name: string; rationale?: string }): Promise<Epic | null> {
    isLoading.value = true;
    error.value = null;
    try {
      const body: Record<string, unknown> = { name: input.name };
      if (input.rationale !== undefined && input.rationale !== '') body.rationale = input.rationale;
      const created = await api.post<Epic>('/api/epics', body);
      epics.value = [...epics.value, created];
      return created;
    } catch (e) {
      error.value = apiErrorMessage(e);
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /** story の親に選べる Epic (cancelled / completed は除外)。セレクタの候補に使う。 */
  const selectableEpics = computed<Epic[]>(() =>
    epics.value.filter((e) => e.status !== 'cancelled' && e.status !== 'completed'),
  );

  return { epics, selectableEpics, isLoading, error, fetchEpics, createEpic };
};
