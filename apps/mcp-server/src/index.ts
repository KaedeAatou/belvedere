#!/usr/bin/env node
// Belvedere MCP server — stdio entry (HTTP クライアント版 / 2026-06-17)
//
// この MCP server は Belvedere HTTP API (Cloud Run) のクライアントとして動く。
// Firestore を直接触らず、API の認証 (サービストークン) / workspace-scope / IDOR ガードを
// 必ず通る。よってデプロイ済み web と同じ dev Firestore のデータを読み書きできる。
//
// 必要な env (Claude Code の mcp 設定で渡す):
//   BELVEDERE_API_BASE_URL  API のベース URL (省略時 dev: belvedere-api-dev-...run.app)
//   BELVEDERE_MCP_TOKEN     API の MCP サービストークン (Secret Manager 管理。必須)
//   WORKSPACE_ID            操作対象 workspace (省略時 ws-belvedere)
//
// 登録例 (詳細は docs/setup-mcp.md):
//   claude mcp add belvedere -- node /path/to/apps/mcp-server/dist/index.js
//   (env は mcp 設定 / シェルから BELVEDERE_MCP_TOKEN 等を渡す)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createBelvedereMcp } from './server';

const DEFAULT_API_BASE_URL = 'https://belvedere-api-dev-cpszmcqmuq-an.a.run.app';

async function main(): Promise<void> {
  const baseUrl = process.env.BELVEDERE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const token = process.env.BELVEDERE_MCP_TOKEN ?? '';
  const workspaceId = process.env.WORKSPACE_ID ?? 'ws-belvedere';

  const mcp = createBelvedereMcp({ baseUrl, token, workspaceId });

  const server = new Server(
    { name: 'belvedere', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcp.listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await mcp.callTool(name, (args as Record<string, unknown>) ?? {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr に起動完了を出す (stdout は MCP メッセージ専用)
  console.error(
    `[belvedere-mcp] stdio server ready (api=${baseUrl} workspace=${workspaceId} token=${token ? 'set' : 'MISSING'})`,
  );
}

main().catch((e) => {
  console.error('[belvedere-mcp][fatal]', e);
  process.exit(1);
});
