// MCP HTTP クライアント ↔ Belvedere API の統合テスト (CI / 2026-06-17)。
//
// 「単体・smoke は緑なのに使うとバグ」を構造的に防ぐため、MCP の実運用経路
// (MCP tool → HTTP → authMiddleware(service token) → workspaceMiddleware → handler → repo) を
// in-process Hono app (memory backend + mock LLM) に対してそのまま踏む。ネットワーク不要。
//
// .claude/rules/testing.md 準拠:
//  - 実データ状態 (seed) を踏む / 退化入力 (不正トークン・別 workspace・存在しない id) を含める
//  - bugfix サイクル (type=bug 起票→取得→done) を再現テストとして固定 (旧 smoke #16 の回帰防止)
//  - テストごとに fresh app (状態を共有しない)

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '@belvedere/api/app';
import { createMemoryRepoContainer, type RepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';
import type { Ticket } from '@belvedere/shared';
import { createBelvedereMcp, type BelvedereMcp } from '../src/server';

// 注: 「誤ったトークン / env 未設定 → 401」は API authMiddleware が Firebase verifyIdToken に
// 落ちる経路で、CI に ADC が無いとハングする。この検証は firebase-admin をモックできる
// apps/api 側 (test/app-auth.test.ts) に集約した。ここ (mcp-server) では Firebase 依存の経路を踏まず、
// MCP クライアントが API の 401 を isError として返すことは「401 を返す fetch を注入」して検証する。

const TOKEN = 'test-service-token';

function makeMcp(repo: RepoContainer, opts: { token?: string; workspaceId?: string } = {}): BelvedereMcp {
  const llm = createLLMProvider('mock');
  const app = createApp({ repo, llm });
  return createBelvedereMcp({
    baseUrl: 'http://localhost',
    token: opts.token ?? TOKEN,
    workspaceId: opts.workspaceId ?? 'ws-belvedere',
    fetch: (req) => app.fetch(req),
  });
}

// CallToolResult を { parsed, isError, text } に展開する。
function read(r: Awaited<ReturnType<BelvedereMcp['callTool']>>): { parsed: any; isError: boolean; text: string } {
  const text = (r.content[0] as { text?: string } | undefined)?.text ?? '';
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return { parsed, isError: r.isError === true, text };
}

describe('MCP HTTP ↔ API: 認証 (service token)', () => {
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
  });

  it('正しいサービストークン → ticket_list が seed 12 件を返す', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(false);
    expect(res.parsed.count).toBe(12);
  });

  it('トークン未設定 → HTTP を投げる前にガードエラー (Firebase 経路に行かない)', async () => {
    const mcp = makeMcp(repo, { token: '' });
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('BELVEDERE_MCP_TOKEN');
  });
});

describe('MCP HTTP ↔ API: マルチテナント / IDOR', () => {
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
  });

  it('サービスプリンシパルが未所属の workspace を X-Workspace-Id 指定 → 403', async () => {
    const mcp = makeMcp(repo, { workspaceId: 'ws-attacker' });
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('403');
  });

  it('存在しない ticket id を get → 404', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_ticket_get', { id: 'WC-NOPE' }));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('404');
  });

  it('別 workspace の ticket を get → 404 (存在しない扱い / IDOR ガード)', async () => {
    const now = new Date().toISOString();
    const attackerTicket: Ticket = {
      id: 'WC-ATTACK',
      workspaceId: 'ws-attacker',
      title: 'secret of another tenant',
      status: 'backlog',
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      createdBy: 'human',
    };
    await repo.tickets.upsert(attackerTicket);
    const mcp = makeMcp(repo); // ws-belvedere スコープ
    const res = read(await mcp.callTool('belvedere_ticket_get', { id: 'WC-ATTACK' }));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('404');
  });
});

describe('MCP HTTP ↔ API: bugfix サイクル (web 指摘 → 取得 → 修正 → 完了 の再現)', () => {
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
  });

  it('type=bug を current sprint に起票 → type=bug で取得 → done に遷移できる', async () => {
    const mcp = makeMcp(repo);

    // 起票前: current sprint に bug は無い
    const before = read(await mcp.callTool('belvedere_ticket_list', { type: 'bug', sprintId: 'sprint-13' }));
    expect(before.isError).toBe(false);
    expect(before.parsed.count).toBe(0);

    // 起票: type=bug (旧 smoke #16 の根因 = create が type を載せていなかった の回帰防止)
    const created = read(
      await mcp.callTool('belvedere_ticket_create', {
        title: 'reorder で 1 件だけ先頭にジャンプする',
        type: 'bug',
        sprintId: 'sprint-13',
        description: '再現手順: 区画内に orderIndex 未設定の隣接行を作り d&d する',
      }),
    );
    expect(created.isError).toBe(false);
    expect(created.parsed.created.type).toBe('bug');
    const bugId: string = created.parsed.created.id;

    // 取得: type=bug フィルタで 1 件以上
    const after = read(await mcp.callTool('belvedere_ticket_list', { type: 'bug', sprintId: 'sprint-13' }));
    expect(after.parsed.count).toBeGreaterThanOrEqual(1);
    expect((after.parsed.tickets as Ticket[]).some((t) => t.id === bugId)).toBe(true);

    // 完了: done に遷移 → completedAt が自動記録される
    const done = read(await mcp.callTool('belvedere_ticket_status_change', { id: bugId, to: 'done' }));
    expect(done.isError).toBe(false);
    expect(done.parsed.to).toBe('done');
    expect(done.parsed.ticket.status).toBe('done');
    expect(typeof done.parsed.ticket.completedAt).toBe('string');

    // 取得し直して done が永続していることを確認
    const fetched = read(await mcp.callTool('belvedere_ticket_get', { id: bugId }));
    expect(fetched.parsed.status).toBe('done');
  });

  it('ticket_update で部分更新 (priority / estimatePt) ができる', async () => {
    const mcp = makeMcp(repo);
    const res = read(
      await mcp.callTool('belvedere_ticket_update', {
        id: 'WC-101',
        patch: { priority: 'urgent', estimatePt: 8 },
      }),
    );
    expect(res.isError).toBe(false);
    expect(res.parsed.updated.priority).toBe('urgent');
    expect(res.parsed.updated.estimatePt).toBe(8);
  });
});

describe('MCP HTTP ↔ API: 読み取り + 診断ツール', () => {
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
  });

  it('sprint_current が active な sprint-13 を返す', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_sprint_current', {}));
    expect(res.parsed.current.id).toBe('sprint-13');
    expect(res.parsed.current.status).toBe('active');
  });

  it('sprint_board が byStatus グループ + bugCount を返す', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_sprint_board', {}));
    expect(res.parsed.sprint.id).toBe('sprint-13');
    expect(Array.isArray(res.parsed.byStatus['in-progress'])).toBe(true);
    expect(typeof res.parsed.bugCount).toBe('number');
  });

  it('epic_list が 4 件、quality_check が WC-101 の判定を返す', async () => {
    const mcp = makeMcp(repo);
    const epics = read(await mcp.callTool('belvedere_epic_list', {}));
    expect(epics.parsed.count).toBe(4);
    const quality = read(await mcp.callTool('belvedere_quality_check', { ticketId: 'WC-101' }));
    expect(quality.parsed.ticketId).toBe('WC-101');
    expect(Array.isArray(quality.parsed.issues)).toBe(true);
  });

  it('refinement_check が EP-3 の strategic_intent_missing を検出する (6 観点が保たれている)', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_refinement_check', {}));
    const findings = res.parsed.findings as Array<{ ticketId: string; signal: string }>;
    expect(findings.some((f) => f.ticketId === 'EP-3' && f.signal === 'strategic_intent_missing')).toBe(true);
  });

  it('ticket_list の type=bug フィルタは seed の非 bug を除外する (seed に bug は無い)', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_ticket_list', { type: 'bug' }));
    expect(res.parsed.count).toBe(0);
  });

  it('別 workspace の ticket の quality を取得 → 404 (IDOR ガード / 新エンドポイント)', async () => {
    const now = new Date().toISOString();
    await repo.tickets.upsert({
      id: 'WC-ATTACK-Q',
      workspaceId: 'ws-attacker',
      title: 'secret',
      status: 'backlog',
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      createdBy: 'human',
    });
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_quality_check', { ticketId: 'WC-ATTACK-Q' }));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('404');
  });
});

describe('MCP HTTP ↔ API: invoke_agent (AgentRun → summary/meta 変換)', () => {
  let repo: RepoContainer;
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = TOKEN;
    repo = createMemoryRepoContainer();
  });

  it('invoke_agent(refinement) → summary 本文 + [run summary] meta (status/steps/tokens) を返す', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_invoke_agent', { agent: 'refinement', prompt: '次スプリントの診断' }));
    expect(res.isError).toBe(false);
    // textResult なので JSON ではなく文字列。summary 本文 + meta が含まれる。
    expect(res.text).toContain('[run summary]');
    // server.ts が AgentRun の status/steps.length/llmUsage を正しく読めているかを meta で検証。
    const metaStr = res.text.split('[run summary]')[1]?.trim() ?? '{}';
    const meta = JSON.parse(metaStr) as { status?: string; steps?: number; tokens?: { input: number; output: number } };
    expect(typeof meta.status).toBe('string');
    expect(typeof meta.steps).toBe('number');
    expect(meta.tokens).toBeDefined();
    expect(typeof meta.tokens?.input).toBe('number');
  });

  it('invoke_agent: 不正な agent 名は HTTP を投げる前にエラー', async () => {
    const mcp = makeMcp(repo);
    const res = read(await mcp.callTool('belvedere_invoke_agent', { agent: 'wizard', prompt: 'x' }));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('invalid agent');
  });
});

describe('MCP HTTP ↔ API: fetch エラー経路 (実ネットワーク失敗時の挙動)', () => {
  // in-process app.fetch ではネットワーク失敗を踏めないので、失敗する fetch を注入して
  // server.ts のエラーハンドリング (catch → errorResult / 非2xx → fail) を直接検証する。
  it('fetch が throw (DNS/接続失敗相当) → クラッシュせず errorResult を返す', async () => {
    const mcp = createBelvedereMcp({
      baseUrl: 'https://unreachable.invalid',
      token: TOKEN,
      workspaceId: 'ws-belvedere',
      fetch: () => {
        throw new TypeError('fetch failed: network down');
      },
    });
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('network down');
  });

  it('API が 500 を返す → isError + ステータスを含むメッセージ', async () => {
    const mcp = createBelvedereMcp({
      baseUrl: 'https://x.invalid',
      token: TOKEN,
      workspaceId: 'ws-belvedere',
      fetch: () => new Response('{"error":"boom"}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
    });
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('500');
  });

  it('API が 401 を返す (誤トークン/未認証相当) → MCP は isError で 401 を surface する', async () => {
    // 実 Firebase 経路を踏まずに「API が 401 を返したとき MCP がどう振る舞うか」だけを検証する。
    const mcp = createBelvedereMcp({
      baseUrl: 'https://x.invalid',
      token: 'whatever',
      workspaceId: 'ws-belvedere',
      fetch: () => new Response('{"error":"invalid_token"}', { status: 401, headers: { 'Content-Type': 'application/json' } }),
    });
    const res = read(await mcp.callTool('belvedere_ticket_list', {}));
    expect(res.isError).toBe(true);
    expect(res.text).toContain('401');
    expect(res.text).toContain('invalid_token');
  });
});
