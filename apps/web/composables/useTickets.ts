// 実 API データ用の Ticket composable (Phase 1-C / 2026-06-11)。
// useDemoData (demo 用) と並行運用、Phase 1-C 後半で demo data を完全廃止予定。
//
// 使い方:
//   const { tickets, isLoading, error, fetchTickets, createTicket } = useTickets();
//   onMounted(() => fetchTickets());
//   await createTicket({ title: '新規' });

import type { Ticket, Status, Priority, ValueImpact, Ritual } from '@belvedere/shared';

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

  return { tickets, isLoading, error, fetchTickets, createTicket };
};
