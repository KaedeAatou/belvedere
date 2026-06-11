// 見積もりポーカー composable (T7-1 / 2026-06-11)。
//
// 5 endpoint (start / fetch / vote / reveal / adopt) の薄いラッパー。
// 隠蔽はサーバ側で強制される (voting 中の GET は他人の value を返さない) ため、
// フロントは返ってきた EstimationView をそのまま描画するだけでよい。
//
// EstimationView は apps/api 側の型 (VotingView | RevealedView) と一致させた web↔api 境界型。
// セッション未開始のとき GET は 404 → fetch() は null を返す (エラー扱いにしない)。

import type { EstimationValue } from '@belvedere/shared';

export type EstimationView =
  | { status: 'voting'; myVote: EstimationValue | null; votedUserIds: string[]; voteCount: number }
  | {
      status: 'revealed' | 'adopted' | 'discarded';
      votes: { userId: string; value: EstimationValue }[];
      adoptedValue?: number;
      revealedAt?: string;
    };

export const useEstimation = () => {
  const api = useApiClient();
  const error = ref<string | null>(null);

  function msg(e: unknown): string {
    const err = e as { data?: { error?: string }; message?: string };
    return err.data?.error ?? err.message ?? 'unknown error';
  }

  /** セッション取得。未開始 (404) は null を返す (正常系)。 */
  async function fetch(ticketId: string): Promise<EstimationView | null> {
    try {
      return await api.get<EstimationView>(`/api/tickets/${ticketId}/estimation`);
    } catch {
      return null;
    }
  }

  /** セッション開始 (owner/sm/po)。旧 revealed セッションはサーバが discard。 */
  async function start(ticketId: string): Promise<EstimationView | null> {
    error.value = null;
    try {
      return await api.post<EstimationView>(`/api/tickets/${ticketId}/estimation`);
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  /** 投票 (member)。voting 中のみ。 */
  async function vote(ticketId: string, value: EstimationValue): Promise<EstimationView | null> {
    error.value = null;
    try {
      return await api.put<EstimationView>(`/api/tickets/${ticketId}/estimation/vote`, { value });
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  /** 一斉開示 (owner/sm/po)。 */
  async function reveal(ticketId: string): Promise<EstimationView | null> {
    error.value = null;
    try {
      return await api.post<EstimationView>(`/api/tickets/${ticketId}/estimation/reveal`);
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  /** 採用 (owner/sm/po)。adoptedValue を Ticket.estimatePt に反映する。 */
  async function adopt(ticketId: string, value: number): Promise<EstimationView | null> {
    error.value = null;
    try {
      return await api.post<EstimationView>(`/api/tickets/${ticketId}/estimation/adopt`, { value });
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  return { error, fetch, start, vote, reveal, adopt };
};
