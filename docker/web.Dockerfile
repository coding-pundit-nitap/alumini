# Web app image (spec 16 16E). Build from the repository root:
#   docker build -f docker/web.Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t nitap-web .
# Runtime configuration comes from the environment at `docker run`; nothing secret is baked in.
# `--target migrate` builds a one-shot image that runs `prisma migrate deploy` and then the reference seed
# (roles, RBAC bundles, departments: insert-only upserts, so a release adds what is new and changes nothing an
# admin edited; spec 18 F-10), and `admin:bootstrap`; the runtime image carries no Prisma CLI.
ARG NODE_IMAGE=node:24.21.0-alpine3.24
ARG ALPINE_IMAGE=alpine:3.24

FROM ${NODE_IMAGE} AS node

FROM node AS base
RUN corepack enable
WORKDIR /repo

# Only the web app's slice of the workspace (turbo prune), so unrelated changes do not bust the cache.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @nitap/web --docker --out-dir /out

# Dependencies first (cached until a lockfile or package.json changes); their build scripts, including
# database's `prisma generate`, run once the sources (the Prisma schema) are in place.
FROM base AS deps
COPY --from=prune /out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ .
RUN pnpm rebuild && pnpm --filter @nitap/database db:generate

FROM deps AS build
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
# The deployment id (version-skew protection, reliability §8.2) and the version on every log line.
ARG GIT_SHA=dev
# `next build` imports route modules to collect page data; their clients need these variables to exist but
# never connect. Placeholders only, scoped to this RUN in the build stage: none reaches the runtime image.
# The cache mount keeps Next's compiler cache between builds of the same builder.
RUN --mount=type=cache,id=next-cache,target=/repo/apps/web/.next/cache \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    S3_ENDPOINT=http://localhost:9000 S3_REGION=us-east-1 S3_BUCKET=build \
    S3_ACCESS_KEY_ID=build S3_SECRET_ACCESS_KEY=build-placeholder S3_FORCE_PATH_STYLE=true \
    NEXT_DEPLOYMENT_ID=${GIT_SHA} pnpm --filter @nitap/web build

# Migrations and first-admin bootstrap, run once per release against the target database (reliability §8.3):
# the Prisma CLI and the migrations, plus the three packages scripts/bootstrap-admin.ts imports. Cut down here
# and copied into a clean stage, since deleting in a later layer frees nothing.
FROM deps AS migrate-deps
COPY docker/prune-node-modules.mjs /tmp/
RUN node /tmp/prune-node-modules.mjs /repo \
    packages/database=@nitap/jobs,@prisma/adapter-pg,@prisma/client,prisma,dotenv \
    apps/web=better-auth,@prisma/adapter-pg,@nitap/database

FROM base AS migrate
COPY --from=migrate-deps /root/.cache/node/corepack /root/.cache/node/corepack
COPY --from=migrate-deps /repo ./
# Offline: pnpm comes from corepack's cache, and the pruned tree never matches the lockfile, so pnpm must not
# try to reinstall it before running a script.
ENV NODE_ENV=production COREPACK_ENABLE_NETWORK=0 pnpm_config_verify_deps_before_run=false
CMD ["pnpm", "--filter", "@nitap/database", "db:release"]

# Node and its two shared libraries on bare Alpine: no npm, npx, corepack or yarn (nor their CVEs). Deleting
# them from the node image would not shrink it, since a removed file still sits in the layer below.
FROM ${ALPINE_IMAGE} AS run
RUN apk add --no-cache libstdc++ \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ARG GIT_SHA=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${GIT_SHA}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "apps/web/server.js"]
