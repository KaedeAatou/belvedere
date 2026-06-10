// utils.ts の単体テスト (2026-06-10 / R2 で api/repo から移設・集約)。

import { describe, it, expect } from 'vitest';
import { stripUndefined, stripUndefinedPartial, generateId } from '../src/utils';

describe('stripUndefined (型は T のまま / repo backend 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefined({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
  it('undefined を含まない object はそのまま', () => {
    expect(stripUndefined({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });
});

describe('stripUndefinedPartial (undefined union も型から除外 / api handler 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefinedPartial({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefinedPartial({ a: undefined, b: undefined })).toEqual({});
  });
});

describe('generateId', () => {
  it('prefix-base36 形式で返す', () => {
    const id = generateId('WC');
    expect(id).toMatch(/^WC-[0-9A-Z]+$/);
  });
  it('prefix が変われば接頭辞も変わる', () => {
    expect(generateId('EP').startsWith('EP-')).toBe(true);
    expect(generateId('EST').startsWith('EST-')).toBe(true);
  });
});
