// Workspace メンバー取得用 composable (Phase 1-C / R3 / 2026-06-11)。
// GET /api/members で取得して useState で reactive に共有する。
// 旧 demo の TEAM (u1-u6) を置き換える単一 source。Avatar / assignee 表示に使う。
//
// 使い方:
//   const { members, fetchMembers, memberName } = useMembers();
//   onMounted(() => fetchMembers());
//   memberName(ticket.assigneeId);  // displayName を引く

import type { Member } from '@belvedere/shared';

export const useMembers = () => {
  const members = useState<Member[]>('members', () => []);
  const isLoading = useState<boolean>('members-loading', () => false);
  const error = useState<string | null>('members-error', () => null);

  const api = useApiClient();

  async function fetchMembers(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      members.value = await api.get<Member[]>('/api/members');
    } catch (e) {
      error.value = apiErrorMessage(e);
      members.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  function memberById(userId?: string | null): Member | undefined {
    if (!userId) return undefined;
    return members.value.find((m) => m.userId === userId);
  }

  /** assignee 表示名。未割当や未取得時はフォールバック文字列を返す。 */
  function memberName(userId?: string | null): string {
    if (!userId) return '未割当';
    return memberById(userId)?.displayName ?? userId;
  }

  /** Avatar の頭文字 (displayName の先頭 1 文字)。 */
  function memberInitial(userId?: string | null): string {
    const name = memberById(userId)?.displayName ?? userId ?? '';
    return name.charAt(0).toUpperCase();
  }

  /** 招待中 (まだ実 uid に bind されていない) センチネルかどうか。userId が 'invite:' 始まり。 */
  function isPendingInvite(m: Member): boolean {
    return m.userId.startsWith('invite:');
  }

  /** メンバーを招待する (admin/po/sm のみ。付与できる role は po/sm/dev。失敗時は throw)。成功後に一覧を再取得。 */
  async function invite(email: string, role: 'po' | 'sm' | 'dev', displayName?: string): Promise<void> {
    await api.post<Member>('/api/workspaces/members/invite', {
      email,
      role,
      ...(displayName ? { displayName } : {}),
    });
    await fetchMembers();
  }

  /** 招待を取消す (招待センチネルのみ)。成功後に一覧を再取得。 */
  async function cancelInvite(userId: string): Promise<void> {
    await api.delete(`/api/workspaces/members/${encodeURIComponent(userId)}`);
    await fetchMembers();
  }

  return {
    members, isLoading, error, fetchMembers, memberById, memberName, memberInitial,
    isPendingInvite, invite, cancelInvite,
  };
};
