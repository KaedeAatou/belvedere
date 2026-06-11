// 招待 → 初回ログイン bind の純粋ロジック (Phase 1-E / 2026-06-12)。
//
// 招待は Member doc を userId=`invite:<workspaceId>:<email>` のセンチネルで事前作成する
// (workspace-handlers の inviteMember)。招待された人が初めてログインすると Firebase uid が
// 割り振られるが、その uid では Member が見つからない。そこで email 一致 + センチネルの
// Member を探し、userId を実 uid に bind する (旧センチネル doc を削除 + 実 uid doc を作成)。
//
// doc id に workspaceId を含めるのは、同 email を複数 Workspace が招待しても doc id が
// 衝突しない (上書きされない) ようにするため。bind は email でセンチネル群を引いて行う。
//
// この純粋関数は副作用なし (DB write しない)。呼び出し側 (workspaceMiddleware) が
// 返り値の plan に従って repo.members.delete + upsert を実行する。

import type { Member } from '@belvedere/shared';

/** 招待センチネルの userId 接頭辞。`invite:<workspaceId>:<email>` 形式。 */
export const INVITE_SENTINEL_PREFIX = 'invite:';

/** workspaceId + email から招待センチネルの doc id (= userId) を作る。 */
export function inviteSentinelId(workspaceId: string, email: string): string {
  return `${INVITE_SENTINEL_PREFIX}${workspaceId}:${email.toLowerCase()}`;
}

/** Member が招待センチネル (未 bind の招待) かどうか。 */
export function isInviteSentinel(m: Pick<Member, 'userId'>): boolean {
  return m.userId.startsWith(INVITE_SENTINEL_PREFIX);
}

/**
 * 招待 bind の計画を立てる純粋関数。
 *
 * @param uid     ログインしたユーザの実 Firebase uid
 * @param email   ログインしたユーザの email (Firebase 検証済)
 * @param candidates email 一致で引いた Member 候補 (招待センチネル + 既存メンバー混在しうる)
 * @returns bind すべき招待センチネルがあれば { sentinel(削除対象), bound(新規作成する実 uid Member) }、
 *          無ければ null (既にメンバー / 招待なし → 何もしない)
 *
 * 不変条件:
 * - 既に実 uid の Member が存在する候補 (= 既存メンバー) は bind しない (null)
 * - email 大文字小文字は正規化して突合する (招待時 lowercase 化と揃える)
 */
export function planInviteBind(
  uid: string,
  email: string,
  candidates: Member[],
): { sentinel: Member; bound: Member } | null {
  const normalized = email.toLowerCase();

  // 既に実 uid (センチネルでない) の Member が居れば bind 不要。
  const alreadyMember = candidates.some(
    (m) => !isInviteSentinel(m) && m.email.toLowerCase() === normalized && m.userId === uid,
  );
  if (alreadyMember) return null;

  // email 一致の招待センチネルを探す (最初の 1 件)。
  const sentinel = candidates.find(
    (m) => isInviteSentinel(m) && m.email.toLowerCase() === normalized,
  );
  if (!sentinel) return null;

  const bound: Member = { ...sentinel, userId: uid };
  return { sentinel, bound };
}
