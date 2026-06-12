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
import { planInviteBind } from '../config/invite-bind';

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
/**
 * workspace 解決を skip するルート (method + path 完全一致)。
 *
 * 「所属 Workspace ゼロでも呼べる」必要があるルートをここで通す。auth は通った後なので
 * ctx.user は載っている。これにより invitation_required で新規ユーザーが Workspace を
 * 1 つも作れずロックされる詰みを解消する (createWorkspace / listMyWorkspaces)。
 *
 * 注意: ここを skip したルートのハンドラは c.get('workspaceId') / c.get('role') を
 * 参照してはいけない (set されないため undefined)。ctx.user のみ使うこと。
 */
const WORKSPACE_RESOLUTION_SKIP: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/workspaces' },
  { method: 'POST', path: '/api/workspaces' },
];

export function workspaceMiddleware(repo: RepoContainer): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as AuthenticatedUser | undefined;
    if (!user) {
      // authMiddleware が先に走ってない (実装ミス) → 500
      return c.json({ error: 'auth_middleware_not_applied' }, 500);
    }

    // 所属 Workspace ゼロでも呼べるルートは workspace 解決を skip (auth は通過済)。
    if (WORKSPACE_RESOLUTION_SKIP.some((r) => r.method === c.req.method && r.path === c.req.path)) {
      await next();
      return;
    }

    let memberships = await repo.members.listByUserId(user.userId);

    // 招待 bind: uid で Member が無い = まだどの ws にも実 uid で加入していない。
    // email 一致の招待センチネル (`invite:<workspaceId>:<email>`) を実 uid に bind する
    // (旧センチネル doc 削除 + 実 uid doc 作成)。複数 ws への招待は全部 bind する。
    if (memberships.length === 0) {
      const byEmail = await repo.members.listByEmail(user.email);
      const bound: typeof memberships = [];
      // 同じ email を持つ全候補について、招待センチネルを 1 件ずつ bind する。
      for (const sentinel of byEmail) {
        const plan = planInviteBind(user.userId, user.email, [sentinel]);
        if (!plan) continue;
        await repo.members.upsert(plan.bound);
        // 旧センチネル doc を複合キー (workspaceId, sentinel userId) で削除。
        // bound は同 workspaceId + 実 uid なので別 doc になり、衝突しない。
        await repo.members.delete(plan.sentinel.workspaceId, plan.sentinel.userId);
        bound.push(plan.bound);
        console.log(
          `[workspace] invite bound: ${user.email} → ${plan.bound.workspaceId} (${plan.bound.role})`,
        );
      }
      if (bound.length > 0) memberships = bound;
    }

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
