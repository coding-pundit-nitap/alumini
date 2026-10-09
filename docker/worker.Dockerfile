# Worker image. Build from the repository root:
#   docker build -f docker/worker.Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t alumini-worker .
# Node runs the TypeScript sources directly (type stripping), so there is no compile step.
ARG NODE_IMAGE=node:24.21.0-alpine3.24
ARG ALPINE_IMAGE=alpine:3.24

FROM ${NODE_IMAGE} AS node

FROM node AS base
RUN corepack enable
WORKDIR /repo

# The worker's slice of the workspace; verify-worker-prune.mjs checks the web app is not in it.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @nitap/worker --docker --out-dir /out

# Install, then generate the Prisma client (database's postinstall needs the schema, so scripts run after the
# sources), then cut the tree down to the worker's runtime dependencies: no compiler, linter, Prisma CLI or
# test tooling reaches the image.
FROM base AS build
COPY --from=prune /out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ .
COPY docker/prune-node-modules.mjs /tmp/
RUN pnpm rebuild && pnpm --filter @nitap/database db:generate \
    && node /tmp/prune-node-modules.mjs /repo apps/worker

# Node and its two shared libraries on bare Alpine: no npm, npx, corepack or yarn (nor their CVEs). Deleting
# them from the node image would not shrink it, since a removed file still sits in the layer below.
FROM ${ALPINE_IMAGE} AS run
RUN apk add --no-cache libstdc++ \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ARG GIT_SHA=dev
ENV NODE_ENV=production APP_VERSION=${GIT_SHA}
WORKDIR /repo
COPY --from=build --chown=node:node /repo ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/health/live || exit 1
CMD ["node", "apps/worker/src/index.ts"]
