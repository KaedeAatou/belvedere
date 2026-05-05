#!/usr/bin/env node
// Belvedere MCP server — stdio entry
//
// 起動方法 (Claude Code から):
//   claude mcp add belvedere stdio "node /path/to/apps/mcp-server/dist/index.js"
//
// または開発時:
//   pnpm --filter @belvedere/mcp-server dev
//
// HTTP mode は Phase 2 で追加予定 (Cloud Run デプロイ用)。

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { callTool, listTools } from './server';

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'belvedere',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await callTool(name, (args as Record<string, unknown>) ?? {});
    return result;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr に起動完了を出す (stdout は MCP メッセージ専用)
  console.error(
    `[belvedere-mcp] stdio server ready (provider=${process.env.LLM_PROVIDER ?? 'mock'} repo=${process.env.REPO_BACKEND ?? 'memory'})`,
  );
}

main().catch((e) => {
  console.error('[belvedere-mcp][fatal]', e);
  process.exit(1);
});
