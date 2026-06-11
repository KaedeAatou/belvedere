// Retro Try 積み上げ (carry-forward stack) 取得 composable (Phase 1-C / 2026-06-11)。
// GET /api/retro-tries で取得して useState 共有。RetroScreen のローカル demo state を置換する単一 source。
// d&d で Try を積み上げると POST、× で DELETE、check で done トグル (PATCH)。
// この積み上げはスプリントを跨いで蓄積され、各儀式 Agent のコンテキストになる。
//
// 楽観更新はしない: mutate 後に再 fetch して画面へ反映する (useSprints.ts と同方針)。

import type { RetroTry } from '@belvedere/shared';

export const useRetroTries = () => {
  const tries = useState<RetroTry[]>('retro-tries', () => []);
  const isLoading = useState<boolean>('retro-tries-loading', () => false);
  const error = useState<string | null>('retro-tries-error', () => null);

  const api = useApiClient();

  async function fetchTries(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      tries.value = await api.get<RetroTry[]>('/api/retro-tries');
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      tries.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  type CreateInput = { text: string; sprintNumber: number; sprintId?: string };

  /** Try を積み上げに追加。成功後に再 fetch して画面へ反映。 */
  async function create(input: CreateInput): Promise<void> {
    await api.post<RetroTry>('/api/retro-tries', input as Record<string, unknown>);
    await fetchTries();
  }

  /** done フラグをトグル。成功後に再 fetch。 */
  async function toggleDone(t: RetroTry): Promise<void> {
    await api.patch<RetroTry>(`/api/retro-tries/${t.id}`, { done: !t.done });
    await fetchTries();
  }

  /** 積み上げから削除。成功後に再 fetch。 */
  async function remove(id: string): Promise<void> {
    await api.delete<{ deleted: string }>(`/api/retro-tries/${id}`);
    await fetchTries();
  }

  return { tries, isLoading, error, fetchTries, create, toggleDone, remove };
};
