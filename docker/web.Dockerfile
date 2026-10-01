# Web app image (spec 16 16E). Build from the repository root:
#   docker build -f docker/web.Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t nitap-web .
# Runtime configuration comes from the environment at `docker run`; nothing secret is baked in.
# `--target migrate` builds a one-shot image that runs `prisma migrate deploy` (and `admin:bootstrap`); the
# runtime image carries no Prisma CLI.
ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM ${NODE_IMAGE} AS base
RUN corepack enable
WORKDIR /repo

# Only the web app's slice of the workspace (turbo prune), so unrelated changes do not bust the cache.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @nitap/web --docker --out-dir /out

FROM base AS build
# Dependencies first (cached until a lockfile or package.json changes); their build scripts, including
# database's `prisma generate`, run once the sources (the Prisma schema) are in place.
COPY --from=prune /out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ .
RUN pnpm rebuild && pnpm --filter @nitap/database db:generate
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
# The deployment id (version-skew protection, reliability §8.2) and the version on every log line.
ARG GIT_SHA=dev
# `next build` imports route modules to collect page data; their clients need these variables to exist but
# never connect. Placeholders only, scoped to this RUN in the build stage: none reaches the runtime image.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    S3_ENDPOINT=http://localhost:9000 S3_REGION=us-east-1 S3_BUCKET=build \
    S3_ACCESS_KEY_ID=build S3_SECRET_ACCESS_KEY=build-placeholder S3_FORCE_PATH_STYLE=true \
    NEXT_DEPLOYMENT_ID=${GIT_SHA} pnpm --filter @nitap/web build

# Migrations and first-admin bootstrap, run once per release against the target database (reliability §8.3).
FROM build AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@nitap/database", "db:deploy"]

FROM ${NODE_IMAGE} AS run
ARG GIT_SHA=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${GIT_SHA}
WORKDIR /app
# The runtime needs only node: npm, npx and corepack (and the CVEs in npm's own bundled dependencies) go.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "apps/web/server.js"]
