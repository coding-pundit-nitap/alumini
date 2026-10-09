# Architecture

A modular monolith: one Next.js app, one worker, one PostgreSQL database. Every durable fact lives in
PostgreSQL; Redis, the queue and caches can be lost and rebuilt.

```text
Browser ─► Nginx (TLS, size limits) ─► apps/web (Next.js)
                                          │  pages, Server Actions, /api/v1 Route Handlers
                                          ▼
                                    modules/<name>  ── use cases, authorize(), state machines
                                          │
              ┌───────────────┬───────────┼──────────────┬──────────────────┐
              ▼               ▼           ▼              ▼                  ▼
          PostgreSQL     cache Redis   object storage  (outbox rows) ─► apps/worker
          (all state,    (rate limits, (S3, presigned              relay ─► BullMQ on queue Redis
           outbox,        unread       uploads)                    processors: email, notifications,
           audit log)     counters,                                upload scan, sweeps
                          SSE hints)
```

## Workspace

| Path                         | Package                    | What it is                                                         |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------ |
| `apps/web`                   | `@nitap/web`               | Next.js app: UI, Server Actions, `/api/v1`, all business modules   |
| `apps/worker`                | `@nitap/worker`            | Outbox relay and job processors; no HTTP besides health/metrics    |
| `packages/database`          | `@nitap/database`          | Prisma schema, migrations, seed, generated client, shared stores   |
| `packages/jobs`              | `@nitap/jobs`              | Job and outbox event contracts (Zod payloads), notification rules  |
| `packages/queue`             | `@nitap/queue`             | BullMQ port, outbox relay, job runtime                             |
| `packages/email`             | `@nitap/email`             | Email port, templates, SMTP adapter                                |
| `packages/storage`           | `@nitap/storage`           | `StoragePort` over any S3-compatible store                         |
| `packages/search`            | `@nitap/search`            | Directory `SearchPort`, query schema, cursor codec                 |
| `packages/observability`     | `@nitap/observability`     | Logger, redaction, metrics port, Prometheus adapter, error tracker |
| `packages/ui`                | `@nitap/ui`                | Design-system primitives (shadcn / Base UI), no business logic     |
| `packages/testing`           | `@nitap/testing`           | Test databases, fault proxy, SMTP test server                      |
| `packages/scripts`           | `@nitap/scripts`           | Drills, perf runner, repo checks; run, never imported              |
| `packages/typescript-config` | `@nitap/typescript-config` | Shared tsconfig presets                                            |
| `deploy/`, `docker/`, `ops/` |                            | Production compose stack, images, monitoring config and runbooks   |

Packages are consumed as TypeScript source. `packages/*` never import `apps/*`, and web and worker never
import each other.

## Inside the web app

```text
apps/web/src/
  app/            routes only: pages, layouts, Server Actions, /api/v1 Route Handlers
  modules/<name>/ domain/ → application/ → presentation/, with infrastructure/ implementing ports
  composition/    wires each module to its adapters (the only place that builds them)
  infrastructure/ cross-cutting adapters: database, Redis, outbox, audit, health, HTTP
  proxy.ts        request id, CSP nonce, optimistic redirect to /login
```

Modules: `auth`, `users`, `connections`, `directory`, `mentorship`, `messaging`, `posts`, `achievements`,
`jobs`, `events`, `notifications`, `moderation`, `uploads`, `donations`, `admin`.

Rules, enforced by ESLint boundary presets, dependency-cruiser and architecture tests:

- `domain/` is pure: no framework, ORM, Redis or I/O. `application/` depends on `domain/` and port types.
- Only `infrastructure/` touches Prisma. Only `composition/` constructs adapters.
- A module is imported only through its `index.ts` (client-safe) or `server.ts` (server-only). Code never
  reaches into another module; where data must cross, SQL reads the other table directly or a port is
  injected by `composition/`.
- Route files and Server Actions are thin adapters: parse, call a use case, map the result.
- Application code names permissions, never roles.

## Requests and authorization

- **Authentication** is Better Auth on the shared Prisma client, with database sessions and no cookie
  cache, so revoking a session takes effect on the next request.
- **`getActor()`** is the only way server code learns the caller. It reads the session and account state
  from the database on every request and loads grants for `VERIFIED` accounts.
- **`authorize(actor, permission)`** runs inside every use case: account-state gate, then grants (global or
  chapter-scoped), then guardrails such as no self-review. Hidden resources answer 404, not 403.
- `proxy.ts` only redirects anonymous visitors; it never authorizes.
- The role → permission matrix is
  [`apps/web/tests/support/rbac-permission-matrix.md`](../apps/web/tests/support/rbac-permission-matrix.md),
  checked against the seed by tests. Permission strings live in
  `packages/database/prisma/seed-data/permissions.ts`.

## Writes and side effects

A use case changes rows and writes an **outbox event** in the same transaction (`TransactionRunner`). The
worker's relay claims unpublished rows (`FOR UPDATE SKIP LOCKED`), enqueues them in BullMQ with the event
id as job id, and marks them published. Processors are idempotent because delivery is at least once.

- Concurrency rules live in the database: unique and partial unique indexes, `CHECK`s, guarded
  `UPDATE … WHERE state = <expected>`, and row locks where a count must hold (event seats, mentor capacity,
  group size).
- `Idempotency-Key` is honoured on the create endpoints that are not naturally idempotent.
- The audit log is append-only (a trigger refuses updates and deletes) and written in the business
  transaction.
- Notifications: each event processor calls one `deliver()` that writes the in-app row, then email if the
  category and the member's preference allow it. Message notifications are debounced per conversation.
- Real-time: the worker publishes id-only hints on Redis pub/sub; `/api/v1/messages/stream` forwards them
  over SSE, and clients refetch through the API and poll as a fallback.

## Uploads and search

- Browsers upload straight to object storage with a presigned POST. The worker scans (ClamAV), re-encodes
  to WebP and marks the upload `READY`. Photos are served through a route that re-checks visibility and
  redirects to a short-lived presigned URL.
- Directory search runs on PostgreSQL (`pg_trgm` indexes, keyset pagination) behind `SearchPort`.
  Visibility is applied inside the query, per profile section.

## Failure behaviour

| Down                | Effect                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL          | Readiness fails; API answers 503 with `Retry-After`                                                                                   |
| Cache Redis         | Degraded: rate limits fall back to a stricter in-memory limiter, counters recompute from PostgreSQL, push stops and polling continues |
| Queue Redis, worker | Requests still succeed; the outbox accumulates and drains on recovery                                                                 |
| SMTP                | In-app notifications are on time; email retries for about six hours                                                                   |
| Object storage      | Uploads answer 503; nothing else is affected                                                                                          |
| ClamAV              | Uploads stay `PENDING_SCAN` (fail closed)                                                                                             |

Health: `/health/live`, `/health/ready` (PostgreSQL only; Redis is reported, never required). Both processes
expose `/metrics` (Prometheus), gated by `HEALTH_CHECK_TOKEN` in production. Every log line and job carries
the request id.

Operations, deployment and backups: [`deploy/README.md`](../deploy/README.md) and
[`ops/README.md`](../ops/README.md).
