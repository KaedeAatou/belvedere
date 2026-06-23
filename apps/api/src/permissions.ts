// workspace 内の権限判定 (2026-06-23 再設計 / 権限の単一ソース)。
//
// 役割モデル:
//   - admin: その workspace の全権者 (作成者 = なんでもできる)。全 action を bypass。
//   - po/sm/dev: スクラム役割。下記 MATRIX で操作ごとに分担。
//   - (workspace の外) owner = プラットフォーム全体で「人を招待する」だけの本人。
//     これは member role ではない (config/email-allowlist.ts の PLATFORM_OWNER)。
//
// 設計: 各 handler に散っていた PRIVILEGED 配列をここ 1 箇所に集約し、純粋関数 can() で判定する。
// repo 非依存・副作用なし → permissions.test.ts で (action × role) 全組合せを直接テストできる。
// この MATRIX が README / DATA_MODEL の権限表の単一ソース (ドリフトしたら表も直す)。

import type { WorkspaceRole } from '@belvedere/shared';

/** 権限ゲートのかかる操作。新しいゲートを足すときはここに追加し MATRIX を埋める。 */
export type Action =
  | 'member.invite' // ws 内のメンバー招待・取消
  | 'backlog.reorder' // バックログ並び替え (優先順位)
  | 'epic.write' // Epic/Story の作成・価値/優先度設定
  | 'sprint.goal' // Sprint Goal 設定 (patchSprint)
  | 'sprint.manage' // Sprint 作成/開始/終了
  | 'estimation.facilitate' // 見積もり 開始/開示
  | 'estimation.vote' // 見積もりに投票
  | 'estimation.adopt' // 見積もり採用 (確定)
  | 'ticket.write' // Ticket CRUD・分解
  | 'agent.invoke'; // AI Agent 実行 (5 儀式)

/**
 * po/sm/dev の許可表。admin は can() の先頭で全 bypass するため、ここには列挙しない。
 * Record の網羅キー (Action 全列挙) なので index アクセスは undefined にならない。
 */
const MATRIX: Record<Action, ReadonlyArray<Exclude<WorkspaceRole, 'admin'>>> = {
  'member.invite': ['po', 'sm'],
  'backlog.reorder': ['po'],
  'epic.write': ['po'],
  'sprint.goal': ['po', 'sm'],
  'sprint.manage': ['sm'],
  'estimation.facilitate': ['sm'],
  'estimation.vote': ['dev'],
  'estimation.adopt': ['sm', 'dev'],
  'ticket.write': ['po', 'sm', 'dev'],
  'agent.invoke': ['po', 'sm', 'dev'],
};

/**
 * action を ctx の role が実行できるか。
 * - admin: 常に true (全権)。
 * - role 未確定 (undefined): 常に false (workspace 未解決のリクエストは弾く)。
 * - po/sm/dev: MATRIX 照合。
 */
export function can(action: Action, ctx: { role?: WorkspaceRole }): boolean {
  if (ctx.role === 'admin') return true;
  if (ctx.role === undefined) return false;
  // ここで ctx.role は 'po' | 'sm' | 'dev' に narrowing される。
  return MATRIX[action].includes(ctx.role);
}

/**
 * 永続化された生 role 値を、handler が使う正準 WorkspaceRole に正規化する。
 * 旧 'owner' は作成者 = 全権だったので admin に、'guest' は最小権限なので dev に読み替える。
 * seed (immutable / owner を含む) と本番 Firestore の既存 doc を、migration 前でも正しく
 * 動かすための実行時グランドファーザリング。未知の値は安全側の dev に倒す。
 */
export function normalizeRole(raw: string): WorkspaceRole {
  if (raw === 'owner') return 'admin';
  if (raw === 'guest') return 'dev';
  if (raw === 'po' || raw === 'sm' || raw === 'dev' || raw === 'admin') return raw;
  return 'dev';
}

/**
 * action を実行できるロール一覧 (admin は常に含む = 全 bypass)。
 * MATRIX から導出するので表とドリフトしない。UI のボタン活性判定 / エラー表示に使う。
 */
export function rolesFor(action: Action): WorkspaceRole[] {
  return ['admin', ...MATRIX[action]];
}

/**
 * 各 action を拒否したときにユーザーへ見せる日本語の理由文 (なぜ弾かれたか + 誰なら可能か)。
 * 「forbidden」だけだと審査員・ドッグフード相手に不親切なので、操作名と必要ロールを明示する。
 * 文面は rolesFor() の結果と一致させる (ロール表記: 管理者=admin / PO / SM / 開発者=dev)。
 */
const FORBIDDEN_MESSAGE: Record<Action, string> = {
  'member.invite': 'メンバーの招待は PO・SM・管理者のみが行えます。',
  'backlog.reorder': 'バックログの並び替え (優先順位付け) は PO・管理者のみが行えます。',
  'epic.write': 'Epic / Story の価値・優先度の編集は PO・管理者のみが行えます。',
  'sprint.goal': 'スプリントゴール・期間の編集は PO・SM・管理者のみが行えます。',
  'sprint.manage': 'スプリントの作成・開始・終了は SM・管理者のみが行えます。',
  'estimation.facilitate': '見積もりの開始・開示は SM・管理者のみが行えます。',
  'estimation.vote': '見積もりへの投票は開発者 (Dev)・管理者のみが行えます。',
  'estimation.adopt': '見積もりの採用 (確定) は SM・開発者 (Dev)・管理者のみが行えます。',
  // ticket.write / agent.invoke は admin/po/sm/dev 全ロール許可。can() が false を返すのは role 未確定
  // (= Workspace 未解決) のときだけなので、メッセージもそれを正確に伝える (旧「全メンバーに許可〜」は矛盾的だった)。
  'ticket.write': 'チケットの操作には Workspace への所属 (ロールの確定) が必要です。',
  'agent.invoke': 'AI エージェントの実行には Workspace への所属 (ロールの確定) が必要です。',
};

/** 403 レスポンス body の構造化された形。respond() がそのまま JSON 化し、web がトーストで message を出す。 */
export interface ForbiddenBody {
  error: 'forbidden';
  /** 弾かれた操作 (機械可読 / フロントの分岐や i18n の足場)。 */
  action: Action;
  /** この操作を実行できるロール (admin を含む)。UI の「誰なら可能か」表示に使う。 */
  requiredRoles: WorkspaceRole[];
  /** そのまま画面に出せる日本語の理由文。 */
  message: string;
}

/**
 * 権限ゲートで弾いた時の 403 body を組み立てる。handler は
 * `return { ok: false, status: 403, body: forbidden(action) }` で使う。
 * message / requiredRoles を MATRIX 由来で埋めるので「forbidden だけ」の不親切さを解消する。
 */
export function forbidden(action: Action): ForbiddenBody {
  return {
    error: 'forbidden',
    action,
    requiredRoles: rolesFor(action),
    message: FORBIDDEN_MESSAGE[action],
  };
}
