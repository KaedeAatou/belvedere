// Retro KPT ボードのノート取得 composable (2026-06-13)。
// GET /api/retro-notes で取得して useState 共有。RetroScreen の固定 demo cols を置換する単一 source。
// メンバーが各列にノートを追加 (POST)、投票で関心を可視化 (POST /:id/vote toggle)、
// 自分のノートは編集 (PATCH) / 削除 (DELETE) できる。
//
// 楽観更新はしない: mutate 後に再 fetch して画面へ反映する (useRetroTries.ts と同方針)。

import type { RetroNote } from '@belvedere/shared';

/**
 * KPT 列 + 由来スプリントで絞って votes 降順で返す純粋関数 (F-16 / 直接 unit テスト対象)。
 * バグ: column でしか絞らずスプリントを跨いでノートが累積表示され「今回の振り返り」が
 * 区別できなかった。退化入力の扱い:
 * - activeSprintNumber=null (active スプリント無し) → sprint で絞らない (ノートを隠さない)
 * - sprintNumber 未設定 (legacy 実データ) のノート → どのスプリント由来か判定できないため絞り込み時は含めない
 */
export function notesInColumn(
  notes: RetroNote[],
  column: RetroNote['column'],
  activeSprintNumber: number | null,
): RetroNote[] {
  return notes
    .filter((n) => n.column === column)
    .filter((n) => activeSprintNumber === null || n.sprintNumber === activeSprintNumber)
    .sort((a, b) => b.votes.length - a.votes.length);
}

export const useRetroNotes = () => {
  const notes = useState<RetroNote[]>('retro-notes', () => []);
  const isLoading = useState<boolean>('retro-notes-loading', () => false);
  const error = useState<string | null>('retro-notes-error', () => null);
  // F-16: 直近の取得スコープ。mutate 後の再 fetch が全件に戻らないよう記憶する。
  const lastQuery = useState<{ sprintNumber?: number }>('retro-notes-query', () => ({}));

  const api = useApiClient();

  /**
   * ノートを取得。opts を渡すとスコープを更新し、省略すると直近スコープで再取得する
   * (mutate 後の再 fetch 用)。sprintNumber 指定時は「今回の振り返り」に絞る (F-16)。
   */
  async function fetchNotes(opts?: { sprintNumber?: number }): Promise<void> {
    if (opts !== undefined) lastQuery.value = opts;
    const sn = lastQuery.value.sprintNumber;
    const path = sn !== undefined ? `/api/retro-notes?sprintNumber=${sn}` : '/api/retro-notes';
    isLoading.value = true;
    error.value = null;
    try {
      notes.value = await api.get<RetroNote[]>(path);
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
