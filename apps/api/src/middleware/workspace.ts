// Phase 1-B Workspace 解決ミドルウェア (2026-06-10)。
// authMiddleware で確定した req.user.userId から、その人が member として登録されている
// Workspace を探し出し、最初の 1 件 (将来は X-Workspace-Id ヘッダで切替可) を current に set する。
// member ゼロ件は 403 で弾く = 招待制 SaaS の入口防衛 (allowlist 該当なら needs_workspace で
// onboarding 誘導、非該当なら invitation_required)。
//
// Phase 1-B 拡張 (2026-06-10): email allowlist による初回メンバー自動登録
// (config/email-allowlist.ts 参照)。allowlist の assign 該当者は最初のリクエストで
// 自動的に Workspace の member として upsert される (role は allowlist で指定 / 本人は admin)。

import type { MiddlewareHandler } from 'hono';
import type { RepoContainer } from '@belvedere/repo';
import type { WorkspaceRole } from '@belvedere/shared';
import type { AuthenticatedUser } from './auth';
import { buildMemberFromAllowlist, isLoginAllowed } from '../config/email-allowlist';
import { planInviteBind } from '../config/invite-bind';
import { normalizeRole } from '../permissions';

export interface WorkspaceContext {
  workspaceId: string;
  /** normalize 済の正準ロール (owner→admin / guest→dev は normalizeRole で変換済)。 */
  role: WorkspaceRole;
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
      // ログイン許可済 (allowlist の login-only / assign 該当だが bootstrap 不能だった) で所属ゼロ
      // → needs_workspace。web はこれを受けて onboarding (自分の Workspace を作る画面) へ誘導する。
      if (isLoginAllowed(user.email)) {
        return c.json(
          {
            error: 'needs_workspace',
            email: user.email,
            hint: '自分の Workspace を作成してください (/settings/profile?onboard=1)',
          },
          403,
        );
      }
      // 全くの未招待 → 招待制 SaaS の入口防衛。
      return c.json(
        {
          error: 'invitation_required',
          email: user.email,
          hint: 'Workspace 管理者にメンバ追加を依頼してください',
        },
        403,
      );
    }

    // API キー認証時は発行元 workspace に固定する (ユーザ×ワークスペース scope)。
    // authMiddleware が c.set('apiKeyWorkspaceId') を載せている時は X-Workspace-Id を無視し、
    // そのキーの workspace のメンバーシップだけを current にする (横断不可 = 漏洩時の影響を限定)。
    // 人間の Firebase ログインはこの値を持たないので、従来通り X-Workspace-Id / 既定で切替できる。
    const apiKeyWorkspaceId = c.get('apiKeyWorkspaceId') as string | undefined;
    let selected;
    if (apiKeyWorkspaceId !== undefined) {
      selected = memberships.find((m) => m.workspaceId === apiKeyWorkspaceId);
      if (!selected) {
        // キーの workspace から脱退済み等 → アクセス不可 (キーは横断できない)。
        return c.json({ error: 'workspace_not_accessible', requestedWorkspaceId: apiKeyWorkspaceId }, 403);
      }
    } else {
      // X-Workspace-Id ヘッダで指定があればそれを、無ければ既定の Workspace を current に。
      // 既定は workspaceId 昇順で安定ソートした先頭にする (= 決定的)。
      // listByUserId の返り順は Firestore のクエリ順で非決定的なため、複数 Workspace 所属時に
      // リクエストごと / 環境ごとに既定がブレる潜在バグがあった (実害: 所属 2 件化で既定が
      // 別 ws に飛び e2e が落ちた)。ユーザーの実際の選択は web の localStorage →
      // X-Workspace-Id で送られるので、ここはコールドスタートの安定既定として機能すれば良い。
      const requestedWorkspaceId = c.req.header('X-Workspace-Id');
      selected = requestedWorkspaceId
        ? memberships.find((m) => m.workspaceId === requestedWorkspaceId)
        : [...memberships].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))[0];

      if (!selected) {
        // X-Workspace-Id が指定されたが、その workspace に未所属
        return c.json({ error: 'workspace_not_accessible', requestedWorkspaceId }, 403);
      }
    }

    c.set('workspaceId', selected.workspaceId);
    // 永続値 (owner/guest を含みうる) を正準 4 値に正規化してから ctx に載せる。
    // 以降 handler が見る ctx.role は admin/po/sm/dev のいずれか。
    c.set('role', normalizeRole(selected.role));
    await next();
    return;
  };
}
