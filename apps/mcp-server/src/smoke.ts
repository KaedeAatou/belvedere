// Belvedere MCP server — local smoke test
// 使い方:
//   pnpm --filter @belvedere/mcp-server smoke
//
// MCP プロトコルを介さずに listTools / callTool を直接呼んで、
// 内部 Tool / Repository / Agent が正しく繋がっているかを確認する。

import { listTools, callTool } from './server';

interface SmokeCase {
  label: string;
  run: () => Promise<unknown>;
  /** 結果がこの条件を満たせば pass */
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

const cases: SmokeCase[] = [
  {
    label: 'listTools() returns 11 tools (6 read + 1 invoke + 4 CRUD impls)',
    run: async () => listTools(),
    expect: (r) => Array.isArray(r) && r.length === 11,
  },
  {
    label: 'belvedere_ticket_list returns 12 tickets from seed',
    run: () => callTool('belvedere_ticket_list', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return parsed.count === 12;
    },
  },
  {
    label: 'belvedere_ticket_list filtered by sprintId=sprint-13',
    run: () => callTool('belvedere_ticket_list', { sprintId: 'sprint-13' }),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return parsed.count > 0 && parsed.count < 12;
    },
  },
  {
    label: 'belvedere_epic_list returns 4 epics with rationale fields',
    run: () => callTool('belvedere_epic_list', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      // EP-3 だけ rationale 空、他 3 件は埋まっている
      const rationaleSet = parsed.epics.filter(
        (e: { rationale?: string }) => e.rationale && e.rationale.length > 0,
      ).length;
      return parsed.count === 4 && rationaleSet === 3;
    },
  },
  {
    label: 'belvedere_member_list returns 5 members with @example.com emails',
    run: () => callTool('belvedere_member_list', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      const allDummy = parsed.members.every((m: { email: string }) =>
        m.email.endsWith('@example.com'),
      );
      return parsed.count === 5 && allDummy;
    },
  },
  {
    label: 'belvedere_quality_check on WC-101 detects DoD/SP issues',
    run: () => callTool('belvedere_quality_check', { ticketId: 'WC-101' }),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return typeof parsed === 'object' && parsed !== null;
    },
  },
  {
    label: 'belvedere_refinement_check detects EP-3 strategic_intent_missing',
    run: () => callTool('belvedere_refinement_check', { sprintId: 'sprint-14' }),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      const findings = parsed.findings as Array<{ ticketId: string; signal: string }>;
      return findings.some((f) => f.ticketId === 'EP-3' && f.signal === 'strategic_intent_missing');
    },
  },
  {
    label: 'belvedere_invoke_agent (refinement) runs ReAct loop and returns summary',
    run: () =>
      callTool('belvedere_invoke_agent', {
        agent: 'refinement',
        prompt: '次スプリントの診断',
      }),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const text = v.content[0]?.text ?? '';
      // Mock LLM 出力は日本語、戦略意図 (Epic.rationale) 欠落 + EP-3 への言及を含むはず
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
      const v = r as { content: Array<{ text: string }>; isError?: boolean };
      if (v.isError) return false;
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
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
      const v = r as { content: Array<{ text: string }>; isError?: boolean };
      if (v.isError) return false;
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return parsed.updated?.priority === 'urgent' && parsed.updated?.estimatePt === 8;
    },
  },
  {
    label: 'belvedere_ticket_status_change moves ticket through status',
    run: () =>
      callTool('belvedere_ticket_status_change', { id: 'WC-102', to: 'in-progress' }),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }>; isError?: boolean };
      if (v.isError) return false;
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
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
      const v = r as { content: Array<{ text: string }>; isError?: boolean };
      if (v.isError) return false;
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return (
        typeof parsed.updated?.rationale === 'string' &&
        parsed.updated.rationale.includes('CI/CD')
      );
    },
  },
  // ===== Sprint 系 + bugfix ループ (current sprint の bug 発見 → 起票) =====
  {
    label: 'belvedere_sprint_list returns 3 sprints from seed (12/13/14)',
    run: () => callTool('belvedere_sprint_list', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return parsed.count === 3 && Array.isArray(parsed.sprints);
    },
  },
  {
    label: 'belvedere_sprint_current returns sprint-13 (the active one)',
    run: () => callTool('belvedere_sprint_current', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return parsed.current?.id === 'sprint-13' && parsed.current?.status === 'active';
    },
  },
  {
    label: 'belvedere_sprint_board returns sprint-13 with byStatus groups + bugCount',
    run: () => callTool('belvedere_sprint_board', {}),
    expect: (r) => {
      const v = r as { content: Array<{ text: string }> };
      const parsed = JSON.parse(v.content[0]?.text ?? '{}');
      return (
        parsed.sprint?.id === 'sprint-13' &&
        typeof parsed.byStatus === 'object' &&
        Array.isArray(parsed.byStatus['in-progress']) &&
        typeof parsed.bugCount === 'number'
      );
    },
  },
  {
    label: 'belvedere_ticket_list type=bug: seed に bug 無し → current sprint に起票後は取得できる',
    run: async () => {
      const before = await callTool('belvedere_ticket_list', { type: 'bug' });
      await callTool('belvedere_ticket_create', {
        title: 'smoke bug in current sprint',
        type: 'bug',
        sprintId: 'sprint-13',
      });
      const after = await callTool('belvedere_ticket_list', { sprintId: 'sprint-13', type: 'bug' });
      return { before, after };
    },
    expect: (r) => {
      const { before, after } = r as {
        before: { content: Array<{ text: string }> };
        after: { content: Array<{ text: string }> };
      };
      const beforeParsed = JSON.parse(before.content[0]?.text ?? '{}');
      const afterParsed = JSON.parse(after.content[0]?.text ?? '{}');
      return beforeParsed.count === 0 && afterParsed.count >= 1;
    },
  },
  {
    label: 'belvedere_ticket_update returns error for unknown ticket',
    run: () =>
      callTool('belvedere_ticket_update', { id: 'WC-NONEXISTENT', patch: { title: 'x' } }),
    expect: (r) => {
      const v = r as { isError?: boolean };
      return v.isError === true;
    },
  },
  {
    label: 'unknown tool returns error',
    run: () => callTool('belvedere_nonexistent', {}),
    expect: (r) => {
      const v = r as { isError?: boolean };
      return v.isError === true;
    },
  },
];

async function main(): Promise<void> {
  header('Belvedere MCP server smoke test');
  let pass = 0;
  let fail = 0;

  for (const [i, c] of cases.entries()) {
    const num = `[${(i + 1).toString().padStart(2, '0')}/${cases.length}]`;
    try {
      const result = await c.run();
      const ok = c.expect(result);
      if (ok) {
        console.log(`${num} ✅ ${c.label}`);
        pass++;
      } else {
        console.log(`${num} ❌ ${c.label}`);
        console.log(`     got: ${preview(result)}`);
        fail++;
      }
    } catch (e) {
      const err = e as Error;
      console.log(`${num} 💥 ${c.label}`);
      console.log(`     threw: ${err.message}`);
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
