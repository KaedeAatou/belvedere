// Belvedere MCP server — local smoke test (HTTP クライアント版 / 2026-06-17)
// 使い方:
//   pnpm --filter @belvedere/mcp-server smoke
//
// in-process で Belvedere API (Hono app / memory backend + mock LLM) を立て、MCP service token で
// 認証する HTTP クライアント MCP を通して全ツールを叩く。これにより「MCP → HTTP → authMiddleware →
// workspaceMiddleware → handler → repo」という実運用と同じ経路をネットワーク無しで踏める。
//
// ⚠️ 状態共有 (順序依存) は意図的: 全 case が同一 repo インスタンスを共有し、実際の使用シーン
// (起票 → 取得 → 更新 → 完了) を 1 本のストーリーとして通す手元確認 / デモ用。case の並べ替え・
// 削除・挿入は他 case を壊しうる。**CI の回帰防止は test/mcp-http.test.ts** (各テスト fresh repo で
// 完全隔離) が主体であり、こちらは「人が読んで全体像を掴む」ためのもの。

import { createApp } from '@belvedere/api/app';
import { createMemoryRepoContainer } from '@belvedere/repo';
import { createLLMProvider } from '@belvedere/llm';
import { createBelvedereMcp } from './server';
import { MCP_TOOLS } from './tools';

const SMOKE_TOKEN = 'smoke-service-token';
// matchesServiceToken は呼び出し時に process.env を読むので、app 生成より前に設定すれば足りる。
process.env.MCP_SERVICE_TOKEN = SMOKE_TOKEN;

const repo = createMemoryRepoContainer();
const llm = createLLMProvider('mock');
const app = createApp({ repo, llm });
const mcp = createBelvedereMcp({
  baseUrl: 'http://localhost',
  token: SMOKE_TOKEN,
  workspaceId: 'ws-belvedere',
  fetch: (req) => app.fetch(req),
});

const listTools = () => mcp.listTools();
const callTool = (name: string, args: Record<string, unknown>) => mcp.callTool(name, args);

interface SmokeCase {
  label: string;
  run: () => Promise<unknown>;
  expect: (result: unknown) => boolean;
}

function header(s: string): void {
  const line = '━'.repeat(Math.max(40, s.length + 4));
  console.log(`\n${line}\n  ${s}\n${line}`);
}

function preview(v: unknown): string {
  const s = JSON.stringify(v);
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

function parse(r: unknown): { parsed: any; isError: boolean; text: string } {
  const v = r as { content: Array<{ text: string }>; isError?: boolean };
  const text = v.content[0]?.text ?? '';
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return { parsed, isError: v.isError === true, text };
}

const EXPECTED_TOOLS = [
  'belvedere_ticket_list',
  'belvedere_ticket_get',
  'belvedere_epic_list',
  'belvedere_member_list',
  'belvedere_quality_check',
  'belvedere_refinement_check',
  'belvedere_sprint_list',
  'belvedere_sprint_current',
  'belvedere_sprint_board',
  'belvedere_invoke_agent',
  'belvedere_ticket_create',
  'belvedere_ticket_update',
  'belvedere_ticket_status_change',
  'belvedere_epic_update',
];

const cases: SmokeCase[] = [
  {
    // 旧 smoke は固定数 (11) を期待して tool 追加時に赤を放置していた。期待 tool 名の
    // superset チェックにして、追加に強く / 欠落 (capability 喪失) は確実に捕まえる。
    label: `listTools() exposes all ${EXPECTED_TOOLS.length} expected tools`,
    run: async () => listTools(),
    expect: (r) => {
      if (!Array.isArray(r)) return false;
      const names = new Set(r.map((t) => (t as { name: string }).name));
      return EXPECTED_TOOLS.every((n) => names.has(n)) && r.length === MCP_TOOLS.length;
    },
  },
  {
    label: 'belvedere_ticket_list returns 12 tickets from seed',
    run: () => callTool('belvedere_ticket_list', {}),
    expect: (r) => parse(r).parsed.count === 12,
  },
  {
    label: 'belvedere_ticket_list filtered by sprintId=sprint-13',
    run: () => callTool('belvedere_ticket_list', { sprintId: 'sprint-13' }),
    expect: (r) => {
      const c = parse(r).parsed.count;
      return c > 0 && c < 12;
    },
  },
  {
    label: 'belvedere_epic_list returns 4 epics with EP-3 rationale empty',
    run: () => callTool('belvedere_epic_list', {}),
    expect: (r) => {
      const { parsed } = parse(r);
      const rationaleSet = parsed.epics.filter(
        (e: { rationale?: string }) => e.rationale && e.rationale.length > 0,
      ).length;
      return parsed.count === 4 && rationaleSet === 3;
    },
  },
  {
    // 注: 初回 API 呼出で MCP サービスプリンシパル (mcp@belvedere.svc) が ws-belvedere の
    // po member に bootstrap されるため、members は seed 5 + service 1 = 6 になる。
    label: 'belvedere_member_list includes 5 seed members (@example.com) + MCP service member',
    run: () => callTool('belvedere_member_list', {}),
    expect: (r) => {
      const { parsed } = parse(r);
      const seedMembers = parsed.members.filter((m: { email: string }) =>
        m.email.endsWith('@example.com'),
      );
      const hasService = parsed.members.some((m: { email: string }) => m.email === 'mcp@belvedere.svc');
      return seedMembers.length === 5 && parsed.count >= 5 && hasService;
    },
  },
  {
    label: 'belvedere_quality_check on WC-101 returns a quality verdict',
    run: () => callTool('belvedere_quality_check', { ticketId: 'WC-101' }),
    expect: (r) => {
      const { parsed } = parse(r);
      return parsed.ticketId === 'WC-101' && Array.isArray(parsed.issues) && typeof parsed.ok === 'boolean';
    },
  },
  {
    label: 'belvedere_refinement_check detects EP-3 strategic_intent_missing',
    run: () => callTool('belvedere_refinement_check', { sprintId: 'sprint-14' }),
    expect: (r) => {
      const findings = parse(r).parsed.findings as Array<{ ticketId: string; signal: string }>;
      return findings.some((f) => f.ticketId === 'EP-3' && f.signal === 'strategic_intent_missing');
    },
  },
  {
    label: 'belvedere_invoke_agent (refinement) runs ReAct loop and returns summary',
    run: () =>
      callTool('belvedere_invoke_agent', { agent: 'refinement', prompt: '次スプリントの診断' }),
    expect: (r) => {
      const { text } = parse(r);
      return text.includes('Refinement') && text.includes('Epic.rationale') && text.includes('EP-3');
    },
  },
  {
    label: 'belvedere_ticket_create creates a new ticket (id auto-generated)',
    run: () =>
      callTool('belvedere_ticket_create', {
        title: 'smoke test ticket',
        priority: 'low',
        valueImpact: 'low',
      }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      if (isError) return false;
      return (
        typeof parsed.created?.id === 'string' &&
        parsed.created.title === 'smoke test ticket' &&
        parsed.created.status === 'backlog'
      );
    },
  },
  {
    label: 'belvedere_ticket_update patches an existing ticket',
    run: () =>
      callTool('belvedere_ticket_update', {
        id: 'WC-101',
        patch: { priority: 'urgent', estimatePt: 8 },
      }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      if (isError) return false;
      return parsed.updated?.priority === 'urgent' && parsed.updated?.estimatePt === 8;
    },
  },
  {
    label: 'belvedere_ticket_status_change moves ticket through status',
    run: () => callTool('belvedere_ticket_status_change', { id: 'WC-102', to: 'in-progress' }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      if (isError) return false;
      return parsed.to === 'in-progress' && parsed.ticket?.status === 'in-progress';
    },
  },
  {
    label: 'belvedere_epic_update fills EP-3 rationale (resolves strategic_intent_missing)',
    run: () =>
      callTool('belvedere_epic_update', {
        id: 'EP-3',
        patch: { rationale: 'CI/CD 信頼化の戦略意図 (smoke test 経由でセット)' },
      }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      if (isError) return false;
      return typeof parsed.updated?.rationale === 'string' && parsed.updated.rationale.includes('CI/CD');
    },
  },
  {
    label: 'belvedere_ticket_get returns WC-101 detail',
    run: () => callTool('belvedere_ticket_get', { id: 'WC-101' }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      return !isError && parsed.id === 'WC-101' && typeof parsed.title === 'string';
    },
  },
  {
    label: 'belvedere_sprint_list returns 3 seed sprints (12/13/14)',
    run: () => callTool('belvedere_sprint_list', {}),
    expect: (r) => {
      const { parsed } = parse(r);
      const ids = new Set((parsed.sprints as Array<{ id: string }>).map((s) => s.id));
      return parsed.count >= 3 && ['sprint-12', 'sprint-13', 'sprint-14'].every((id) => ids.has(id));
    },
  },
  {
    label: 'belvedere_sprint_current returns sprint-13 (the active one)',
    run: () => callTool('belvedere_sprint_current', {}),
    expect: (r) => {
      const { parsed } = parse(r);
      return parsed.current?.id === 'sprint-13' && parsed.current?.status === 'active';
    },
  },
  {
    label: 'belvedere_sprint_board returns sprint-13 with byStatus groups + bugCount',
    run: () => callTool('belvedere_sprint_board', {}),
    expect: (r) => {
      const { parsed } = parse(r);
      return (
        parsed.sprint?.id === 'sprint-13' &&
        typeof parsed.byStatus === 'object' &&
        Array.isArray(parsed.byStatus['in-progress']) &&
        typeof parsed.bugCount === 'number'
      );
    },
  },
  {
    // bugfix サイクルの核: current sprint に type=bug を起票 → type=bug フィルタで取得できる。
    // (旧 smoke #16 はここが赤だった = create が type を載せていなかった。HTTP 経由で API の
    //  zod (type 受理) を通すことで根治。)
    label: 'belvedere_ticket_create(type=bug) → ticket_list(type=bug) が取得できる',
    run: async () => {
      const before = await callTool('belvedere_ticket_list', { type: 'bug', sprintId: 'sprint-13' });
      await callTool('belvedere_ticket_create', {
        title: 'smoke bug in current sprint',
        type: 'bug',
        sprintId: 'sprint-13',
      });
      const after = await callTool('belvedere_ticket_list', { sprintId: 'sprint-13', type: 'bug' });
      return { before, after };
    },
    expect: (r) => {
      const { before, after } = r as { before: unknown; after: unknown };
      return parse(before).parsed.count === 0 && parse(after).parsed.count >= 1;
    },
  },
  {
    // 案A: type=story は親 Epic 必須。同一 workspace に実在する EP-1 を渡せば 201。
    label: 'belvedere_ticket_create(type=story, epicId=EP-1) が起票できる',
    run: () =>
      callTool('belvedere_ticket_create', {
        title: 'smoke story with epic',
        type: 'story',
        epicId: 'EP-1',
      }),
    expect: (r) => {
      const { parsed, isError } = parse(r);
      if (isError) return false;
      return parsed.created?.type === 'story' && parsed.created?.epicId === 'EP-1';
    },
  },
  {
    // 案A: epicId 無しの story は API が 400 (epic_required) を返す。
    label: 'belvedere_ticket_create(type=story) は epicId 無しだとエラー',
    run: () => callTool('belvedere_ticket_create', { title: 'smoke story no epic', type: 'story' }),
    expect: (r) => parse(r).isError,
  },
  {
    label: 'belvedere_ticket_update returns error for unknown ticket (404)',
    run: () => callTool('belvedere_ticket_update', { id: 'WC-NONEXISTENT', patch: { title: 'x' } }),
    expect: (r) => parse(r).isError,
  },
  {
    label: 'unknown tool returns error',
    run: () => callTool('belvedere_nonexistent', {}),
    expect: (r) => parse(r).isError,
  },
];

async function main(): Promise<void> {
  header('Belvedere MCP server smoke test (HTTP client → in-process API)');
  let pass = 0;
  let fail = 0;

  for (const [i, c] of cases.entries()) {
    const num = `[${(i + 1).toString().padStart(2, '0')}/${cases.length}]`;
    try {
      const result = await c.run();
      if (c.expect(result)) {
        console.log(`${num} ✅ ${c.label}`);
        pass++;
      } else {
        console.log(`${num} ❌ ${c.label}`);
        console.log(`     got: ${preview(result)}`);
        fail++;
      }
    } catch (e) {
      console.log(`${num} 💥 ${c.label}`);
      console.log(`     threw: ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\n──── result: ${pass} pass / ${fail} fail (of ${cases.length}) ────\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[smoke][fatal]', e);
  process.exit(1);
});
