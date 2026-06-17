// per-user API キーのトークン生成 / ハッシュ (機械認証パス第2弾 / 2026-06-17)。
//
// 背景: MCP サービストークン (config/service-token.ts) は「全員共有の 1 本」で、
// ユーザーごとの programmatic アクセス (CI / スクリプト / 個人の MCP) を本人として
// 発行・失効できない。そこで各ユーザーが自分のキーを発行できるようにする。
//
// セキュリティ設計:
//   - トークン平文は保存しない。sha256(token) の hex だけを Firestore に持ち、認証は
//     提示トークンを sha256 して getByHash で引く (DB の indexed equality lookup)。
//     平文は発行レスポンスで 1 回だけ返す (再表示不可)。
//   - 秘密は randomBytes(24) = 192bit の高エントロピー。高エントロピーなので sha256 で十分
//     (bcrypt/argon2 は低エントロピーパスワード用。ここでは不要)。
//   - 識別子 prefix `blv_` で Firebase ID token (JWT: `eyJ...`) と曖昧さなく分岐できる
//     (authMiddleware が prefix を見て API キー経路に振り分ける)。
//   - サーバ専用 (node:crypto)。@belvedere/shared には置かない = web/Nitro バンドルに
//     Node-only API を引っ張らないため。

import { createHash, randomBytes } from 'node:crypto';

/** API キートークンの識別子 prefix。Firebase JWT (`eyJ...`) と衝突しない。 */
export const API_KEY_PREFIX = 'blv_';

/** トークン平文を sha256 の hex に変換する (保存値 / 照合キー)。 */
export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 新しい API キートークンを生成する。
 * - token: 発行レスポンスで 1 回だけ返す平文 (`blv_<base64url 32 文字>`)
 * - tokenHash: Firestore に保存する sha256 hex
 * - tokenPrefix: UI 表示用の先頭 12 文字 (例 `blv_a1b2c3d4`)
 */
export function generateApiKeyToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const secret = randomBytes(24).toString('base64url'); // 192bit / URL-safe 32 chars
  const token = `${API_KEY_PREFIX}${secret}`;
  return { token, tokenHash: hashApiKeyToken(token), tokenPrefix: token.slice(0, 12) };
}

/** 提示された Bearer が API キー形式 (prefix 一致) かを判定する。 */
export function looksLikeApiKey(presented: string): boolean {
  return presented.startsWith(API_KEY_PREFIX);
}
