// getFindings handler の単体テスト (T4 / 2026-06-11)。
// memory backend (seed) でルールエンジン経由の findings が返ることを確認。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { getFindings } from '../src/handlers/finding-handlers';

const CTX = { workspaceId: 'ws-belvedere', user: { userId: 'u', email: 'u@example.com' } };

describe('getFindings', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('refinement で findings を返す (seed の WC-108 未設定 type を TYPE_MISSING 検出)', async () => {
    const res = await getFindings(repo, CTX, 'refinement');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.ceremony).toBe('refinement');
    // seed WC-108 は type 未設定 → TYPE_MISSING が出るはず
    const typeMissing = res.body.findings.filter((f) => f.ruleId === 'TYPE_MISSING');
    expect(typeMissing.some((f) => f.ticketId === 'WC-108')).toBe(true);
  });

  it('refinement で WC-103 (親なし task) を TASK_NO_PARENT 検出', async () => {
    const res = await getFindings(repo, CTX, 'refinement');
    if (!res.ok) throw new Error('unexpected');
    expect(res.body.findings.some((f) => f.ruleId === 'TASK_NO_PARENT' && f.ticketId === 'WC-103')).toBe(true);
  });

  it('ceremony 未指定は refinement にフォールバック', async () => {
    const res = await getFindings(repo, CTX, undefined);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.ceremony).toBe('refinement');
  });

  it('不正な ceremony は 400', async () => {
    const res = await getFindings(repo, CTX, 'bogus');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('別 workspace ではチケットゼロ → findings ゼロ', async () => {
    const res = await getFindings(repo, { ...CTX, workspaceId: 'ws-empty' }, 'refinement');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.findingCount).toBe(0);
  });
});
