// shouldRedirectToLogin の直接 unit テスト (2026-07-07)。
// バグ経緯: middleware だけだと初回ハードロード直後 (isInitialized=false→true の遷移) を
// 誰も再判定せず、未ログインのまま (no name) シェルが表示され続けた。判定ロジックを純粋関数に
// 切り出し、middleware/plugin 双方から同じ結論になることを固定する。

import { describe, it, expect } from 'vitest';
import { shouldRedirectToLogin } from '~/utils/auth-guard';

describe('shouldRedirectToLogin', () => {
  it('/login 自身はリダイレクト不要 (未初期化・未認証でも)', () => {
    expect(shouldRedirectToLogin('/login', false, false)).toBe(false);
    expect(shouldRedirectToLogin('/login', true, false)).toBe(false);
  });

  it('未初期化 (isInitialized=false) は判定保留 (リロード直後の誤リダイレクト防止)', () => {
    expect(shouldRedirectToLogin('/', false, false)).toBe(false);
    expect(shouldRedirectToLogin('/', false, true)).toBe(false);
  });

  it('初期化済みで未認証ならリダイレクトする', () => {
    expect(shouldRedirectToLogin('/', true, false)).toBe(true);
  });

  it('初期化済みで認証済みならリダイレクトしない', () => {
    expect(shouldRedirectToLogin('/', true, true)).toBe(false);
  });
});
