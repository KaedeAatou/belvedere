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

  /**
   * スプリント表示ラベル。name 有り→「Sprint 13 · 決済MVP」、無し→「Sprint 13」。
   * suffix は状態接尾辞 (例 'planned' → 「Sprint 14 (planned)」)、s が無ければ fallback を返す。
   */
  const sprintLabel = (s: Sprint | null | undefined, suffix = '', fallback = ''): string => {
    if (!s) return fallback;
    const base = s.name && s.name.trim() ? `Sprint ${s.number} · ${s.name.trim()}` : `Sprint ${s.number}`;
    return suffix ? `${base} (${suffix})` : base;
  };
  /** CURRENT 区画ラベル (active sprint)。Planning / Refinement のヘッダ共通。 */
  const currentLabel = computed(() => sprintLabel(activeSprint.value, '', 'Current Sprint'));
  /** NEXT 区画ラベル (planned sprint)。 */
  const nextLabel = computed(() => sprintLabel(nextPlanned.value, 'planned', 'Next Sprint'));

  type SprintEdit = { name?: string; goal?: string; startsAt?: string; endsAt?: string };

  /** goal / 期間の編集 (status は変えない)。成功後に再 fetch して画面へ反映。 */
  async function patchSprint(id: string, body: SprintEdit): Promise<void> {
    await api.patch<Sprint>(`/api/sprints/${id}`, body as Record<string, unknown>);
    await fetchSprints();
  }

  /**
   * planned スプリントを開始 (active 化)。現 active は completed + velocity 確定、
   * さらに新しい next (planned) が API 側で自動生成される。成功後に再 fetch。
   */
  async function startSprint(id: string, body: SprintEdit): Promise<void> {
    await api.post<{ started: Sprint; completed: Sprint | null; newNext: Sprint }>(
      `/api/sprints/${id}/start`,
      body as Record<string, unknown>,
    );
    await fetchSprints();
  }

  /** 新規 planned スプリントを作成 (number は max+1)。c社が 0 から計画する入口。成功後に再 fetch。 */
  async function createSprint(body: { name?: string; goal: string; startsAt: string; endsAt: string }): Promise<Sprint> {
    const created = await api.post<Sprint>('/api/sprints', body as Record<string, unknown>);
    await fetchSprints();
    return created;
  }

  return { sprints, activeSprint, velocityHistory, plannedSprints, nextPlanned, sprintLabel, currentLabel, nextLabel, isLoading, error, fetchSprints, patchSprint, startSprint, createSprint };
};
