// isScreenId の純粋関数テスト (WC-17: リロード後の画面復元で壊れた localStorage 値を弾く)。
import { describe, it, expect } from 'vitest';
import { isScreenId, SCREEN_IDS } from '~/composables/useUiMeta';

describe('isScreenId (WC-17 localStorage 復元ガード)', () => {
  it('全ての有効な ScreenId を通す', () => {
    for (const id of SCREEN_IDS) expect(isScreenId(id)).toBe(true);
  });
  it('未知の文字列は弾く', () => {
    expect(isScreenId('home')).toBe(false);
    expect(isScreenId('')).toBe(false);
    expect(isScreenId('BACKLOG')).toBe(false);
  });
  it('非文字列 (null / undefined / 数値 / オブジェクト) は弾く', () => {
    expect(isScreenId(null)).toBe(false);
    expect(isScreenId(undefined)).toBe(false);
    expect(isScreenId(0)).toBe(false);
    expect(isScreenId({})).toBe(false);
  });
});
