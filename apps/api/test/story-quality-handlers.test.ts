// checkStoryQuality handler の単体テスト (Backlog 起票品質チェック / 2026-06-13)。
// memory backend (seed) + Mock LLM 経由で boilerplate / goal_fit 判定を確認する。
// finding-handlers.test.ts と同じ流儀 (createMemoryRepoContainer + CTX 直接呼出)。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { MockLLMProvider } from '@belvedere/llm';
import { checkStoryQuality } from '../src/handlers/story-quality-handlers';

const CTX = { workspaceId: 'ws-belvedere', user: { userId: 'u', email: 'u@example.com' } };

describe('checkStoryQuality', () => {
  let repo: RepoContainer;
  let llm: MockLLMProvider;
  beforeEach(() => {
    repo = createMemoryRepoContainer();
    llm = new MockLLMProvider();
  });

  it('(1) soThat 空 → boilerplate warn が出て ok:false', async () => {
    const res = await checkStoryQuality(repo, llm, CTX, {
      asA: '開発チームのレビュアー',
      iWant: 'PR 一覧でレビュー待ち時間を一目で把握したい',
      soThat: '',
      title: 'レビュー待ち時間の可視化',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.ok).toBe(false);
    const boilerplate = res.body.issues.filter((i) => i.kind === 'boilerplate' && i.severity === 'warn');
    expect(boilerplate.length).toBeGreaterThan(0);
  });

  it('(2) 十分埋まった draft → boilerplate warn が出ない', async () => {
    // active スプリントが無い workspace で goal_fit を介在させず boilerplate のみ評価する。
    const res = await checkStoryQuality(repo, llm, { ...CTX, workspaceId: 'ws-no-active' }, {
      asA: '開発チームのレビュアー',
      iWant: 'PR 一覧でレビュー待ち時間を昇順に並べて確認したい',
      soThat: 'レビュー滞留を早期に発見してリードタイムを短縮できる',
      title: 'レビュー待ち時間の可視化',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // boilerplate の warn は出ない (各欄が具体的)
    const boilerplateWarn = res.body.issues.filter((i) => i.kind === 'boilerplate' && i.severity === 'warn');
    expect(boilerplateWarn.length).toBe(0);
    // active スプリントが無いので goal_fit issue も出ない → warn ゼロ → ok:true
    expect(res.body.ok).toBe(true);
    expect(res.body.suggestion).toBeTypeOf('string');
  });

  // seed の ws-belvedere は active sprint-13 を持つ
  // (goal='儀式健全性ダッシュボードのMVPを公開、チケット品質スコアの常設化')。
  // goal_fit はこの seed のゴールに対して判定される。
  const SEED_ACTIVE_GOAL = '儀式健全性ダッシュボードのMVPを公開、チケット品質スコアの常設化';

  it('(3) active スプリントゴールと無関係な draft → goal_fit warn が出る', async () => {
    // seed の active ゴール (ダッシュボード/品質スコア) と語が全く重ならない draft。
    const res = await checkStoryQuality(repo, llm, CTX, {
      asA: 'マーケティング担当',
      iWant: 'ニュースレターの開封率レポートを毎週メールで受け取りたい',
      soThat: '配信文面の改善判断を素早くおこなえる',
      title: 'ニュースレター開封率レポート',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const goalFit = res.body.issues.filter((i) => i.kind === 'goal_fit');
    expect(goalFit.length).toBe(1);
    expect(goalFit[0]?.severity).toBe('warn');
    // 判定に使った active スプリントの seed ゴールがレスポンスに含まれる
    expect(res.body.sprintGoal).toBe(SEED_ACTIVE_GOAL);
    expect(res.body.ok).toBe(false);
  });

  it('(3b) active スプリントゴールに語が重なる draft → goal_fit info (warn でない)', async () => {
    // seed の active ゴールに含まれる「品質スコア」「ダッシュボード」を draft に含める。
    const res = await checkStoryQuality(repo, llm, CTX, {
      asA: '開発チームのスクラムマスター',
      iWant: 'チケット品質スコアをダッシュボードで一覧したい',
      soThat: '品質の低いチケットを早期に発見して改善を促せる',
      title: 'チケット品質スコアのダッシュボード化',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const goalFit = res.body.issues.filter((i) => i.kind === 'goal_fit');
    expect(goalFit.length).toBe(1);
    expect(goalFit[0]?.severity).toBe('info');
  });

  it('(4) body 不正 (asA 欠落) → 400', async () => {
    const res = await checkStoryQuality(repo, llm, CTX, { iWant: 'x', soThat: 'y' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});
