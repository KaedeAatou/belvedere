// Sprint 取得 composable (Phase 1-C / R3 / 2026-06-11)。
// GET /api/sprints で取得して useState 共有。旧 demo の SPRINT 定数を置換する単一 source。
// active sprint (status==='active') を各画面が参照する (ゴール / velocity 比較の算出)。

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

  /** 計画中スプリント (status==='planned'、number 昇順)。Planning で次スプリントを練る対象。 */
  const plannedSprints = computed(() => sprints.value.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number));
  /** 直近の次スプリント (最小 number の planned)。無ければ null。 */
  const nextPlanned = computed<Sprint | null>(() => plannedSprints.value[0] ?? null);

  type SprintEdit = { goal?: string; startsAt?: string; endsAt?: string };

  /** goal / 期間の編集 (status は変えない)。成功後に再 fetch して画面へ反映。 */
  async function patchSprint(id: string, body: SprintEdit): Promise<void> {
    await api.patch<Sprint>(`/api/sprints/${id}`, body as Record<string, unknown>);
    await fetchSprints();
  }

  /** planned スプリントを開始 (active 化)。現 active は completed + velocity 確定。成功後に再 fetch。 */
  async function startSprint(id: string, body: SprintEdit): Promise<void> {
    await api.post<{ started: Sprint; completed: Sprint | null }>(`/api/sprints/${id}/start`, body as Record<string, unknown>);
    await fetchSprints();
  }

  return { sprints, activeSprint, velocityHistory, plannedSprints, nextPlanned, isLoading, error, fetchSprints, patchSprint, startSprint };
};
