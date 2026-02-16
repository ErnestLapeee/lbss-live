# pnpm monorepo API service for Railway (Node 20, no Nixpacks)
#
# Build context MUST be the repository root. In Railway:
#   - Root Directory: leave empty (or "/") so context is repo root
#   - Dockerfile path: Dockerfile (at repo root)
# If Root Directory is packages/api, COPY will fail (pnpm-workspace.yaml etc. missing).
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.6.0 --activate

WORKDIR /app

# Copy dependency manifests first for better layer caching (all paths relative to repo root)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile

# Copy package source (shared + api; API tsconfig extends ../../tsconfig.base.json)
COPY packages/shared packages/shared
COPY packages/api packages/api

# Build the API (depends on shared)
RUN pnpm --dir packages/api build

# Listen on PORT (Railway injects process.env.PORT)
ENV NODE_ENV=production
EXPOSE 3000

# Run from repo root so node_modules resolution works; no --env-file (Railway injects env)
CMD ["node", "packages/api/dist/index.js"]
