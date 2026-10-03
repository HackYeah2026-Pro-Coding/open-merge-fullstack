# Build context is the REPOSITORY ROOT, not apps/api — the pnpm workspace needs
# the root manifests and lockfile. On Render:
#   Dockerfile Path:    ./apps/api/Dockerfile
#   Docker Build Context Directory:  .
# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-alpine
ARG PNPM_VERSION=10.26.2

# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo

# ─── Dependencies + build ────────────────────────────────────────────────────
FROM base AS build

# Manifests first so this layer caches until a dependency actually changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# The api postinstall runs `prisma generate`, which loads prisma.config.ts and
# therefore needs the schema and the URL resolver present at install time.
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma/
COPY apps/api/src/config/database-url.ts apps/api/src/config/

# The dummy URL only satisfies config loading during code generation. Prisma
# generate never opens a connection, and this value never reaches the image.
RUN DATABASE_URL="postgresql://codegen:codegen@127.0.0.1:5432/codegen" \
    pnpm install --frozen-lockfile --filter @escrow/api...

COPY packages/shared packages/shared/
COPY apps/api apps/api/

RUN pnpm --filter @escrow/shared run build \
 && pnpm --filter @escrow/api run build

# ─── Production dependencies only ────────────────────────────────────────────
FROM base AS prod-deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# --ignore-scripts skips the prisma generate postinstall: the generated client is
# TypeScript that `nest build` already compiled into dist, so the runtime needs
# only @prisma/client and the pg driver, never the Prisma CLI.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @escrow/api...

# A workspace package with no production dependencies gets no node_modules at
# all, which would make the COPY below fail. Guarantee the directories exist.
RUN mkdir -p apps/api/node_modules packages/shared/node_modules

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# dumb-init reaps zombies and forwards SIGTERM, so Render's shutdown signal
# reaches Nest's shutdown hooks instead of killing PID 1 outright.
RUN apk add --no-cache dumb-init

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build /repo/packages/shared/package.json ./packages/shared/
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/dist ./apps/api/dist

USER node
WORKDIR /repo/apps/api

# Render overrides this with its own PORT; the app reads it from the environment.
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
