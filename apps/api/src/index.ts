// Belvedere API のブートエントリ (Cloud Run 想定)。
//
// ルート / middleware の組み立ては app.ts の createApp({repo, llm}) に集約した。
// ここは「依存を作って serve するだけ」の thin entry。これによりテストは createApp に
// memory repo + mock llm を注入し、app.fetch() で auth/workspace middleware 込みの
// full-stack を Firebase 無しで踏める (MCP service token 経由)。
//
// エンドポイント一覧は app.ts を参照。/ と /health のみ認証不要、それ以外の /api/* は
// authMiddleware (Firebase ID token もしくは MCP service token) + workspaceMiddleware 必須。

import { serve } from '@hono/node-server';
import { createLLMProvider } from '@belvedere/llm';
import { createRepoContainer } from '@belvedere/repo';
import { createApp } from './app';

const repo = await createRepoContainer(process.env.REPO_BACKEND);
const llm = createLLMProvider(process.env.LLM_PROVIDER);
const app = createApp({ repo, llm });

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[belvedere-api] listening on http://0.0.0.0:${info.port}`);
  console.log(`  llm provider: ${llm.name}`);
  console.log(`  repo backend: ${process.env.REPO_BACKEND ?? 'memory'}`);
  // MCP サービストークン認証が有効か (= MCP_SERVICE_TOKEN が注入されているか) を起動時に明示。
  // 未設定だと MCP は Firebase 検証に落ちて 401 になり「wrong token」と区別しづらいので、
  // ops が原因切り分けできるよう boot で 1 行出す (token 値そのものは絶対に出さない)。
  console.log(`  mcp service-token auth: ${process.env.MCP_SERVICE_TOKEN ? 'enabled' : 'disabled (MCP_SERVICE_TOKEN unset)'}`);
});
