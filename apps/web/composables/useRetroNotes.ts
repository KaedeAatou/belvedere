// Retro KPT ボードのノート取得 composable (2026-06-13)。
// GET /api/retro-notes で取得して useState 共有。RetroScreen の固定 demo cols を置換する単一 source。
// メンバーが各列にノートを追加 (POST)、投票で関心を可視化 (POST /:id/vote toggle)、
// 自分のノートは編集 (PATCH) / 削除 (DELETE) できる。
//
// 楽観更新はしない: mutate 後に再 fetch して画面へ反映する (useRetroTries.ts と同方針)。

import type { RetroNote } from '@belvedere/shared';

export const useRetroNotes = () => {
  const notes = useState<RetroNote[]>('retro-notes', () => []);
  const isLoading = useState<boolean>('retro-notes-loading', () => false);
  const error = useState<string | null>('retro-notes-error', () => null);

  const api = useApiClient();

  async function fetchNotes(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      notes.value = await api.get<RetroNote[]>('/api/retro-notes');
    } catch (e) {
      error.value = apiErrorMessage(e);
      notes.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  type CreateInput = { column: 'keep' | 'problem' | 'try'; text: string; sprintNumber: number };

  /** ノートを追加。成功後に再 fetch して画面へ反映。 */
  async function create(input: CreateInput): Promise<void> {
    await api.post<RetroNote>('/api/retro-notes', input as Record<string, unknown>);
    await fetchNotes();
  }

  /** ノートの本文を編集。成功後に再 fetch。 */
  async function editText(id: string, text: string): Promise<void> {
    await api.patch<RetroNote>(`/api/retro-notes/${id}`, { text });
    await fetchNotes();
  }

  /** 現在ユーザーの投票をトグル。成功後に再 fetch。 */
  async function toggleVote(id: string): Promise<void> {
    await api.post<RetroNote>(`/api/retro-notes/${id}/vote`);
    await fetchNotes();
  }

  /** ノートを削除。成功後に再 fetch。 */
  async function remove(id: string): Promise<void> {
    await api.delete<{ deleted: string }>(`/api/retro-notes/${id}`);
    await fetchNotes();
  }

  return { notes, isLoading, error, fetchNotes, create, editText, toggleVote, remove };
};
