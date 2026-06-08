# Belvedere Web — Cloud Run 用 Dockerfile
# pnpm workspace の symlink 構造を保つため single-stage 方式。
# nuxt build で .output/ (Nitro node-server preset) を生成し、
# `node .output/server/index.mjs` (= pnpm --filter @belvedere/web start) で起動。
#
# 経緯: API Dockerfile と同じ思想。multi-stage で .output/ だけコピーする
# 構成にすると pnpm workspace の symlink を取りこぼす可能性があるため、
# Phase 1 では確実性優先で single-stage。image size 最適化は Phase 2 以降。

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# --- 依存解決のキャッシュ層 (package.json のみコピー) ---
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/seed/package.json ./packages/seed/
COPY packages/repo/package.json ./packages/repo/

# web に必要な範囲だけインストール (... で transitive 含む)
RUN pnpm install --frozen-lockfile --filter @belvedere/web...

# --- 実ソース投入 ---
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/seed ./packages/seed
COPY packages/repo ./packages/repo

# Nuxt build (.output/server/index.mjs を生成)
RUN pnpm --filter @belvedere/web build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Nitro node-server preset は PORT env を尊重する (Cloud Run が 8080 を渡す)
CMD ["pnpm", "--filter", "@belvedere/web", "start"]
