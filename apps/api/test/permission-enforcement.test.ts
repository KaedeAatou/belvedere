// 権限マトリクス「強制」の網羅統合テスト (2026-06-23 再設計)。
//
// permissions.test.ts は純粋関数 can() を直接固める層。本ファイルはその 1 段上 ——
// 「実際に handler を各ロールで叩いて、マトリクス通りに通る/弾かれるか」を action × role の
// 全組合せで踏む (.claude/rules/testing.md 統合層: handler の配線が can() に正しく繋がっているか)。
//
// あわせてユーザー要望: 拒否時のエラー/警告メッセージが「わかりやすく妥当か」を機械検証する。
//   - 403 body は forbidden() の構造化形 (error='forbidden' / action / requiredRoles / message)
//   - requiredRoles は rolesFor(action) と一致 (= MATRIX 単一ソースとドリフトしない)
//   - message は空でない日本語文で、許可ロール名 (PO/SM/Dev/管理者) を含む = 「誰なら可能か」が読める

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { rolesFor, type Action } from '../src/permissions';
import type { HandlerContext, HandlerResult } from '../src/handlers/ticket-handlers';
import { createTicket, reorderTickets } from '../src/handlers/ticket-handlers';
import { createEpic } from '../src/handlers/epic-handlers';
import { createSprint, patchSprint } from '../src/handlers/sprint-handlers';
import { inviteMember } from '../src/handlers/workspace-handlers';
import {
  startEstimation,
  voteEstimation,
  revealEstimation,
  adoptEstimation,
} from '../src/handlers/estimation-handlers';

const WS = 'ws-belvedere';
const NOW = '2026-06-23T09:00:00Z';
const ALL_ROLES = ['admin', 'po', 'sm', 'dev'] as const;
type Role = (typeof ALL_ROLES)[number];

/** テスト対象ロールの ctx。各ロールに固有 userId を与え invite の重複等を避ける。 */
function ctxFor(role: Role): HandlerContext {
  return { workspaceId: WS, user: { userId: `u-${role}`, email: `${role}@x.com` }, role };
}
/** 前提セットアップ用の全権 ctx (ゲートを素通しして fixture を用意する)。 */
const SETUP: HandlerContext = { workspaceId: WS, user: { userId: 'u-setup', email: 'setup@x.com' }, role: 'admin' };

async function mkTicket(repo: RepoContainer, title: string): Promise<string> {
  const r = await createTicket(repo, SETUP, { title });
  if (!r.ok) throw new Error('setup: createTicket failed');
  return r.body.id;
}
async function mkPlannedSprint(repo: RepoContainer): Promise<string> {
  const r = await createSprint(repo, SETUP, {
    goal: 'setup goal', startsAt: '2026-07-01T00:00:00+09:00', endsAt: '2026-07-14T23:59:59+09:00',
  });
  if (!r.ok) throw new Error('setup: createSprint failed');
  return r.body.id;
}

// 各 action を「対象 ctx で実際に実行」するドライバ。fresh repo に admin で前提を整えてから、
// ゲート対象の最終操作だけを `ctx` (テスト対象ロール) で呼ぶ。返値が 2xx なら許可、403 なら拒否。
const DRIVERS: Record<Action, (repo: RepoContainer, ctx: HandlerContext) => Promise<HandlerResult<unknown>>> = {
  'member.invite': (repo, ctx) =>
    inviteMember(repo, ctx, { email: `invitee-${ctx.user.userId}@x.com`, role: 'dev' }),

  'backlog.reorder': async (repo, ctx) => {
    const a = await mkTicket(repo, 'A');
    const b = await mkTicket(repo, 'B');
    return reorderTickets(repo, ctx, { orderedIds: [b, a] });
  },

  'epic.write': (repo, ctx) => createEpic(repo, ctx, { name: `Epic by ${ctx.user.userId}` }),

  'sprint.goal': async (repo, ctx) => {
    const id = await mkPlannedSprint(repo);
    return patchSprint(repo, ctx, id, { goal: '新ゴール' });
  },

  'sprint.manage': (repo, ctx) =>
    createSprint(repo, ctx, {
      goal: 'g', startsAt: '2026-08-01T00:00:00+09:00', endsAt: '2026-08-14T23:59:59+09:00',
    }),

  'estimation.facilitate': async (repo, ctx) => {
    const t = await mkTicket(repo, 'estimate me');
    return startEstimation(repo, ctx, t, NOW);
  },

  'estimation.vote': async (repo, ctx) => {
    const t = await mkTicket(repo, 'estimate me');
    await startEstimation(repo, SETUP, t, NOW); // admin が voting を開始
    return voteEstimation(repo, ctx, t, { value: 5 }, NOW);
  },

  'estimation.adopt': async (repo, ctx) => {
    const t = await mkTicket(repo, 'estimate me');
    await startEstimation(repo, SETUP, t, NOW);
    await voteEstimation(repo, ctxFor('dev'), t, { value: 5 }, NOW); // dev が投票
    await revealEstimation(repo, SETUP, t, NOW); // admin が開示 → revealed
    return adoptEstimation(repo, ctx, t, { value: 5 }, NOW);
  },

  // ticket.write は全ロール許可だが createTicket 等で can('ticket.write') ゲート済 (undefined role を弾く
  // 防御の深さ)。全 4 ロールが 201 を取れることをここで実 handler で踏む。
  'ticket.write': (repo, ctx) => createTicket(repo, ctx, { title: `t by ${ctx.user.userId}` }),

  // agent.invoke は app.ts 内 (Hono inline) で can() ゲートしており、対応する handler 関数が無い
  // (repo+ctx+body を直接呼ぶ本テストの形に乗らない)。can() レベルは permissions.test.ts が全組合せを
  // 固めているため、ここではダミーにして GATED_ACTIONS から除外する (HTTP ゲートは app 統合の範疇)。
  'agent.invoke': async () => ({ ok: true, status: 200, body: null }),
};

// 実 handler を各ロールで叩いて検証する action (agent.invoke は handler 関数を持たないため除外 / 上記)。
const GATED_ACTIONS: Action[] = [
  'member.invite',
  'backlog.reorder',
  'epic.write',
  'sprint.goal',
  'sprint.manage',
  'estimation.facilitate',
  'estimation.vote',
  'estimation.adopt',
  'ticket.write',
];

describe('権限マトリクス強制 (action × role を実際に handler で踏む)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  for (const action of GATED_ACTIONS) {
    const allowed = rolesFor(action); // MATRIX 単一ソース由来 (admin + 許可ロール)
    for (const role of ALL_ROLES) {
      const shouldAllow = allowed.includes(role);
      it(`${action} × ${role} → ${shouldAllow ? '許可(2xx)' : '拒否(403)'}`, async () => {
        // 組合せごとに fresh repo (invite 409 / 二重開始 409 など state bleed を避ける)。
        repo = createMemoryRepoContainer();
        const res = await DRIVERS[action](repo, ctxFor(role));
        if (shouldAllow) {
          expect(res.ok).toBe(true);
          if (!res.ok) return;
          expect([200, 201]).toContain(res.status);
        } else {
          expect(res.ok).toBe(false);
          if (res.ok) return;
          expect(res.status).toBe(403);
        }
      });
    }
  }
});

describe('role 未確定 (Workspace 未解決) は全 gated handler で 403 (防御の深さ)', () => {
  // ctx.role を欠落させた = workspaceMiddleware が role を set できていない状況。can() は undefined を
  // 常に false にするので、全 gated action が 403 で弾かれること (ticket.write の足場含む) を実 handler で踏む。
  const NO_ROLE: HandlerContext = { workspaceId: WS, user: { userId: 'u-norole', email: 'norole@x.com' } };
  for (const action of GATED_ACTIONS) {
    it(`${action} × role未確定 → 403`, async () => {
      const repo = createMemoryRepoContainer();
      const res = await DRIVERS[action](repo, NO_ROLE);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(403);
    });
  }
});

describe('拒否メッセージの妥当性 (わかりやすく・誰なら可能か が伝わる)', () => {
  // ロール名の日本語表記 (message に最低 1 つは許可ロール名が現れることを確認する)。
  const ROLE_LABEL: Record<Exclude<Role, 'admin'>, string> = { po: 'PO', sm: 'SM', dev: 'Dev' };

  for (const action of GATED_ACTIONS) {
    const allowed = rolesFor(action);
    // この action を確実に拒否されるロールを 1 つ選ぶ (admin は必ず許可なので除外)。
    const deniedRole = ALL_ROLES.find((r) => r !== 'admin' && !allowed.includes(r));
    if (!deniedRole) continue; // 全ロール許可 (該当なし) はスキップ

    it(`${action}: 拒否 body が error/action/requiredRoles/message を備える`, async () => {
      const repo = createMemoryRepoContainer();
      const res = await DRIVERS[action](repo, ctxFor(deniedRole));
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(403);
      // forbidden() の構造化 body。respond() がそのまま JSON 化し web がトーストに使う。
      const body = res.body as { error?: string; action?: string; requiredRoles?: string[]; message?: string };
      expect(body.error).toBe('forbidden');
      expect(body.action).toBe(action);
      // requiredRoles は MATRIX 単一ソース (rolesFor) と一致 = 表とドリフトしない。
      expect(body.requiredRoles).toEqual(allowed);
      // message は空でない文字列で、許可ロール (admin 除く) の日本語名を最低 1 つ含む = 「誰なら可能か」が読める。
      expect(typeof body.message).toBe('string');
      expect((body.message ?? '').length).toBeGreaterThan(0);
      const labels = allowed.filter((r): r is Exclude<Role, 'admin'> => r !== 'admin').map((r) => ROLE_LABEL[r]);
      const hasRoleHint = labels.some((label) => (body.message ?? '').includes(label)) || (body.message ?? '').includes('管理者');
      expect(hasRoleHint).toBe(true);
    });
  }
});
