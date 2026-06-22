// Email allowlist による初回ログインのブートストラップ (Phase 1-B / 2026-06-10、権限再設計 2026-06-23)。
//
// Firebase Auth で初めてログインしたユーザーは Firebase UID (例: 'abc123xyz') を持つが、
// Belvedere の members コレクションには存在しない。何もしないと workspaceMiddleware が
// 403 invitation_required を返して全機能ロックされる。
//
// この allowlist は 2 モードを持つ (2026-06-23 ドッグフード再設計):
//   - mode 'assign'     : 「このメアドで初回ログインした人を指定 Workspace の指定 role に自動登録」
//                         (固定 ws-belvedere の本人 / MCP / e2e / 審査員デモ)。
//   - mode 'login-only' : 「ログインは許可するが Workspace は割り当てない」。所属ゼロのまま
//                         workspaceMiddleware が 403 needs_workspace を返し、web が onboarding
//                         (自分の Workspace を作る画面) へ誘導する。owner が人を招待する最小手段。
//
// プラットフォーム全体の「人を招待する owner」(= 本人) は、ここに login-only エントリを足すこと
// =「ログイン許可の発行」になる (owner 専用招待 UI は提出後 / .claude plan 参照)。
//
// 招待制 SaaS のセキュリティ境界はあくまで members コレクション + この allowlist。
// 注意: 環境変数で上書きするより、ハードコードの方が PR レビューで「誰が入れるか」が見える化される
// 利点がある。会社メアドを混入させない歯止めにもなる (個人参加要件)。

import type { Member, WorkspaceRole } from '@belvedere/shared';
import { MCP_SERVICE_EMAIL } from './service-token';

/**
 * allowlist の 1 エントリ。
 * - assign: workspace と role を割り当てて Member を自動作成する。
 * - login-only: ログイン許可だけ (Member は作らない → needs_workspace → onboarding)。
 */
export type AllowlistEntry =
  | { mode: 'assign'; workspaceId: string; role: WorkspaceRole; displayName: string }
  | { mode: 'login-only'; displayName: string };

export const emailAllowlist: Record<string, AllowlistEntry> = {
  // 本人 (Kaede 個人) は固定 ws-belvedere の admin (= 自分の部屋で全権 / 旧 owner → 正準 admin)。
  'owner@example.com': {
    mode: 'assign',
    workspaceId: 'ws-belvedere',
    role: 'admin',
    displayName: 'Kaede',
  },
  // MCP サービスプリンシパル (機械認証パス / 2026-06-17): service token で認証された
  // Claude Code 経由の MCP は ws-belvedere の po member として動く (admin ではない:
  // member 招待は可だが workspace 全権 bypass は持たない)。識別子は service-token.ts が単一ソース。
  [MCP_SERVICE_EMAIL]: {
    mode: 'assign',
    workspaceId: 'ws-belvedere',
    role: 'po',
    displayName: 'MCP Service',
  },
  // e2e robot user (Stage 2 / 2026-06-11): 専用 workspace ws-e2e-test の admin として
  // 本番 ws-belvedere を汚さずに CRUD 動作確認。自分の部屋の作成者 = admin。
  'robot-e2e@belvedere.test': {
    mode: 'assign',
    workspaceId: 'ws-e2e-test',
    role: 'admin',
    displayName: 'E2E Robot',
  },
  // ハッカソン審査員用デモアカウント (2026-06-23): メール/パスワードで本番デモを触ってもらう共有
  // アカウント。role は admin: 固定 ws-belvedere (seed 12チケット) の上で全 5 儀式 + Agent を体験
  // できる (旧 dev では reorder / sprint 操作等が 403 で詰まり「形だけ」しか見せられなかった)。
  // リスク (審査員が seed を変更): seed 再投入スクリプト (scripts/seed-firestore-dev.ts) で戻せる。
  'demo@belvedere.demo': {
    mode: 'assign',
    workspaceId: 'ws-belvedere',
    role: 'admin',
    displayName: 'Hackathon Demo',
  },
  // login-only の動作確認用 e2e フィクスチャ (2026-06-23): ログインは許可されるが Workspace 未割当 →
  // needs_workspace → onboarding 誘導の経路を踏むためのもの。本番ユーザーの招待は owner がここに
  // login-only エントリを足すことで行う (この行が「招待」のテンプレートを兼ねる)。
  'onboard-e2e@belvedere.test': {
    mode: 'login-only',
    displayName: 'Onboarding E2E',
  },
};

/**
 * email allowlist を引いて、assign モードなら新規 Member を生成する純粋関数。
 * login-only / 非該当は null (Member を作らない)。副作用なし。呼び出し側で repo.members.upsert に渡す。
 *
 * @returns assign 該当なら新 Member、それ以外 (login-only / 非該当) は null
 */
export function buildMemberFromAllowlist(userId: string, email: string): Member | null {
  const entry = emailAllowlist[email];
  if (!entry || entry.mode !== 'assign') return null;
  return {
    userId,
    workspaceId: entry.workspaceId,
    email,
    displayName: entry.displayName,
    role: entry.role,
  };
}

/**
 * この email が「ログインを許可されている」か (assign / login-only どちらでも true)。
 * workspaceMiddleware が memberships ゼロ件のときに使う:
 *   - true  → 招待済だが所属 Workspace なし → 403 needs_workspace (onboarding へ誘導)
 *   - false → 全くの未招待 → 403 invitation_required
 * assign 該当者は bootstrap 済で memberships > 0 になるため、実際にこの分岐へ来るのは主に login-only。
 */
export function isLoginAllowed(email: string): boolean {
  return email in emailAllowlist;
}
