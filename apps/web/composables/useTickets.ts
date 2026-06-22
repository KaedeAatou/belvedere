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
  /** type==='story' の親 Epic (案A: story 作成時は必須)。incident/bug/task/spike では不要。 */
  epicId?: string;
  /** Review 儀式の指摘ノート (完成 increment への関係者フィードバックを対象チケット自体に残す)。 */
  reviewNotes?: string[];
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
  /** Review 儀式の指摘ノート。read→append した全配列を渡す (配列まるごと replace)。 */
  reviewNotes?: string[];
}

export const useTickets = () => {
  const tickets = useState<Ticket[]>('tickets', () => []);
  const isLoading = useState<boolean>('tickets-loading', () => false);
  const error = useState<string | null>('tickets-error', () => null);

  const api = useApiClient();
  // チケットを変更すると finding (ルールエンジン指摘) も古くなる。全 mutation 経路 — Daily の
  // status 変更 / 区画移動 / bulk / DetailSheet 編集 / 分割 — をここに集約し、findings の
  // invalidation を単一ソース化する (以前は呼び出し側で個別に refresh しており、changeStatus /
  // bulk / 区画移動の経路で呼び忘れて指摘ピルが stale になっていた)。
  const { refresh: refreshFindings } = useFindings();

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
      error.value = apiErrorMessage(e);
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
      if (input.epicId !== undefined) body.epicId = input.epicId;
      if (input.reviewNotes !== undefined) body.reviewNotes = input.reviewNotes;

      const created = await api.post<Ticket>('/api/tickets', body);
      // ローカルの tickets に追記 (再 fetch を避けて高速 UI 反映)
      tickets.value = [...tickets.value, created];
      void refreshFindings();
      return created;
    } catch (e) {
      error.value = apiErrorMessage(e);
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
      void refreshFindings();
      return updated;
    } catch (e) {
      error.value = apiErrorMessage(e);
      return null;
    }
  }

  /**
   * 区画 d&d 確定 — 区画全体を密再採番する (POST /api/tickets/reorder)。
   *
   * orderedIds に「その区画の全 id を新並び順で」渡すとサーバが orderIndex を (i+1)*1000 で
   * 振り直す。区画跨ぎ移動は movedId + sprintId を渡すと movedId 1 件だけ sprint を変える
   * (string=その sprint へ / null=未割当へ)。返ってきた区画チケットでローカルを置換する。
   *
   * 旧「近傍中点を 1 件 patch」方式は、区画内に orderIndex 未設定/等値が在ると先頭ジャンプや
   * 元位置復帰を起こしたため、区画全体の密再採番に統一した。
   */
  async function reorderTickets(input: {
    orderedIds: string[];
    movedId?: string;
    sprintId?: string | null;
  }): Promise<Ticket[] | null> {
    error.value = null;
    try {
      const body: Record<string, unknown> = { orderedIds: input.orderedIds };
      if (input.movedId !== undefined) body.movedId = input.movedId;
      // sprintId は null も意味を持つ (解除) ので undefined のときだけ送らない。
      if (input.sprintId !== undefined) body.sprintId = input.sprintId;
      const updated = await api.post<Ticket[]>('/api/tickets/reorder', body);
      const byId = new Map(updated.map((t) => [t.id, t]));
      tickets.value = tickets.value.map((t) => byId.get(t.id) ?? t);
      void refreshFindings();
      return updated;
    } catch (e) {
      error.value = apiErrorMessage(e);
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
      void refreshFindings();
      return res.ticket;
    } catch (e) {
      error.value = apiErrorMessage(e);
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
      void refreshFindings();
      return true;
    } catch (e) {
      error.value = apiErrorMessage(e);
      return false;
    }
  }

  return { tickets, isLoading, error, fetchTickets, createTicket, patchTicket, reorderTickets, changeStatus, deleteTicket };
};
