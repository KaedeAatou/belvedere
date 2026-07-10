// composeServerContext の unit test (2026-07-10)。
// 「プロダクトゴールが agent に届いていない」実機検証 (AI が「不明なため判断できません」と回答) の
// 修正対象。退化入力 (workspace なし / productGoal 空 / active sprint なし / goal 空 /
// clientContext なし / 全部あり) を固定する。

import { describe, it, expect } from 'vitest';
import { composeServerContext } from '../src/handlers/agent-context';

describe('composeServerContext', () => {
  it('workspace なし (productGoal=null) は「未設定」と明示する', () => {
    const ctx = composeServerContext(null, null, undefined);
    expect(ctx).toContain('プロダクトゴール: (未設定。Home 画面で PO/admin が設定できます)');
    expect(ctx).toContain('アクティブスプリント: なし');
  });

  it('productGoal が空文字も「未設定」扱いにする', () => {
    const ctx = composeServerContext('   ', null, undefined);
    expect(ctx).toContain('プロダクトゴール: (未設定。Home 画面で PO/admin が設定できます)');
  });

  it('active sprint なしは「アクティブスプリント: なし」', () => {
    const ctx = composeServerContext('決済基盤を本番リリースする', null, undefined);
    expect(ctx).toContain('プロダクトゴール: 決済基盤を本番リリースする');
    expect(ctx).toContain('アクティブスプリント: なし');
  });

  it('sprint goal が空文字は「未設定」と明示する (goal 未入力でも sprint 番号は出す)', () => {
    const ctx = composeServerContext('決済基盤を本番リリースする', { number: 13, goal: '  ' }, undefined);
    expect(ctx).toContain('アクティブスプリント (Sprint 13) のゴール: (未設定)');
  });

  it('clientContext なしはヘッダーのみを返す (末尾に余分な区切りを付けない)', () => {
    const ctx = composeServerContext('ゴール', { number: 1, goal: 'G' }, undefined);
    expect(ctx.startsWith('[プロダクトゴールとスプリントゴール]')).toBe(true);
    expect(ctx).not.toContain('undefined');
  });

  it('全部揃っている場合は clientContext をヘッダーの後ろに連結する', () => {
    const ctx = composeServerContext(
      '決済基盤を本番リリースする',
      { number: 13, goal: '儀式健全性ダッシュボードのMVPを公開' },
      '[現在の画面とスプリント状況]\n現在の画面: Backlog',
    );
    expect(ctx).toBe(
      [
        '[プロダクトゴールとスプリントゴール]',
        'プロダクトゴール: 決済基盤を本番リリースする',
        'アクティブスプリント (Sprint 13) のゴール: 儀式健全性ダッシュボードのMVPを公開',
        '',
        '[現在の画面とスプリント状況]',
        '現在の画面: Backlog',
      ].join('\n'),
    );
  });
});
