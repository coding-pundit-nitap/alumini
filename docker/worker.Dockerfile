# Worker image (spec 16 16E). Build from the repository root:
#   docker build -f docker/worker.Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t nitap-worker .
# Node runs the TypeScript sources directly (type stripping), so there is no compile step.
ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM ${NODE_IMAGE} AS base
RUN corepack enable
WORKDIR /repo

# The worker's slice of the workspace; verify-worker-prune.mjs checks the web app is not in it (ADR-018).
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @nitap/worker --docker --out-dir /out

# Generates the Prisma client (database's postinstall needs the schema, so scripts run after the sources).
FROM base AS build
COPY --from=prune /out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ .
RUN pnpm rebuild && pnpm --filter @nitap/database db:generate

# Production dependencies only, installed fresh: no compiler, linter, Prisma CLI or test tooling in the image.
FROM base AS prod-deps
COPY --from=prune /out/json/ .
# TypeScript's native compiler and turbo arrive as peers of production packages but are build tools; node runs
# the worker's .ts by stripping types itself, so neither is needed at runtime.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    && rm -rf node_modules/.pnpm/@typescript+typescript-* node_modules/.pnpm/@turbo+* node_modules/.pnpm/turbo@*

FROM ${NODE_IMAGE} AS run
ARG GIT_SHA=dev
ENV NODE_ENV=production APP_VERSION=${GIT_SHA}
WORKDIR /repo
# The runtime needs only node: npm, npx and corepack (and the CVEs in npm's own bundled dependencies) go.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=prod-deps --chown=node:node /repo ./
COPY --from=prune --chown=node:node /out/full/ ./
COPY --from=build --chown=node:node /repo/database/generated ./database/generated
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/health/live || exit 1
CMD ["node", "apps/worker/src/index.ts"]
