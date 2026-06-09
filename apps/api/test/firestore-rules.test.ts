// Firestore Security Rules ファイルの sanity check (Phase 1-B / 2026-06-10)。
// 実 Firebase Emulator を立てずに「ファイルが存在し、最低限の構文を満たす」だけ確認する。
// Phase 1-C で UI から直接 Firestore を叩く設計に切り替えるなら、
// @firebase/rules-unit-testing で実 emulator 連携 test を足す。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..', '..');
const rulesPath = resolve(repoRoot, 'infra', 'firestore.rules');
const firebaseJsonPath = resolve(repoRoot, 'infra', 'firebase.json');

describe('Firestore Security Rules - ファイル存在', () => {
  it('infra/firestore.rules が存在する', () => {
    expect(existsSync(rulesPath)).toBe(true);
  });

  it('infra/firebase.json が存在する (firebase deploy の meta)', () => {
    expect(existsSync(firebaseJsonPath)).toBe(true);
  });

  it('firebase.json は firestore.rules を指している', () => {
    const json = JSON.parse(readFileSync(firebaseJsonPath, 'utf8'));
    expect(json.firestore?.rules).toBe('firestore.rules');
  });
});

describe('Firestore Security Rules - 内容', () => {
  const content = existsSync(rulesPath) ? readFileSync(rulesPath, 'utf8') : '';

  it("rules_version = '2' が宣言されている", () => {
    expect(content).toMatch(/rules_version\s*=\s*['"]2['"]/);
  });

  it('service cloud.firestore ブロックがある', () => {
    expect(content).toMatch(/service\s+cloud\.firestore/);
  });

  it('match /{document=**} で全コレクション対象のルールがある (Phase 1-B のラストガード)', () => {
    expect(content).toMatch(/match\s+\/\{document=\*\*\}/);
  });

  it('全コレクションが if false で完全保護されている (API 経由を強制)', () => {
    // 「クライアント直叩きを全部拒否」設計の不可侵ルール。Phase 1-C 以降で読み取りだけ
    // 緩める場合は、別 match block で workspace ベースの allow を追加し、
    // この `if false` は「フォールバック」として残す形を想定。
    expect(content).toMatch(/allow\s+read,\s*write:\s*if\s+false/);
  });

  it('うっかり if true を入れていない (完全公開防止)', () => {
    // Phase 1-C 開発中に「とりあえず if true で動かす」をやりがちなので、
    // CI でブロックする予防策。本物の公開ルールが要る時はこのテストを更新する。
    expect(content).not.toMatch(/allow\s+read,\s*write:\s*if\s+true/);
    expect(content).not.toMatch(/allow\s+write:\s*if\s+true/);
  });
});
