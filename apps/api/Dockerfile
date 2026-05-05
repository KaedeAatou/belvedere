# Belvedere API — Cloud Run 用 Dockerfile
# pnpm workspace の symlink 構造を保つため、現状は single-stage 方式。
# tsx で TS を直接実行 (build step 無し)。
#
# 経緯: 当初 deps / runtime の 2-stage にして node_modules をコピーする
# 構成だったが、pnpm workspace では packages/<pkg>/node_modules に
# 各パッケージ固有の symlink (@belvedere/seed 等) があり、これらを
# runtime stage に取りこぼすと ERR_MODULE_NOT_FOUND になる。
# Phase 1-A では確実性優先で single-stage に変更。image size 最適化は
# Phase 2 以降 (`pnpm deploy --filter @belvedere/api` で flat 出力する等) に検討。

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# --- 依存解決のキャッシュ層 (package.json のみコピー) ---
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/seed/package.json ./packages/seed/
COPY packages/repo/package.json ./packages/repo/
COPY packages/llm/package.json ./packages/llm/
COPY packages/agent/package.json ./packages/agent/
COPY packages/tools/package.json ./packages/tools/

# api に必要な範囲だけインストール (... で transitive 含む)
RUN pnpm install --frozen-lockfile --filter @belvedere/api...

# --- 実ソース投入 ---
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/seed ./packages/seed
COPY packages/repo ./packages/repo
COPY packages/llm ./packages/llm
COPY packages/agent ./packages/agent
COPY packages/tools ./packages/tools

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# ヘルスチェックは Cloud Run 側で /health を叩く
CMD ["pnpm", "--filter", "@belvedere/api", "start"]
