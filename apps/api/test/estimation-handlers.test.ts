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

// 権限再設計 (2026-06-23): facilitate(開始/開示)=admin/sm、vote=admin/dev、adopt=admin/sm/dev。
const admin = { workspaceId: WS, user: { userId: 'admin1', email: 'a@x.com' }, role: 'admin' as const };
const sm = { workspaceId: WS, user: { userId: 'sm1', email: 's@x.com' }, role: 'sm' as const };
const po = { workspaceId: WS, user: { userId: 'po1', email: 'p@x.com' }, role: 'po' as const };
const dev = { workspaceId: WS, user: { userId: 'dev1', email: 'd@x.com' }, role: 'dev' as const };
const dev2 = { workspaceId: WS, user: { userId: 'dev2', email: 'd2@x.com' }, role: 'dev' as const };
const otherWs = { workspaceId: 'ws-other', user: { userId: 'x', email: 'x@x.com' }, role: 'admin' as const };

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

  it('admin (作成者) が開始できる', async () => {
    const res = await startEstimation(repo, admin, 'WC-EST', NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.status).toBe('voting');
  });
  it('sm は開始できる (facilitate = admin/sm)', async () => {
    const res = await startEstimation(repo, sm, 'WC-EST', NOW);
    expect(res.ok).toBe(true);
  });
  it('dev は 403', async () => {
    const res = await startEstimation(repo, dev, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });
  it('po は 403 (facilitate は SM の進行 / マトリクス境界)', async () => {
    const res = await startEstimation(repo, po, 'WC-EST', NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
  it('voting 中の二重開始は 409', async () => {
    await startEstimation(repo, admin, 'WC-EST', NOW);
    const res = await startEstimation(repo, admin, 'WC-EST', NOW);
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
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, admin, 'WC-EST', NOW); });

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
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await getEstimation(repo, dev, 'WC-EST');
    expect(res.ok).toBe(true);
    if (!res.ok || res.body.status === 'voting') return;
    const values = res.body.votes.map((v) => v.value).sort();
    expect(values).toEqual([13, 3]);
  });
});

describe('vote / reveal / adopt フロー', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, admin, 'WC-EST', NOW); });

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
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await voteEstimation(repo, dev2, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
  });

  it('投票 0 件での reveal は 409', async () => {
    const res = await revealEstimation(repo, admin, 'WC-EST', NOW);
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
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, admin, 'WC-EST', { value: 5 }, NOW);
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
    const res = await adoptEstimation(repo, admin, 'WC-EST', { value: 5 }, NOW);
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

// 権限マトリクス境界 (2026-06-23 再設計): vote=admin/dev のみ、adopt=admin/sm/dev。
// 投票は「見積もる当事者」= Dev の専権、進行役 (PO/SM) は投票しない、を実際に handler で踏む。
describe('見積もり権限マトリクス境界 (vote / adopt)', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, admin, 'WC-EST', NOW); });

  it('vote: dev は投票できる (estimation.vote = admin/dev)', async () => {
    const res = await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(true);
  });
  it('vote: admin も投票できる', async () => {
    const res = await voteEstimation(repo, admin, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(true);
  });
  it('vote: po は 403 (進行役は投票しない / 新規ゲート)', async () => {
    const res = await voteEstimation(repo, po, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
  it('vote: sm は 403 (進行役は投票しない / 新規ゲート)', async () => {
    const res = await voteEstimation(repo, sm, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });

  it('adopt: dev も採用できる (estimation.adopt = admin/sm/dev)', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(true);
  });
  it('adopt: sm も採用できる', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, sm, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(true);
  });
  it('adopt: po は 403 (PO は見積もりの採用に関与しない / マトリクス境界)', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, po, 'WC-EST', { value: 5 }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
  });
});

// adopt は ticket.estimatePt を書き換える副作用を持つため、二重採用・無効値・割れ票での
// 挙動が崩れると見積もりが静かに化ける。既存実装の「正しい挙動」を回帰ガードとして固定する
// (赤を踏むバグ修正ではなく、現挙動の凍結 / T3b・2026-06-18)。
describe('adopt 回帰ガード (副作用の凍結)', () => {
  let repo: RepoContainer;
  beforeEach(async () => { repo = createMemoryRepoContainer(); await seedTicket(repo); await startEstimation(repo, admin, 'WC-EST', NOW); });

  it('採用済セッションへの再 adopt は 409 (activeSession が adopted を除外) で estimatePt を二重更新しない', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 5 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const first = await adoptEstimation(repo, admin, 'WC-EST', { value: 5 }, NOW);
    expect(first.ok).toBe(true);
    // 二度目: ACTIVE_STATUS=['voting','revealed'] が adopted を除外 → activeSession=null → not_revealed 409。
    const second = await adoptEstimation(repo, admin, 'WC-EST', { value: 13 }, '2026-06-11T10:00:00Z');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.status).toBe(409);
    // 二度目の 13 で estimatePt が二重更新されていない (最初の 5 のまま)。
    const t = await repo.tickets.get('WC-EST');
    expect(t?.estimatePt).toBe(5);
  });

  it('非 fibonacci 値の adopt は 400 (revealed チェックの後・mutation の前) → revealed のまま後続 adopt 可', async () => {
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 5 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    // 4 は fibonacci ポイントでない。revealed なので 409 ではなく、schema で 400 になる (順序の固定)。
    const bad = await adoptEstimation(repo, admin, 'WC-EST', { value: 4 }, NOW);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.status).toBe(400);
    // mutation 前に弾かれるので estimatePt 未更新 + session は revealed のまま。
    expect((await repo.tickets.get('WC-EST'))?.estimatePt).toBeUndefined();
    const ok = await adoptEstimation(repo, admin, 'WC-EST', { value: 5 }, NOW);
    expect(ok.ok).toBe(true);
    expect((await repo.tickets.get('WC-EST'))?.estimatePt).toBe(5);
  });

  it('割れ票でも投票集合に縛られず合意値 (どの票でもない fibonacci) を採用できる', async () => {
    // 投票は 3 と 13 に割れる。中央値 8 はどちらの票でもないが採用できる
    // (合意値の算出は UI/composable 層、handler は fibonacci である限り値を強制しない)。
    await voteEstimation(repo, dev, 'WC-EST', { value: 3 }, NOW);
    await voteEstimation(repo, dev2, 'WC-EST', { value: 13 }, NOW);
    await revealEstimation(repo, admin, 'WC-EST', NOW);
    const res = await adoptEstimation(repo, admin, 'WC-EST', { value: 8 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok || res.body.status === 'voting') return;
    expect(res.body.adoptedValue).toBe(8);
    expect((await repo.tickets.get('WC-EST'))?.estimatePt).toBe(8);
  });
});