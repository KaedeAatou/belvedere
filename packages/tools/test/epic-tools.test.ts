// epic.list ツールの返却フィールド固定テスト (2026-07-10)。
//
// 実機検証: 実 Gemini がビジネス直結を判断できず「プロダクトゴールが不明」「rationale の中身が
// 分からない」と回答したのは、agent が呼べる epic.list が rationale/successMetric/strategicTheme
// を返していなかったため (欠落の有無しか分からず、内容とのドリフト判定ができなかった)。
// このテストは「LLM に見えるフィールド」を契約として固定する。

import { describe, it, expect } from 'vitest';
import { buildRegistry } from '@belvedere/agent';
import type { Epic } from '@belvedere/shared';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { buildTools } from '../src/index';

function epic(over: Partial<Epic> & { id: string }): Epic {
  return {
    workspaceId: 'ws-belvedere',
    name: 'e',
    status: 'planned',
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

function toolOf(repo: RepoContainer, workspaceId: string, name: string) {
  const reg = buildRegistry(buildTools(repo, workspaceId));
  const t = reg.get(name);
  if (!t) throw new Error(`${name} tool not found`);
  return t;
}

describe('epic.list の返却フィールド (2026-07-10)', () => {
  it('rationale / successMetric / strategicTheme を含む (LLM が戦略整合を判定できる)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.epics.upsert(
      epic({
        id: 'EP-a',
        rationale: '決済基盤の信頼性を高め本番リリースの土台を作る',
        successMetric: 'デモ環境セットアップ 3h→10min',
        strategicTheme: 'Delivery Reliability',
      }),
    );
    const tool = toolOf(repo, 'ws-belvedere', 'epic.list');
    const res = (await tool.invoke({})) as Array<Record<string, unknown>>;
    const row = res.find((r) => r.id === 'EP-a');
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      id: 'EP-a',
      rationale: '決済基盤の信頼性を高め本番リリースの土台を作る',
      successMetric: 'デモ環境セットアップ 3h→10min',
      strategicTheme: 'Delivery Reliability',
    });
  });

  it('未設定の optional フィールドはキー自体を含めない (JSON ノイズを増やさない)', async () => {
    const repo = createMemoryRepoContainer();
    await repo.epics.upsert(epic({ id: 'EP-b' }));
    const tool = toolOf(repo, 'ws-belvedere', 'epic.list');
    const res = (await tool.invoke({})) as Array<Record<string, unknown>>;
    const row = res.find((r) => r.id === 'EP-b')!;
    expect('rationale' in row).toBe(false);
    expect('successMetric' in row).toBe(false);
    expect('strategicTheme' in row).toBe(false);
  });

  it('存在しない projectId (LLM が idPrefix を誤指定) は無視して workspace 全体を返し note で知らせる', async () => {
    // 実機 2026-07-11: 子 refinement が epic.list に projectId="BV" (idPrefix の誤指定) を渡して
    // 空配列を受け取り「EP-1 が見つからない」と誤答した。存在しない projectId は決定論で無視する。
    const repo = createMemoryRepoContainer();
    await repo.epics.upsert(epic({ id: 'EP-a', rationale: 'r' }));
    const tool = toolOf(repo, 'ws-belvedere', 'epic.list');
    const res = (await tool.invoke({ projectId: 'BV' })) as {
      note: string;
      epics: Array<Record<string, unknown>>;
    };
    expect(res.note).toContain('BV');
    expect(res.epics.some((r) => r.id === 'EP-a')).toBe(true);
  });

  it('実在する projectId の絞り込みは従来どおり効く (配列で返す)', async () => {
    const repo = createMemoryRepoContainer();
    const projects = await repo.projects.list({ workspaceId: 'ws-belvedere' });
    const realProject = projects[0];
    if (!realProject) throw new Error('memory seed に project が無い');
    await repo.epics.upsert(epic({ id: 'EP-a', projectId: realProject.id }));
    const tool = toolOf(repo, 'ws-belvedere', 'epic.list');
    const res = (await tool.invoke({ projectId: realProject.id })) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(res)).toBe(true);
    expect(res.some((r) => r.id === 'EP-a')).toBe(true);
  });
});
