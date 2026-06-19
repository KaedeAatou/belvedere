// Phase 1-C CRUD handler の単体テスト (2026-06-11)。
// 純粋関数として書いた handler を memory backend で直接呼び、IDOR + 検証 + immutable field を確認。
//
// Hono 経由の test (auth/workspace middleware 込み) は Firebase Admin SDK モックが要るため
// 別途 e2e で確認する想定。ここは「業務ロジックの単体保証」のレイヤ。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import {
  createTicket,
  patchTicket,
  reorderTickets,
  changeTicketStatus,
  deleteTicket,
} from '../src/handlers/ticket-handlers';
import { createEpic, patchEpic } from '../src/handlers/epic-handlers';

// stripUndefined / stripUndefinedPartial の単体 test は @belvedere/shared 側
// (packages/shared/test/utils.test.ts / R2 で移設) に移管した。

const WS = 'ws-belvedere';
const OTHER_WS = 'ws-attacker';
const CTX = { workspaceId: WS, user: { userId: 'firebase-uid-test', email: 'test@example.com' } };
const OTHER_CTX = { workspaceId: OTHER_WS, user: { userId: 'firebase-uid-attacker', email: 'attacker@example.com' } };

describe('createTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 必須 title のみで status=backlog / priority=medium デフォルト適用', async () => {
    const res = await createTicket(repo, CTX, { title: '新規チケット' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('新規チケット');
    expect(res.body.status).toBe('backlog');
    expect(res.body.priority).toBe('medium');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.id).toMatch(/^WC-/);
    expect(res.body.createdBy).toBe('human');
  });

  it('正常系: 全フィールド指定で作成', async () => {
    const res = await createTicket(repo, CTX, {
      title: 'with all fields',
      description: 'detailed',
      status: 'todo',
      priority: 'high',
      valueImpact: 'high',
      ritual: 'planning',
      sprintId: 'sprint-13',
      assigneeId: 'kaede',
      estimatePt: 5,
      acceptanceCriteria: ['A', 'B'],
      labels: ['demo'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.estimatePt).toBe(5);
    expect(res.body.acceptanceCriteria).toEqual(['A', 'B']);
  });

  it('正常系: type / timeboxHours を保存する (種別バッジ / Spike timebox の前提)', async () => {
    // story は親 Epic 必須 (案A) なので実在 epic を 1 件用意して渡す。
    const epic = await createEpic(repo, CTX, { name: 'Parent' });
    if (!epic.ok) throw new Error('setup failed');
    const story = await createTicket(repo, CTX, { title: 'a story', type: 'story', epicId: epic.body.id });
    expect(story.ok).toBe(true);
    if (!story.ok) return;
    expect(story.body.type).toBe('story');
    expect(story.body.epicId).toBe(epic.body.id);

    const spike = await createTicket(repo, CTX, { title: 'a spike', type: 'spike', timeboxHours: 4 });
    expect(spike.ok).toBe(true);
    if (!spike.ok) return;
    expect(spike.body.type).toBe('spike');
    expect(spike.body.timeboxHours).toBe(4);
  });

  it('異常系: type が不正値 → 400', async () => {
    const res = await createTicket(repo, CTX, { title: 'x', type: 'epic' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('正常系: orderIndex を保存する (手動並び替え d&d の前提)', async () => {
    const res = await createTicket(repo, CTX, { title: 'ordered', orderIndex: 1500 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.orderIndex).toBe(1500);
    // 永続化されているか get でも確認
    const got = await repo.tickets.get(res.body.id);
    expect(got?.orderIndex).toBe(1500);
  });

  it('正常系: orderIndex 省略時はキーを持たない (conditional spread)', async () => {
    const res = await createTicket(repo, CTX, { title: 'no order' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('orderIndex' in res.body).toBe(false);
  });

  it('異常系: title が空文字 → 400 invalid_body', async () => {
    const res = await createTicket(repo, CTX, { title: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('異常系: title が無い → 400', async () => {
    const res = await createTicket(repo, CTX, {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('異常系: status が不正値 → 400', async () => {
    const res = await createTicket(repo, CTX, { title: 'x', status: 'wrong-status' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('セキュリティ: body に workspaceId を入れても ctx の WS が採用される (なりすまし防止)', async () => {
    const res = await createTicket(repo, CTX, {
      title: 'spoof attempt',
      workspaceId: OTHER_WS, // schema 外フィールドだが zod は passthrough なので落ちない、ctx 上書きで吸収
    } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.workspaceId).toBe(WS); // ctx の workspaceId が優先
  });

  // ----- story 親 Epic 必須化 + 実在検証 (案A / 2026-06-19) -----
  // create 経路のみ。退化入力 (undefined / 空文字 / 不在 / 別 WS / 実在) を固定する (.claude/rules/testing.md §1)。
  describe('story の親 Epic 必須化 + 実在検証', () => {
    it('異常系: type=story で epicId 未指定 (undefined) → 400 epic_required', async () => {
      const res = await createTicket(repo, CTX, { title: 'no epic', type: 'story' });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('epic_required');
    });

    it('異常系: type=story で epicId が空文字 → 400 epic_required', async () => {
      const res = await createTicket(repo, CTX, { title: 'empty epic', type: 'story', epicId: '' });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('epic_required');
    });

    it('異常系: type=story で workspace に実在しない epicId (fabricated) → 400 epic_not_found', async () => {
      const res = await createTicket(repo, CTX, { title: 'fake epic', type: 'story', epicId: 'EP-FAKE-NOEXIST' });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('epic_not_found');
    });

    it('異常系: type=story で別 workspace の epicId → 400 epic_not_found (workspace 越え弾き)', async () => {
      const otherEpic = await createEpic(repo, OTHER_CTX, { name: 'Other WS Epic' });
      if (!otherEpic.ok) throw new Error('setup failed');
      const res = await createTicket(repo, CTX, { title: 'cross ws', type: 'story', epicId: otherEpic.body.id });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('epic_not_found');
    });

    it('正常系: type=story で同一 workspace の実在 epicId → 201 + epicId 保存', async () => {
      const epic = await createEpic(repo, CTX, { name: 'Parent' });
      if (!epic.ok) throw new Error('setup failed');
      const res = await createTicket(repo, CTX, { title: 'good story', type: 'story', epicId: epic.body.id });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.status).toBe(201);
      expect(res.body.epicId).toBe(epic.body.id);
      // 永続化確認
      const got = await repo.tickets.get(res.body.id);
      expect(got?.epicId).toBe(epic.body.id);
    });

    it('正常系: story 以外 (task/bug) は epicId 無しでも 201 (非必須)', async () => {
      const task = await createTicket(repo, CTX, { title: 'a task', type: 'task' });
      expect(task.ok).toBe(true);
      if (!task.ok) return;
      expect(task.status).toBe(201);

      const bug = await createTicket(repo, CTX, { title: 'a bug', type: 'bug' });
      expect(bug.ok).toBe(true);
      if (!bug.ok) return;
      expect(bug.status).toBe(201);
    });
  });
});

describe('patchTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 一部フィールドのみ更新', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await patchTicket(repo, CTX, id, { title: 'updated', priority: 'urgent' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.title).toBe('updated');
    expect(res.body.priority).toBe('urgent');
    expect(res.body.id).toBe(id); // id は変更されない
    // updatedAt は createdAt 以降 (同一ミリ秒で等しくなることがあるため >= で判定。
    // .not.toBe だと create と patch が同 ms に走ると偽陽性で落ちる = flaky だった)
    expect(Date.parse(res.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(res.body.createdAt));
  });

  it('IDOR: 別 workspace の ticket は 404 (情報漏えい防止)', async () => {
    const created = await createTicket(repo, CTX, { title: 'in ws-belvedere' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, OTHER_CTX, created.body.id, { title: 'hacked' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('セキュリティ: body で workspaceId / id / createdAt / createdBy を変えようとしても無視される', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const origCreatedAt = created.body.createdAt;
    const res = await patchTicket(repo, CTX, id, {
      id: 'INJECTED-ID',
      workspaceId: OTHER_WS,
      createdAt: '1970-01-01',
      createdBy: 'agent:planner',
    } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.id).toBe(id);
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.createdAt).toBe(origCreatedAt);
    expect(res.body.createdBy).toBe('human');
  });

  it('異常系: 存在しない ID → 404', async () => {
    const res = await patchTicket(repo, CTX, 'NOT-EXIST', { title: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('正常系: sprintId を null で解除できる (3 区画ビューの BACKLOG へ戻す d&d)', async () => {
    const created = await createTicket(repo, CTX, { title: 'sprinted', sprintId: 'sprint-13' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    expect(created.body.sprintId).toBe('sprint-13');
    // null で解除 → フィールドが消える
    const res = await patchTicket(repo, CTX, id, { sprintId: null } as unknown);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('sprintId' in res.body).toBe(false);
    const got = await repo.tickets.get(id);
    expect(got).not.toBeNull();
    expect(got?.sprintId).toBeUndefined();
  });

  it('正常系: sprintId を空文字で解除できる (null と同等)', async () => {
    const created = await createTicket(repo, CTX, { title: 'sprinted', sprintId: 'sprint-13' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, CTX, created.body.id, { sprintId: '' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('sprintId' in res.body).toBe(false);
  });

  it('正常系: sprintId を別の値に付け替えできる (CURRENT/NEXT 間移動)', async () => {
    const created = await createTicket(repo, CTX, { title: 'move me' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, CTX, created.body.id, { sprintId: 'sprint-14' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.sprintId).toBe('sprint-14');
  });

  it('正常系: sprintId 省略 (undefined) は既存 sprintId を保持する (解除ではない)', async () => {
    const created = await createTicket(repo, CTX, { title: 'keep', sprintId: 'sprint-13' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, CTX, created.body.id, { title: 'renamed' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.sprintId).toBe('sprint-13');
  });

  it('正常系: orderIndex を patch で永続化する (fractional な中間値も含む)', async () => {
    const created = await createTicket(repo, CTX, { title: 'reorder me' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await patchTicket(repo, CTX, id, { orderIndex: 1250.5 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.orderIndex).toBe(1250.5);
    const got = await repo.tickets.get(id);
    expect(got?.orderIndex).toBe(1250.5);
  });

  // --- Review 儀式の指摘 (reviewNotes) ---
  // ハンドラは配列まるごと replace 契約。「既存を消さない append」は呼び出し側 (ReviewScreen) が
  // 現 reviewNotes を read → 新指摘を append → 全配列を PATCH することで実現する。
  // ここでは『全配列を渡せば既存が残る / 省略すれば保持 / 配列は replace』の契約を固定する。

  it('正常系: reviewNotes を新規セットできる (created 直後は無し → PATCH で配列を永続化)', async () => {
    const created = await createTicket(repo, CTX, { title: 'demo me', status: 'review' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    expect(created.body.reviewNotes).toBeUndefined();
    const res = await patchTicket(repo, CTX, id, { reviewNotes: ['指摘A'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.reviewNotes).toEqual(['指摘A']);
    const got = await repo.tickets.get(id);
    expect(got?.reviewNotes).toEqual(['指摘A']); // 永続確認
  });

  it('append が既存 reviewNotes を消さない: read→append した全配列を渡すと既存が残る', async () => {
    const created = await createTicket(repo, CTX, { title: 'demo me' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    // 既存 1 件を作る
    const first = await patchTicket(repo, CTX, id, { reviewNotes: ['指摘A'] });
    if (!first.ok) throw new Error('setup failed');
    // 呼び出し側相当の read→append: 現 reviewNotes を read → 新指摘を末尾に append
    const current = first.body.reviewNotes ?? [];
    const next = [...current, '指摘B'];
    const res = await patchTicket(repo, CTX, id, { reviewNotes: next });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.reviewNotes).toEqual(['指摘A', '指摘B']); // 既存が消えない
    const got = await repo.tickets.get(id);
    expect(got?.reviewNotes).toEqual(['指摘A', '指摘B']);
  });

  it('reviewNotes を省略した PATCH は既存 reviewNotes を保持する (undefined は変更なし)', async () => {
    const created = await createTicket(repo, CTX, { title: 'keep notes', reviewNotes: ['指摘A', '指摘B'] });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    expect(created.body.reviewNotes).toEqual(['指摘A', '指摘B']);
    // title だけ patch → reviewNotes 不変
    const res = await patchTicket(repo, CTX, id, { title: 'renamed' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.reviewNotes).toEqual(['指摘A', '指摘B']);
  });

  it('配列 replace 契約: PATCH で渡した配列が既存を merge せず置換する', async () => {
    const created = await createTicket(repo, CTX, { title: 'replace me', reviewNotes: ['A', 'B'] });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    // append せず単一件だけ渡すと既存が消える (replace) — read→append を怠った場合の挙動を固定
    const res = await patchTicket(repo, CTX, id, { reviewNotes: ['C'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.reviewNotes).toEqual(['C']);
  });

  it('空文字の指摘は schema で弾く (z.string().min(1) / MCP・直 PATCH 防御)', async () => {
    const created = await createTicket(repo, CTX, { title: 'guard empty note' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchTicket(repo, CTX, created.body.id, { reviewNotes: [''] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('reorderTickets (区画 d&d 密再採番)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  // seed 由来の「orderIndex 未設定」を再現するヘルパ (orderIndex を渡さず作成)。
  async function mk(title: string, extra: Record<string, unknown> = {}): Promise<string> {
    const r = await createTicket(repo, CTX, { title, ...extra });
    if (!r.ok) throw new Error('setup failed');
    return r.body.id;
  }

  it('正常系: orderedIds の並び順に (i+1)*1000 で密再採番する (未設定→全件 distinct)', async () => {
    // 3 枚とも orderIndex 未設定 (= seed 状態)。
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');
    // 新並び順を [c, a, b] で送る。
    const res = await reorderTickets(repo, CTX, { orderedIds: [c, a, b] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byId = new Map(res.body.map((t) => [t.id, t.orderIndex]));
    expect(byId.get(c)).toBe(1000);
    expect(byId.get(a)).toBe(2000);
    expect(byId.get(b)).toBe(3000);
    // 永続化 + 全件 distinct (症状: 未設定隣接で先頭ジャンプ、の根絶)。
    expect((await repo.tickets.get(a))?.orderIndex).toBe(2000);
    const vals = res.body.map((t) => t.orderIndex);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('回帰ガード(症状2): 「1 つ下へ」移動しても再採番値は単調 distinct で元位置へ戻らない', async () => {
    // 旧バグ: 等値/未設定隣接の中点が衝突し tie-break で元位置復帰。
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');
    // 初期並び [a, b, c] → b を 1 つ下げて [a, c, b]。
    const res = await reorderTickets(repo, CTX, { orderedIds: [a, c, b] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const oi = (id: string) => res.body.find((t) => t.id === id)!.orderIndex!;
    // c < b (b が確実に c の下) かつ a < c < b で単調。衝突なし。
    expect(oi(a)).toBeLessThan(oi(c));
    expect(oi(c)).toBeLessThan(oi(b));
  });

  it('正常系: 区画跨ぎ移動は movedId 1 件だけ sprintId を set し、他の sprintId は触らない', async () => {
    // backlog の x を current(sprint-active) へ。y は完了 sprint 紐付けのまま据え置きを確認。
    const x = await mk('X');                                   // sprintId 無し
    const y = await mk('Y', { sprintId: 'sprint-done-99' });   // 完了 sprint 紐付け
    const res = await reorderTickets(repo, CTX, {
      orderedIds: [y, x],
      movedId: x,
      sprintId: 'sprint-active',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await repo.tickets.get(x))?.sprintId).toBe('sprint-active'); // moved のみ変更
    expect((await repo.tickets.get(y))?.sprintId).toBe('sprint-done-99'); // 巻き込まれない
  });

  it('正常系: sprintId=null は movedId の sprint を解除する (BACKLOG へ戻す d&d)', async () => {
    const x = await mk('X', { sprintId: 'sprint-active' });
    const res = await reorderTickets(repo, CTX, { orderedIds: [x], movedId: x, sprintId: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const got = await repo.tickets.get(x);
    expect(got?.sprintId).toBeUndefined();
    expect('sprintId' in (got ?? {})).toBe(false); // key ごと削除
  });

  it('IDOR: orderedIds に別 workspace の id が 1 件でもあれば 404 + 何も書かない', async () => {
    const mine = await mk('mine');
    const other = await createTicket(repo, OTHER_CTX, { title: 'theirs' });
    if (!other.ok) throw new Error('setup failed');
    const before = (await repo.tickets.get(mine))?.orderIndex;
    const res = await reorderTickets(repo, CTX, { orderedIds: [mine, other.body.id] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
    // 部分適用していない (mine の orderIndex は据え置き)。
    expect((await repo.tickets.get(mine))?.orderIndex).toBe(before);
  });

  it('回帰ガード(並行削除): 不在 id は skip して残りを密再採番する (404 にしない)', async () => {
    // 区画の無関係チケットが別タブ/並行 e2e run で消えても自分の並べ替えは通す (旧「1件でも欠ければ全体404」の撤回)。
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');
    await repo.tickets.delete(b); // 並行削除を再現
    const res = await reorderTickets(repo, CTX, { orderedIds: [a, b, c] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // b は除外、a,c だけ穴を詰めて 1000/2000 に再採番。
    expect(res.body.map((t) => t.id)).toEqual([a, c]);
    expect(res.body.map((t) => t.orderIndex)).toEqual([1000, 2000]);
    expect(await repo.tickets.get(b)).toBeNull();
  });

  it('write 最小化: 並びが変わらない行は再書込しない (body 空 + updatedAt 据え置き)', async () => {
    const a = await mk('A');
    const b = await mk('B');
    await reorderTickets(repo, CTX, { orderedIds: [a, b] }); // a=1000, b=2000 に密採番
    const beforeA = (await repo.tickets.get(a))!.updatedAt;
    // 同じ並びで再 reorder → 変化なし → 何も書かない。
    const res = await reorderTickets(repo, CTX, { orderedIds: [a, b] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body).toEqual([]); // 変わった行のみ返す → 0 件
    expect((await repo.tickets.get(a))!.updatedAt).toBe(beforeA); // updatedAt 据え置き
  });

  it('異常系: orderedIds 空 → 400', async () => {
    const res = await reorderTickets(repo, CTX, { orderedIds: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('異常系: 重複 id → 400 (duplicate_ids)', async () => {
    const a = await mk('A');
    const res = await reorderTickets(repo, CTX, { orderedIds: [a, a] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('異常系: movedId が orderedIds に無い → 400', async () => {
    const a = await mk('A');
    const res = await reorderTickets(repo, CTX, { orderedIds: [a], movedId: 'WC-not-in-list', sprintId: 'sprint-active' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});

describe('changeTicketStatus', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: backlog → in-progress', async () => {
    const created = await createTicket(repo, CTX, { title: 'workflow' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, CTX, created.body.id, { status: 'in-progress' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.from).toBe('backlog');
    expect(res.body.to).toBe('in-progress');
    expect(res.body.ticket.status).toBe('in-progress');
  });

  it('異常系: 不正な status → 400', async () => {
    const created = await createTicket(repo, CTX, { title: 'x' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, CTX, created.body.id, { status: 'invalid-status' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it('IDOR: 別 workspace のものは 404', async () => {
    const created = await createTicket(repo, CTX, { title: 'orig' });
    if (!created.ok) throw new Error('setup failed');
    const res = await changeTicketStatus(repo, OTHER_CTX, created.body.id, { status: 'in-progress' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });
});

describe('deleteTicket', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('正常系: 削除後 get は null', async () => {
    const created = await createTicket(repo, CTX, { title: 'to be deleted' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await deleteTicket(repo, CTX, id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.deleted).toBe(id);
    expect(await repo.tickets.get(id)).toBeNull();
  });

  it('IDOR: 別 workspace のものは 404 + 実際削除されない', async () => {
    const created = await createTicket(repo, CTX, { title: 'victim' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.body.id;
    const res = await deleteTicket(repo, OTHER_CTX, id);
    expect(res.ok).toBe(false);
    // 実データはそのまま残る
    expect(await repo.tickets.get(id)).not.toBeNull();
  });
});

describe('createEpic / patchEpic', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('createEpic: 必須 name + デフォルト status=planned', async () => {
    const res = await createEpic(repo, CTX, { name: 'New Epic' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.name).toBe('New Epic');
    expect(res.body.status).toBe('planned');
    expect(res.body.workspaceId).toBe(WS);
    expect(res.body.id).toMatch(/^EP-/);
  });

  it('patchEpic: rationale 追加 (Phase 1-B の第 6 観点用フィールド)', async () => {
    const created = await createEpic(repo, CTX, { name: 'E' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchEpic(repo, CTX, created.body.id, {
      rationale: 'なぜこの Epic が必要か',
      successMetric: 'チーム DoD 充足率 60→90%',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.rationale).toBe('なぜこの Epic が必要か');
    expect(res.body.successMetric).toBe('チーム DoD 充足率 60→90%');
    expect(res.body.workspaceId).toBe(WS); // 変更されない
  });

  it('patchEpic IDOR: 別 workspace は 404', async () => {
    const created = await createEpic(repo, CTX, { name: 'E' });
    if (!created.ok) throw new Error('setup failed');
    const res = await patchEpic(repo, OTHER_CTX, created.body.id, { rationale: 'hack' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('createEpic 異常系: name 空 → 400', async () => {
    const res = await createEpic(repo, CTX, { name: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});
