// Email allowlist による初回 owner 自動登録 (Phase 1-B / 2026-06-10)。
//
// Firebase Auth で初めてログインしたユーザーは Firebase UID (例: 'abc123xyz') を持つが、
// Belvedere の members コレクションには存在しない。何もしないと workspaceMiddleware が
// 403 invitation_required を返して全機能ロックされる。
//
// この allowlist は「このメアドで初回ログインした人は自動で指定 Workspace の指定 role に登録」
// する仕組み。具体的には:
//   - owner@example.com (Kaede 個人) → ws-belvedere の owner として自動作成
//
// 招待制 SaaS のセキュリティ境界はあくまで members コレクション側 (この後 Phase 1-E で
// 招待 UI から自由に追加可能になる)。allowlist はブートストラップ専用、定常運用では使わない。
//
// 注意: 環境変数で上書きできるようにするより、ハードコードの方が PR レビューで「誰が
// owner になるか」が見える化される利点がある。会社メアドを混入させない歯止めにもなる。

export interface AllowlistEntry {
  workspaceId: string;
  role: 'owner' | 'sm' | 'po' | 'dev' | 'guest';
  displayName: string;
}

export const emailAllowlist: Record<string, AllowlistEntry> = {
  'owner@example.com': {
    workspaceId: 'ws-belvedere',
    role: 'owner',
    displayName: 'Kaede',
  },
};

/**
 * email allowlist を引いて、登録対象なら新規 Member を生成する純粋関数。
 * 副作用なし (DB write はしない)。呼び出し側で repo.members.upsert に渡す。
 *
 * @returns 登録対象なら新 Member、対象外なら null
 */
export function buildMemberFromAllowlist(
  userId: string,
  email: string,
): import('@belvedere/shared').Member | null {
  const entry = emailAllowlist[email];
  if (!entry) return null;
  return {
    userId,
    workspaceId: entry.workspaceId,
    email,
    displayName: entry.displayName,
    role: entry.role,
  };
}
