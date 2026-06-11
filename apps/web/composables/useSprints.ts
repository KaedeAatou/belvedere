// Sprint 取得 composable (Phase 1-C / R3 / 2026-06-11)。
// GET /api/sprints で取得して useState 共有。旧 demo の SPRINT 定数を置換する単一 source。
// active sprint (status==='active') を各画面が参照する (容量/ゴール/ベロシティ算出)。

import type { Sprint } from '@belvedere/shared';

export const useSprints = () => {
  const sprints = useState<Sprint[]>('sprints', () => []);
  const isLoading = useState<boolean>('sprints-loading', () => false);
  const error = useState<string | null>('sprints-error', () => null);

  const api = useApiClient();

  async function fetchSprints(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      sprints.value = await api.get<Sprint[]>('/api/sprints');
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      sprints.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /** 進行中スプリント (status==='active')。無ければ null。 */
  const activeSprint = computed<Sprint | null>(() => sprints.value.find((s) => s.status === 'active') ?? null);

  /** 完了済スプリントのベロシティ実績 (Planning のベロシティチャート用、number 昇順)。 */
  const velocityHistory = computed(() =>
    sprints.value
      .filter((s) => s.velocity !== undefined)
      .sort((a, b) => a.number - b.number)
      .map((s) => ({ number: s.number, velocity: s.velocity as number })),
  );

  return { sprints, activeSprint, velocityHistory, isLoading, error, fetchSprints };
};
