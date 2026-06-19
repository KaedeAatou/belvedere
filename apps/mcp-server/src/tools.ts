// Belvedere MCP Tool 定義 (MCP SDK 形式)
// Phase 1: 読み取り 5 + Agent invoke。CRUD 系は Phase 2 で実装。

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const MCP_TOOLS: Tool[] = [
  // ========== 読み取り系 (Phase 1 実装) ==========
  {
    name: 'belvedere_ticket_list',
    description:
      'Belvedere のチケット一覧を取得する。sprintId / status / projectId / assigneeId / ritual / type で絞り込み可。type === "bug" で bug だけ抽出できる。',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: '例: "sprint-13"' },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        },
        projectId: { type: 'string', description: '例: "PRJ-belvedere-core"' },
        assigneeId: { type: 'string' },
        ritual: {
          type: 'string',
          enum: ['planning', 'daily', 'refinement', 'review', 'retrospective'],
        },
        type: {
          type: 'string',
          enum: ['story', 'task', 'spike', 'bug', 'incident'],
          description: 'チケット種別。"bug" 指定で current sprint の bug 抽出に使う。',
        },
      },
    },
  },
  {
    name: 'belvedere_ticket_get',
    description: '指定 ID のチケット詳細を取得する。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '例: "WC-105"' } },
      required: ['id'],
    },
  },
  {
    name: 'belvedere_epic_list',
    description:
      'Belvedere の Epic 一覧を取得する (rationale / successMetric / strategicTheme 含む)。Refinement 第6観点で参照される戦略意図を確認する用。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
    },
  },
  {
    name: 'belvedere_member_list',
    description: 'チームメンバ一覧を取得する。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'belvedere_quality_check',
    description:
      '指定チケットの DoD / Story Point / User Story 紐付け / valueImpact の充足状況を診断する。',
    inputSchema: {
      type: 'object',
      properties: { ticketId: { type: 'string' } },
      required: ['ticketId'],
    },
  },
  {
    name: 'belvedere_refinement_check',
    description:
      'バックログを 6 観点 (粒度 / 依存 / valueImpact / priority×valueImpact / SP分散 / 戦略整合性) で診断する。',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string' },
        projectId: { type: 'string' },
      },
    },
  },

  // ========== Sprint 系 (bugfix ループの起点) ==========
  {
    name: 'belvedere_sprint_list',
    description:
      'スプリント一覧を取得する (id / number / name / goal / status / velocity)。current sprint は status === "active"。status で絞り込み可。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['planned', 'active', 'completed', 'cancelled'],
        },
      },
    },
  },
  {
    name: 'belvedere_sprint_current',
    description:
      '現行スプリント (status === "active") を 1 件返す。bugfix ループの起点。無ければ { current: null, hint } を返す。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'belvedere_sprint_board',
    description:
      '現行スプリント + 配下チケットを status 別 (backlog / todo / in-progress / review / done) にまとめ、bug 一覧も添えて返す。1 コールで bugfix の起点 (どの bug が current sprint にあるか) が揃う。',
    inputSchema: { type: 'object', properties: {} },
  },

  // ========== Agent invoke ==========
  {
    name: 'belvedere_invoke_agent',
    description:
      '5 儀式エージェント (planner / daily / refinement / reviewer / retrospective) または orchestrator を呼び出す。Tool 呼び出しループ (ReAct) を回して構造化された結果を返す。',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['orchestrator', 'planner', 'daily', 'refinement', 'reviewer', 'retrospective'],
        },
        prompt: { type: 'string', description: '日本語のユーザー指示文' },
      },
      required: ['agent', 'prompt'],
    },
  },

  // ========== CRUD 系 (Phase 1 で本実装、書込承認はホスト側に委譲) ==========
  {
    name: 'belvedere_ticket_create',
    description:
      'チケットを新規起票する。id 省略時は自動採番。書込承認はホスト (Claude Code) の標準ツール承認 UI に委譲。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        type: {
          type: 'string',
          enum: ['story', 'task', 'spike', 'bug', 'incident'],
          description: 'チケット種別。bug を起票する時は "bug" を指定する (bugfix ループの起点)。',
        },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        valueImpact: { type: 'string', enum: ['low', 'medium', 'high'] },
        ritual: {
          type: 'string',
          enum: ['planning', 'daily', 'refinement', 'review', 'retrospective'],
        },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        },
        sprintId: { type: 'string' },
        assigneeId: { type: 'string' },
        estimatePt: { type: 'number' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        parentTicketId: { type: 'string' },
        epicId: {
          type: 'string',
          description:
            '親 Epic の ID (例: "EP-1")。type === "story" を新規起票する時は必須。同一 workspace に実在する Epic を指定する (実在しない id は API が 400)。',
        },
        projectId: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        blockedBy: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
  },
  {
    name: 'belvedere_ticket_update',
    description:
      'チケットの編集 (title / description / priority / valueImpact / DoD / SP / assignee / blockedBy 等)。patch オブジェクトで部分更新。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          description: '部分更新オブジェクト。指定したフィールドのみ更新する。',
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'belvedere_ticket_status_change',
    description:
      'チケットのステータス遷移 (backlog → todo → in-progress → review → done)。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        to: {
          type: 'string',
          enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        },
      },
      required: ['id', 'to'],
    },
  },
  {
    name: 'belvedere_epic_update',
    description:
      'Epic の rationale / successMetric / strategicTheme / valueImpact を更新する。Refinement 第6観点で検出された rationale 欠落 Epic を埋める用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            rationale: { type: 'string' },
            successMetric: { type: 'string' },
            strategicTheme: { type: 'string' },
            valueImpact: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
      required: ['id', 'patch'],
    },
  },
];
