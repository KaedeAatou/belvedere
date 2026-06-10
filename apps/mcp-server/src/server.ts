// MCP server handler — listTools / callTool ロジック
// stdio / HTTP transport 共通で使うハンドラ実装。

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runAgent, buildSystemPrompt, buildRegistry } from '@belvedere/agent';
import { createLLMProvider } from '@belvedere/llm';
import { buildTools } from '@belvedere/tools';
import { createRepoContainer, type TicketQuery } from '@belvedere/repo';
import type {
  AgentName,
  Status,
  Ritual,
  Priority,
  ValueImpact,
  Ticket,
  Epic,
} from '@belvedere/shared';
import { generateId, applyStatusTransition } from '@belvedere/shared';
import { MCP_TOOLS } from './tools';

// シングルトン (リクエスト毎に再初期化しない)
// MCP server は単一ユーザー (Claude Code ホスト) 経由なので、単一 Workspace 前提でよい。
// WORKSPACE_ID env で切替可能 (Phase 1-B / 2026-06-10)。
const llm = createLLMProvider(process.env.LLM_PROVIDER);
const repo = await createRepoContainer(process.env.REPO_BACKEND);
const workspaceId = process.env.WORKSPACE_ID ?? 'ws-belvedere';
const internalTools = buildTools(repo, workspaceId);
const registry = buildRegistry(internalTools);

export function listTools() {
  return MCP_TOOLS;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    switch (name) {
      // ========== 読み取り系 ==========
      case 'belvedere_ticket_list': {
        const q: TicketQuery = { workspaceId };
        if (typeof args.sprintId === 'string') q.sprintId = args.sprintId;
        if (typeof args.status === 'string') q.status = args.status as Status;
        if (typeof args.projectId === 'string') q.projectId = args.projectId;
        if (typeof args.assigneeId === 'string') q.assigneeId = args.assigneeId;
        if (typeof args.ritual === 'string') q.ritual = args.ritual as Ritual;
        const tickets = await repo.tickets.list(q);
        return textResult(JSON.stringify({ count: tickets.length, tickets }, null, 2));
      }

      case 'belvedere_ticket_get': {
        const id = mustString(args.id, 'id');
        const ticket = await repo.tickets.get(id);
        if (!ticket) return errorResult(`ticket not found: ${id}`);
        // IDOR ガード: 別 workspace のチケットは「存在しない」扱い
        if (ticket.workspaceId !== workspaceId) return errorResult(`ticket not found: ${id}`);
        return textResult(JSON.stringify(ticket, null, 2));
      }

      case 'belvedere_epic_list': {
        const opts: { workspaceId: string; projectId?: string } = { workspaceId };
        if (typeof args.projectId === 'string') opts.projectId = args.projectId;
        const epics = await repo.epics.list(opts);
        return textResult(JSON.stringify({ count: epics.length, epics }, null, 2));
      }

      case 'belvedere_member_list': {
        const members = await repo.members.list({ workspaceId });
        return textResult(JSON.stringify({ count: members.length, members }, null, 2));
      }

      case 'belvedere_quality_check': {
        const ticketId = mustString(args.ticketId, 'ticketId');
        const tool = internalTools.find((t) => t.spec.name === 'ticket.quality.check');
        if (!tool) return errorResult('ticket.quality.check tool not registered');
        const result = await tool.invoke({ ticketId });
        return textResult(JSON.stringify(result, null, 2));
      }

      case 'belvedere_refinement_check': {
        const tool = internalTools.find((t) => t.spec.name === 'backlog.refinement.check');
        if (!tool) return errorResult('backlog.refinement.check tool not registered');
        const result = await tool.invoke(args);
        return textResult(JSON.stringify(result, null, 2));
      }

      // ========== Agent invoke ==========
      case 'belvedere_invoke_agent': {
        const agentName = mustString(args.agent, 'agent') as AgentName;
        const prompt = mustString(args.prompt, 'prompt');
        const validAgents: AgentName[] = [
          'orchestrator',
          'planner',
          'daily',
          'refinement',
          'reviewer',
          'retrospective',
        ];
        if (!validAgents.includes(agentName)) {
          return errorResult(`invalid agent: ${agentName} (valid: ${validAgents.join(', ')})`);
        }
        const run = await runAgent(
          {
            agentName,
            workspaceId,
            llm,
            model: 'gemini-2.5-pro',
            systemPrompt: buildSystemPrompt(agentName),
            tools: registry,
            trigger: 'human',
          },
          prompt,
        );
        const summary = run.outputArtifacts?.summary ?? '(no output)';
        const meta = {
          status: run.status,
          steps: run.steps.length,
          tokens: { input: run.llmUsage.inputTokens, output: run.llmUsage.outputTokens },
        };
        return textResult(`${summary}\n\n---\n[run summary] ${JSON.stringify(meta)}`);
      }

      // ========== CRUD 系 (Phase 1 で本実装、書込承認はホスト側に委譲) ==========
      case 'belvedere_ticket_create': {
        const title = mustString(args.title, 'title');
        const now = new Date().toISOString();
        const id = (args.id as string) ?? generateId('WC');
        const ticket: Ticket = {
          id,
          workspaceId,
          title,
          status: (args.status as Status) ?? 'backlog',
          priority: (args.priority as Priority) ?? 'medium',
          createdAt: now,
          updatedAt: now,
          createdBy: 'human',
          ...(typeof args.description === 'string' && { description: args.description }),
          ...(typeof args.valueImpact === 'string' && {
            valueImpact: args.valueImpact as ValueImpact,
          }),
          ...(typeof args.ritual === 'string' && { ritual: args.ritual as Ritual }),
          ...(typeof args.sprintId === 'string' && { sprintId: args.sprintId }),
          ...(typeof args.assigneeId === 'string' && { assigneeId: args.assigneeId }),
          ...(typeof args.estimatePt === 'number' && { estimatePt: args.estimatePt }),
          ...(Array.isArray(args.acceptanceCriteria) && {
            acceptanceCriteria: args.acceptanceCriteria as string[],
          }),
          ...(typeof args.parentTicketId === 'string' && {
            parentTicketId: args.parentTicketId,
          }),
          ...(typeof args.projectId === 'string' && { projectId: args.projectId }),
          ...(Array.isArray(args.blockedBy) && { blockedBy: args.blockedBy as string[] }),
          ...(Array.isArray(args.labels) && { labels: args.labels as string[] }),
        };
        await repo.tickets.upsert(ticket);
        return textResult(JSON.stringify({ created: ticket }, null, 2));
      }

      case 'belvedere_ticket_update': {
        const id = mustString(args.id, 'id');
        const patch = (args.patch ?? {}) as Partial<Ticket>;
        const existing = await repo.tickets.get(id);
        if (!existing) return errorResult(`ticket not found: ${id}`);
        const updated: Ticket = {
          ...existing,
          ...patch,
          id: existing.id, // id は変更不可
          updatedAt: new Date().toISOString(),
        };
        await repo.tickets.upsert(updated);
        return textResult(JSON.stringify({ updated }, null, 2));
      }

      case 'belvedere_ticket_status_change': {
        const id = mustString(args.id, 'id');
        const to = mustString(args.to, 'to') as Status;
        const validStatus: Status[] = ['backlog', 'todo', 'in-progress', 'review', 'done'];
        if (!validStatus.includes(to)) {
          return errorResult(`invalid status: ${to} (valid: ${validStatus.join(', ')})`);
        }
        const existing = await repo.tickets.get(id);
        if (!existing) return errorResult(`ticket not found: ${id}`);
        if (existing.workspaceId !== workspaceId) return errorResult(`ticket not found: ${id}`);
        // applyStatusTransition が startedAt (初回 in-progress) / completedAt (初回 done) を自動記録
        const updated = applyStatusTransition(existing, to, new Date().toISOString());
        await repo.tickets.upsert(updated);
        return textResult(JSON.stringify({ from: existing.status, to, ticket: updated }, null, 2));
      }

      case 'belvedere_epic_update': {
        const id = mustString(args.id, 'id');
        const patch = (args.patch ?? {}) as Partial<Epic>;
        const existing = await repo.epics.get(id);
        if (!existing) return errorResult(`epic not found: ${id}`);
        const updated: Epic = {
          ...existing,
          ...patch,
          id: existing.id, // id は変更不可
        };
        await repo.epics.upsert(updated);
        return textResult(JSON.stringify({ updated }, null, 2));
      }

      default:
        return errorResult(`unknown tool: ${name}`);
    }
  } catch (e) {
    const err = e as Error;
    return errorResult(`tool execution failed: ${err.message}`);
  }
}

// ========== ヘルパー ==========

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function mustString(v: unknown, fieldName: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`field "${fieldName}" must be a non-empty string`);
  }
  return v;
}
