// 見積もりポーカー handler の単体テスト (T6 / 2026-06-11)。
// §4-3 の必須ケース: 隠蔽 (voting 中 GET に他人 value なし) / reveal 後全票 / reveal 後 vote 409 /
// 別 workspace 404 / dev role の reveal 403。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import type { Ticket } from '@belvedere/shared';
import {
  startEstimation,
  getEstimation,
  voteEstimation,
  revealEstimation,
  adoptEstimation,
} from '../src/handlers/estimation-handlers';

const WS = 'ws-belvedere';
const NOW = '2026-06-11T09:00:00Z';

const owner = { workspaceId: WS, user: { userId: 'owner1', email: 'o@x.com' }, role: 'owner' as const };
const dev = { workspaceId: WS, user: { userId: 'dev1', email: 'd@x.com' }, role: 'dev' as const };
const dev2 = { workspaceId: WS, user: { userId: 'dev2', email: 'd2@x.com' }, role: 'dev' as const };
const otherWs = { workspaceId: 'ws-other', user: { userId: 'x', email: 'x@x.com' }, role: 'owner' as const };

async function seedTicket(repo: RepoContainer): Promise<void> {
  const t: Ticket = {
    id: 'WC-EST', workspaceId: WS, title: 'estimate me', status: 'backlog', priority: 'medium',
    type: 'story', createdAt: NOW, updatedAt: NOW, createdBy: 'human',
  };
  await repo.tickets.upsert(t);
}

describe('startEstimation', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); });

  it('owner が開始できる', async () => {
    const res = await startEstimation(repo, owner, 'WC-EST', NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.status).toBe('voting');
  });
  it('dev は 403', async () => {
    const res = await startEstimation(repo, dev, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });
  it('voting 中の二重開始は 409', async () => {
    await startEstimation(repo, owner, 'WC-EST', NOW);
    const res = await startEstimation(repo, owner, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });
  it('別 workspace のチケットは 404', async () => {
    const res = await startEstimation(repo, otherWs, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('隠蔽 (§4-3 の核心)', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, owner, 'WC-EST', NOW); });

  it('voting 中の GET は他人の value を含まず votedUserIds と自分の票のみ', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 13 }, NOW);
    // dev 視点
    const res = await getEstimation(repo, dev, 'WC-EST');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.status).toBe('voting');
    if (res.body.status !== 'voting') return;
    expect(res.body.myVote).toBe(3);            // 自分の票は見える
    expect(res.body.voteCount).toBe(2);
    expect(res.body.votedUserIds.sort()).toEqual(['dev1', 'dev2']);
    // 他人の value (13) はレスポンス JSON のどこにも含まれない
    expect(JSON.stringify(res.body)).not.toContain('13');
  });

  it('reveal 後は全票が見える', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 13 }, NOW);
    await revealEstimation(repo, owner, 'WC-EST', NOW);
    const res = await getEstimation(repo, dev, 'WC-EST');
    expect(res.ok).toBe(true);
    if (!res.ok || res.body.status === 'voting') return;
    const values = res.body.votes.map((v) => v.value).sort();
    expect(values).toEqual([13, 3]);
  });
});

describe('vote / reveal / adopt フロー', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, owner, 'WC-EST', NOW); });

  it('投票は上書きできる (開示前)', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    const res = await getEstimation(repo, dev, 'WC-EST');
    if (!res.ok || res.body.status !== 'voting') throw new Error('unexpected');
    expect(res.body.myVote).toBe(5);
    expect(res.body.voteCount).toBe(1); // 同一ユーザは 1 票に集約
  });

  it('reveal 後の vote は 409', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await revealEstimation(repo, owner, 'WC-EST', NOW);
    const res = await voteEstimation(repo, dev2, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('投票 0 件での reveal は 409', async () => {
    const res = await revealEstimation(repo, owner, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('dev の reveal は 403', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    const res = await revealEstimation(repo, dev, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('adopt で ticket.estimatePt が更新される + adopted view を返す', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, owner, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, owner, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // web が「採用済」を描画できるよう EstimationView (status='adopted') を返す
    expect(res.body.status).toBe('adopted');
    if (res.body.status === 'voting') return;
    expect(res.body.adoptedValue).toBe(5);
    const t = await repo.tickets.get('WC-EST');
    expect(t?.estimatePt).toBe(5);
    // adopt 後も GET は adopted を返す (404 でなく / polling・再開で採用済が残る)
    const get = await getEstimation(repo, dev, 'WC-EST');
    expect(get.ok).toBe(true);
    if (!get.ok || get.body.status === 'voting') return;
    expect(get.body.status).toBe('adopted');
    expect(get.body.adoptedValue).toBe(5);
  });

  it('未開示での adopt は 409', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    const res = await adoptEstimation(repo, owner, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('? 投票もできる', async () => {
    const res = await voteEstimation(repo, dev, 'WC-EST', { value: '?' }, NOW);
    expect(res.ok).toBe(true);
  });

  it('不正な投票値は 400', async () => {
    const res = await voteEstimation(repo, dev, 'WC-EST', { value: 4 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});