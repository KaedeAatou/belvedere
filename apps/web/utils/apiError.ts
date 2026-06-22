// API エラーから「画面にそのまま出せる」メッセージを取り出す共有ユーティリティ (2026-06-23)。
//
// API の 4xx は body に { error, ... } を返す。権限拒否 (403) は forbidden() が
// { error: 'forbidden', action, requiredRoles, message } を返すので、人間向けの message を
// 最優先で拾う (「forbidden」だけ出す不親切さを解消)。message が無いエラーは error コード →
// $fetch の message の順でフォールバックする。
//
// Nuxt の utils/ は auto-import 対象なので、各 composable / page から `apiErrorMessage(e)` で使える。

export interface ApiErrorBody {
  error?: string;
  /** forbidden() 由来の人間向け理由文 (例: 「バックログの並び替えは PO・管理者のみが行えます。」)。 */
  message?: string;
  /** forbidden() 由来。弾かれた操作 (機械可読)。 */
  action?: string;
  /** forbidden() 由来。この操作を実行できるロール。 */
  requiredRoles?: string[];
}

/** $fetch / ofetch が throw する FetchError 形 (data に API の JSON body が入る)。 */
interface FetchErrorLike {
  data?: ApiErrorBody;
  message?: string;
}

/**
 * 画面表示用のエラーメッセージを 1 本に正規化する。
 * 優先順位: forbidden 等の人間向け message > error コード > fetch の message > 'unknown error'。
 */
export function apiErrorMessage(e: unknown): string {
  const err = e as FetchErrorLike;
  return err?.data?.message ?? err?.data?.error ?? err?.message ?? 'unknown error';
}
