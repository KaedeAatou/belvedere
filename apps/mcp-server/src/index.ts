#!/usr/bin/env node
// Belvedere MCP server — stdio entry (HTTP クライアント版 / 2026-06-17)
//
// この MCP server は Belvedere HTTP API (Cloud Run) のクライアントとして動く。
// Firestore を直接触らず、API の認証 (サービストークン) / workspace-scope / IDOR ガードを
// 必ず通る。よってデプロイ済み web と同じ dev Firestore のデータを読み書きできる。
//
// 認証は 2 モード (env でどちらかを渡す):
//   A. 本人認証 (推奨・常用): BELVEDERE_REFRESH_TOKEN = web ログイン済みの Firebase refresh token +
//      FIREBASE_API_KEY = Firebase Web API key (公開鍵 / apps/web/nuxt.config.ts と同じ値)。
//      MCP があなた本人として動き、所属する全ワークスペースにアクセスできる。
//   B. サービストークン (提出向けの機械認証): BELVEDERE_MCP_TOKEN = API の MCP_SERVICE_TOKEN と一致する値。
//      ws-belvedere に最小権限 (po) でスコープ。
// 共通 env:
//   BELVEDERE_API_BASE_URL  API のベース URL (省略時 dev: belvedere-api-dev-...run.app)
//   WORKSPACE_ID            操作対象 workspace (省略時 ws-belvedere)
//
// 登録例 (詳細は docs/setup-mcp.md):
//   claude mcp add belvedere --env BELVEDERE_REFRESH_TOKEN=<rt> --env FIREBASE_API_KEY=<key> \
//     --env WORKSPACE_ID=<ws> -- node /path/to/apps/mcp-server/dist/index.js

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
  const refreshToken = process.env.BELVEDERE_REFRESH_TOKEN ?? '';
  // Firebase Web API key は公開鍵だが、鍵を repo にハードコードしないため env で受ける (本人認証時のみ要)。
  const firebaseApiKey = process.env.FIREBASE_API_KEY ?? '';
  const workspaceId = process.env.WORKSPACE_ID ?? 'ws-belvedere';

  const mcp = createBelvedereMcp({
    baseUrl,
    token,
    workspaceId,
    ...(firebaseApiKey && { firebaseApiKey }),
    ...(refreshToken && { refreshToken }),
  });

  const authMode = refreshToken ? 'user (refresh token)' : token ? 'service token' : 'NONE';

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

  // stderr に起動完了を出す (stdout は MCP メッセージ専用)。token 値そのものは出さない。
  console.error(
    `[belvedere-mcp] stdio server ready (api=${baseUrl} workspace=${workspaceId} auth=${authMode})`,
  );
}

main().catch((e) => {
  console.error('[belvedere-mcp][fatal]', e);
  process.exit(1);
});
