# syntax=docker/dockerfile:1
# Build context = repo root. Node API service (currently a scaffold).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/ml/package.json apps/ml/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/ ./
COPY packages ./packages
COPY apps/api ./apps/api
EXPOSE 8080
# server.ts is a scaffold; Node 22 strips the TS types at runtime.
CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
