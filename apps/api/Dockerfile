# 風車 API — Cloud Run 用 Dockerfile
# pnpm workspace を考慮したマルチステージビルド (tsx で実行、TS無変換)

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ワークスペース構成だけ先に
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/seed/package.json ./packages/seed/
COPY packages/repo/package.json ./packages/repo/
COPY packages/llm/package.json ./packages/llm/
COPY packages/agent/package.json ./packages/agent/
COPY packages/tools/package.json ./packages/tools/

# api に必要な範囲だけインストール
RUN pnpm install --frozen-lockfile --filter @kazaguruma/api...

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# deps から node_modules を引き継ぐ
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# 実ソース投入
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
CMD ["pnpm", "--filter", "@kazaguruma/api", "start"]
