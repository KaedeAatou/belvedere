// 実 API データ用の Ticket composable (Phase 1-C / 2026-06-11)。
// R3 で demo data (useDemoData) を完全廃止し、全画面がこの単一 source を描画する。
//
// 使い方:
//   const { tickets, isLoading, error, fetchTickets, createTicket } = useTickets();
//   onMounted(() => fetchTickets());
//   await createTicket({ title: '新規' });

import type { Ticket, Status, Priority, ValueImpact, Ritual, TicketType } from '@belvedere/shared';

export interface CreateTicketInput {
  title: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  valueImpact?: ValueImpact;
  ritual?: Ritual;
  sprintId?: string;
  assigneeId?: string;
  estimatePt?: number;
  acceptanceCriteria?: string[];
  labels?: string[];
  type?: TicketType;
  timeboxHours?: number;
  /** 分割で生成する子チケットの親 (Refinement: US→子Story / Planning: Story→Task/Spike)。 */
  parentTicketId?: string;
}

/** 部分更新 (PATCH /api/tickets/:id) の入力。全フィールド任意。 */
export interface PatchTicketInput {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  valueImpact?: ValueImpact;
  /** null/空文字で sprintId を解除 (3 区画ビューの BACKLOG へ戻す d&d)。undefined は「変更なし」。 */
  sprintId?: string | null;
  assigneeId?: string;
  estimatePt?: number;
  acceptanceCriteria?: string[];
  labels?: string[];
  type?: TicketType;
  timeboxHours?: number;
  orderIndex?: number;
}

export const useTickets = () => {
  const tickets = useState<Ticket[]>('tickets', () => []);
  const isLoading = useState<boolean>('tickets-loading', () => false);
  const error = useState<string | null>('tickets-error', () => null);

  const api = useApiClient();

  async function fetchTickets(filters?: { sprintId?: string; status?: Status }): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const q = new URLSearchParams();
      if (filters?.sprintId) q.set('sprintId', filters.sprintId);
      if (filters?.status) q.set('status', filters.status);
      const path = `/api/tickets${q.toString() ? '?' + q.toString() : ''}`;
      tickets.value = await api.get<Ticket[]>(path);
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      tickets.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function createTicket(input: CreateTicketInput): Promise<Ticket | null> {
    isLoading.value = true;
    error.value = null;
    try {
      // undefined を含むキーは送らない (apps/api 側で zod で弾かれるのを防ぐ)
      const body: Record<string, unknown> = { title: input.title };
      if (input.description !== undefined) body.description = input.description;
      if (input.status !== undefined) body.status = input.status;
      if (input.priority !== undefined) body.priority = input.priority;
      if (input.valueImpact !== undefined) body.valueImpact = input.valueImpact;
      if (input.ritual !== undefined) body.ritual = input.ritual;
      if (input.sprintId !== undefined) body.sprintId = input.sprintId;
      if (input.assigneeId !== undefined) body.assigneeId = input.assigneeId;
      if (input.estimatePt !== undefined) body.estimatePt = input.estimatePt;
      if (input.acceptanceCriteria !== undefined) body.acceptanceCriteria = input.acceptanceCriteria;
      if (input.labels !== undefined) body.labels = input.labels;
      if (input.type !== undefined) body.type = input.type;
      if (input.timeboxHours !== undefined) body.timeboxHours = input.timeboxHours;
      if (input.parentTicketId !== undefined) body.parentTicketId = input.parentTicketId;

      const created = await api.post<Ticket>('/api/tickets', body);
      // ローカルの tickets に追記 (再 fetch を避けて高速 UI 反映)
      tickets.value = [...tickets.value, created];
      return created;
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /** 部分更新。成功時はローカル tickets を楽観更新してサーバ結果で置換する。 */
  async function patchTicket(id: string, patch: PatchTicketInput): Promise<Ticket | null> {
    error.value = null;
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) body[k] = v;
      }
      const updated = await api.patch<Ticket>(`/api/tickets/${id}`, body);
      tickets.value = tickets.value.map((t) => (t.id === id ? updated : t));
      return updated;
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      return null;
    }
  }

  /** ステータス遷移 (専用 endpoint。サーバが startedAt/completedAt を自動スタンプ)。
   *  API は { from, to, ticket } を返すため res.ticket で置換する。
   */
  async function changeStatus(id: string, status: Status): Promise<Ticket | null> {
    error.value = null;
    // 楽観更新 (ボード移動を即時反映)
    const prev = tickets.value;
    tickets.value = tickets.value.map((t) => (t.id === id ? { ...t, status } : t));
    try {
      const res = await api.patch<{ from: Status; to: Status; ticket: Ticket }>(
        `/api/tickets/${id}/status`,
        { status },
      );
      tickets.value = tickets.value.map((t) => (t.id === id ? res.ticket : t));
      return res.ticket;
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      tickets.value = prev; // ロールバック
      return null;
    }
  }

  /** 削除。成功時はローカル tickets から除去する。 */
  async function deleteTicket(id: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete<Ticket>(`/api/tickets/${id}`);
      tickets.value = tickets.value.filter((t) => t.id !== id);
      return true;
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      return false;
    }
  }

  return { tickets, isLoading, error, fetchTickets, createTicket, patchTicket, changeStatus, deleteTicket };
};
