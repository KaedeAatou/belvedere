// Workspace 一覧取得 + 作成 + 切替 composable (Phase 1-E 前倒し / 2026-06-12)。
// a社/b社単位の管理者画面、c社を 0 から作るための入口。
//
// currentId は localStorage に永続化し (key 'belvedere.workspaceId')、useApiClient が
// 全リクエストに X-Workspace-Id ヘッダとして付与する。切替時は location.reload() で
// 全 composable (useTickets / useSprints / useMembers ...) の再取得を簡潔に保証する。

/** GET /api/workspaces のレスポンス要素 (workspace-handlers.ts の MyWorkspace と一致)。 */
export interface MyWorkspace {
  id: string;
  name: string;
  // 正準 role (admin/po/sm/dev)。旧 owner/guest は migration 済で廃止 (2026-06-23)。
  role: 'admin' | 'po' | 'sm' | 'dev';
  /** Product Goal (WC-23)。Home で編集し Planning が参照する。 */
  productGoal: string;
}

/** localStorage key (useApiClient と共有)。 */
export const WORKSPACE_ID_KEY = 'belvedere.workspaceId';

export const useWorkspaces = () => {
  const workspaces = useState<MyWorkspace[]>('workspaces', () => []);
  const isLoading = useState<boolean>('workspaces-loading', () => false);
  const error = useState<string | null>('workspaces-error', () => null);
  // currentId は SSR では localStorage を読めないので空、クライアントで mount 時に同期する。
  const currentId = useState<string | null>('workspace-current-id', () => null);

  const api = useApiClient();

  /** localStorage から currentId を復元 (クライアントのみ)。 */
  function syncCurrentFromStorage(): void {
    if (import.meta.client) {
      currentId.value = window.localStorage.getItem(WORKSPACE_ID_KEY);
    }
  }

  async function fetch(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      workspaces.value = await api.get<MyWorkspace[]>('/api/workspaces');
      // currentId が未設定 or 所属外なら 1 件目に寄せる (壊れた localStorage の自己修復)。
      const ids = new Set(workspaces.value.map((w) => w.id));
      if ((!currentId.value || !ids.has(currentId.value)) && workspaces.value.length > 0) {
        setCurrent(workspaces.value[0]!.id, { reload: false });
      }
    } catch (e) {
      error.value = apiErrorMessage(e);
      workspaces.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /** Workspace を作成し、作成した ws に切替える (reload で全 composable 再取得)。 */
  async function create(name: string, productGoal?: string): Promise<MyWorkspace | null> {
    error.value = null;
    try {
      const res = await api.post<{ workspace: { id: string; name: string; productGoal?: string }; member: { role: MyWorkspace['role'] } }>(
        '/api/workspaces',
        { name, ...(productGoal ? { productGoal } : {}) },
      );
      const created: MyWorkspace = { id: res.workspace.id, name: res.workspace.name, role: res.member.role, productGoal: res.workspace.productGoal ?? productGoal ?? '' };
      workspaces.value = [...workspaces.value, created];
      setCurrent(created.id); // reload して新 ws に入る
      return created;
    } catch (e) {
      error.value = apiErrorMessage(e);
      return null;
    }
  }

  /** 現在の Workspace (currentId に一致する MyWorkspace)。未解決なら null。 */
  const current = computed<MyWorkspace | null>(
    () => workspaces.value.find((w) => w.id === currentId.value) ?? null,
  );

  /** Product Goal を更新 (PATCH /api/workspaces/:id) しローカルにも反映 (WC-23)。 */
  async function updateProductGoal(productGoal: string): Promise<boolean> {
    if (!currentId.value) return false;
    error.value = null;
    try {
      const updated = await api.patch<{ id: string; productGoal: string }>(
        `/api/workspaces/${currentId.value}`,
        { productGoal },
      );
      workspaces.value = workspaces.value.map((w) =>
        w.id === updated.id ? { ...w, productGoal: updated.productGoal } : w,
      );
      return true;
    } catch (e) {
      error.value = apiErrorMessage(e);
      return false;
    }
  }

  /**
   * current Workspace を切替える。localStorage に永続化し、reload で全画面を再取得する。
   * @param opts.reload false で reload を抑止 (初期同期など、すでに正しい ws で表示中のとき)。
   */
  function setCurrent(id: string, opts: { reload?: boolean } = {}): void {
    currentId.value = id;
    if (import.meta.client) {
      window.localStorage.setItem(WORKSPACE_ID_KEY, id);
      if (opts.reload !== false) window.location.reload();
    }
  }

  return { workspaces, current, currentId, isLoading, error, fetch, create, updateProductGoal, setCurrent, syncCurrentFromStorage };
};
