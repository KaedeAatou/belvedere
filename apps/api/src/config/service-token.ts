// MCP サービストークン認証 (機械認証パス / 2026-06-17)。
//
// 背景: apps/mcp-server は Claude Code から stdio で起動される非対話プロセスで、
// 人間のように Firebase (Google ログイン) で ID token を取得できない。一方で MCP を
// API の Firebase 認証層 / workspace-scope / IDOR ガードの「外」に置くと、せっかくの
// 認可境界を迂回する裏口になってしまう。
//
// そこで「高エントロピーのサービストークン」を 1 本だけ発行し (Secret Manager で管理)、
// MCP → API のリクエストはこのトークンを Bearer で送る。API 側は env MCP_SERVICE_TOKEN と
// 定数時間で照合し、一致したら専用の **サービスプリンシパル** として通す。
//
// このプリンシパルは email-allowlist 経由で ws-belvedere の po member に自動ブートストラップ
// される (config/email-allowlist.ts)。以降は人間ユーザーと完全に同じ
// workspaceMiddleware → IDOR ガードの経路を通るため、裏口にならない。
//
// セキュリティ設計:
//   - env MCP_SERVICE_TOKEN が未設定 / 空のときはこのパス自体が無効 (Firebase のみ) = 安全側の既定。
//   - 比較は sha256 ダイジェスト同士の timingSafeEqual。長さ差での早期 return による
//     タイミング漏洩を避けるため、まず固定長 (32byte) に潰してから比較する。
//   - トークンはコードに置かない。Cloud Run には Secret Manager から env 注入、
//     ローカル MCP には Claude Code の mcp 設定の env で渡す。ローテーションは secret 更新 + 再デプロイ。
//   - 権限は最小: po ロール / ws-belvedere 単一スコープ (member 招待・workspace 削除は owner/sm 専用なので不可)。

import { createHash, timingSafeEqual } from 'node:crypto';

/** MCP サービスプリンシパルの識別子。人間ユーザーの Firebase UID と衝突しない `svc:` prefix。 */
export const MCP_SERVICE_USER_ID = 'svc:mcp';

/**
 * MCP サービスプリンシパルの email。email-allowlist との突合キーになるので、
 * allowlist 側のエントリと必ず一致させること (このモジュールが単一ソース)。
 * 会社メアドではない明示的なサービス識別子 (`.svc` は内部サービス用の擬似ドメイン)。
 */
export const MCP_SERVICE_EMAIL = 'mcp@belvedere.svc';

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/**
 * 提示された Bearer トークンが MCP_SERVICE_TOKEN と一致するかを定数時間で判定する。
 * env MCP_SERVICE_TOKEN が未設定 / 空のときは常に false (= サービストークン認証は無効)。
 */
export function matchesServiceToken(presented: string): boolean {
  const expected = process.env.MCP_SERVICE_TOKEN;
  if (!expected || expected.length === 0) return false;
  if (!presented || presented.length === 0) return false;
  // sha256 ダイジェスト (常に 32byte) 同士を比較し、長さ差による分岐を作らない。
  return timingSafeEqual(sha256(presented), sha256(expected));
}
