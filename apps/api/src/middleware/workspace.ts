// Phase 1-B Workspace 解決ミドルウェア (2026-06-10)。
// authMiddleware で確定した req.user.userId から、その人が member として登録されている
// Workspace を探し出し、最初の 1 件 (将来は X-Workspace-Id ヘッダで切替可) を current に set する。
// member ゼロ件は 403 (invitation_required) で弾く = 招待制 SaaS の入口防衛。

import type { MiddlewareHandler } from 'hono';
import type { RepoContainer } from '@belvedere/repo';
import type { AuthenticatedUser } from './auth';

export interface WorkspaceContext {
  workspaceId: string;
  role: 'owner' | 'sm' | 'po' | 'dev' | 'guest';
}

/**
 * RepoContainer を closure で受け取って Hono ミドルウェアを返す factory。
 * authMiddleware の後に呼ばれることが前提。c.get('user') が無いと 500。
 *
 * 動作:
 *   1. c.get('user').userId で repo.members.list() ... を呼び userId フィルタ
 *      (現状の MemberRepository は { userId } 引数を取らないので、全件取得→filter で代替)
 *   2. 0 件 → 403 { error: 'invitation_required', email }
 *   3. 1 件以上 → X-Workspace-Id ヘッダで指定があればそれ、無ければ 1 件目を current に
 *
 * 将来拡張: Member.list({ userId }) シグネチャ追加、複数 Workspace 所属時の選択 UI 連動
 */
export function workspaceMiddleware(repo: RepoContainer): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as AuthenticatedUser | undefined;
    if (!user) {
      // authMiddleware が先に走ってない (実装ミス) → 500
      return c.json({ error: 'auth_middleware_not_applied' }, 500);
    }

    // 現状の MemberRepository は list() で全件返すので、ここで userId フィルタする。
    // Phase 1-B 認証完了後に Member.list({ userId }) シグネチャ拡張を検討。
    const allMembers = await repo.members.list();
    const memberships = allMembers.filter((m) => m.userId === user.userId);

    if (memberships.length === 0) {
      return c.json(
        {
          error: 'invitation_required',
          email: user.email,
          hint: 'Workspace owner にメンバ追加を依頼してください',
        },
        403,
      );
    }

    // X-Workspace-Id ヘッダで指定があればそれを、無ければ 1 件目を current に
    const requestedWorkspaceId = c.req.header('X-Workspace-Id');
    const selected = requestedWorkspaceId
      ? memberships.find((m) => m.workspaceId === requestedWorkspaceId)
      : memberships[0];

    if (!selected) {
      // X-Workspace-Id が指定されたが、その workspace に未所属
      return c.json({ error: 'workspace_not_accessible', requestedWorkspaceId }, 403);
    }

    c.set('workspaceId', selected.workspaceId);
    c.set('role', selected.role);
    await next();
    return;
  };
}
