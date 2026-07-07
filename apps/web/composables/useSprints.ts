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
      error.value = apiErrorMessage(e);
      sprints.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /** 進行中スプリント (status==='active')。無ければ null。 */
  const activeSprint = computed<Sprint | null>(() => sprints.value.find((s) => s.status === 'active') ?? null);

  /** 完了済スプリントのベロシティ実績 (Planning のベロシティチャート用、number 昇順)。
   *  分母定義は正準 (completed + velocity 数値 / averageVelocity と同一 / F-30 根治)。 */
  const velocityHistory = computed(() =>
    sprints.value
      .filter((s) => s.status === 'completed' && typeof s.velocity === 'number')
      .sort((a, b) => a.number - b.number)
      .map((s) => ({ number: s.number, velocity: s.velocity as number })),
  );

  /** 計画中スプリント (status==='planned'、number 昇順)。Planning で次スプリントを練る対象。 */
  const plannedSprints = computed(() => sprints.value.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number));
  /** 直近の次スプリント (最小 number の planned)。無ければ null。 */
  const nextPlanned = computed<Sprint | null>(() => plannedSprints.value[0] ?? null);

  /** 完了済スプリント (status==='completed'、number 降順=新しい順)。スプリント履歴ビュー + backlog 除外用。 */
  const completedSprints = computed(() => [...sprints.value.filter((s) => s.status === 'completed')].sort((a, b) => b.number - a.number));

  /**
   * スプリント表示ラベル (WC-c6d339fb)。**番号 (Sprint 13) は出さない**。
   * name 有り→ name のみ (例「決済MVP」)、name 無し→ fallback (例「Current Sprint」)。
   * suffix は状態接尾辞 (例 'planned' → 「決済MVP (planned)」)。s が無くても fallback を返す。
   * 別プロジェクト等でスプリント番号が連番にならない運用に対応するため、付けた名前を主役にする。
   */
  const sprintLabel = (s: Sprint | null | undefined, suffix = '', fallback = ''): string => {
    if (!s) return fallback;
    const base = s.name && s.name.trim() ? s.name.trim() : fallback;
    return suffix ? `${base} (${suffix})` : base;
  };
  /** CURRENT 区画ラベル (active sprint)。Planning / Refinement のヘッダ共通。 */
  const currentLabel = computed(() => sprintLabel(activeSprint.value, '', 'Current Sprint'));
  /** NEXT 区画ラベル (planned sprint)。 */
  const nextLabel = computed(() => sprintLabel(nextPlanned.value, 'planned', 'Next Sprint'));

  // carryOverIds (WC-30): 開始時に旧 active から新 active へ持ち越す未完了チケット id。
  type SprintEdit = { name?: string; goal?: string; startsAt?: string; endsAt?: string; carryOverIds?: string[] };

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

  return { sprints, activeSprint, velocityHistory, plannedSprints, nextPlanned, completedSprints, sprintLabel, currentLabel, nextLabel, isLoading, error, fetchSprints, patchSprint, startSprint, createSprint };
};

/**
 * WC-35: チケット編集のスプリント選択候補。active + planned のみに絞る (completed は新規に選ばせない) が、
 * 現在割当済 (currentSprintId) が completed の場合はそれだけ残す (セレクトの現値が空表示になるのを防ぐ)。
 * Nuxt 非依存の純粋関数として直接テストする。
 */
export function sprintOptionsForEdit(sprints: Sprint[], currentSprintId: string | undefined): Sprint[] {
  return sprints.filter(
    (s) => s.status === 'active' || s.status === 'planned' || s.id === currentSprintId,
  );
}
