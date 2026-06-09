// Phase 1-B Workspace 解決ミドルウェア (2026-06-10)。
// authMiddleware で確定した req.user.userId から、その人が member として登録されている
// Workspace を探し出し、最初の 1 件 (将来は X-Workspace-Id ヘッダで切替可) を current に set する。
// member ゼロ件は 403 (invitation_required) で弾く = 招待制 SaaS の入口防衛。
//
// Phase 1-B 拡張 (2026-06-10): email allowlist による初回 owner 自動登録
// (config/email-allowlist.ts 参照)。allowlist 該当者は最初のリクエストで
// 自動的に Workspace の owner として members に upsert される。

import type { MiddlewareHandler } from 'hono';
import type { RepoContainer } from '@belvedere/repo';
import type { AuthenticatedUser } from './auth';
import { buildMemberFromAllowlist } from '../config/email-allowlist';

export interface WorkspaceContext {
  workspaceId: string;
  role: 'owner' | 'sm' | 'po' | 'dev' | 'guest';
}

/**
 * RepoContainer を closure で受け取って Hono ミドルウェアを返す factory。
 * authMiddleware の後に呼ばれることが前提。c.get('user') が無いと 500。
 *
 * 動作:
 *   1. c.get('user').userId で repo.members.listByUserId を呼ぶ
 *   2. 0 件 → email allowlist 確認:
 *      - 該当あり → repo.members.upsert で自動作成 (初回 owner ブートストラップ)
 *      - 該当なし → 403 invitation_required
 *   3. 1 件以上 → X-Workspace-Id ヘッダで指定があればそれ、無ければ 1 件目を current に
 *
 * 将来拡張: 複数 Workspace 所属時の選択 UI 連動、role 動的変更
 */
export function workspaceMiddleware(repo: RepoContainer): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as AuthenticatedUser | undefined;
    if (!user) {
      // authMiddleware が先に走ってない (実装ミス) → 500
      return c.json({ error: 'auth_middleware_not_applied' }, 500);
    }

    let memberships = await repo.members.listByUserId(user.userId);

    // ブートストラップ: email allowlist 該当者は初回ログイン時に自動登録
    if (memberships.length === 0) {
      const bootstrapped = buildMemberFromAllowlist(user.userId, user.email);
      if (bootstrapped) {
        await repo.members.upsert(bootstrapped);
        memberships = [bootstrapped];
        console.log(
          `[workspace] bootstrapped member: ${user.email} → ${bootstrapped.workspaceId} (${bootstrapped.role})`,
        );
      }
    }

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
