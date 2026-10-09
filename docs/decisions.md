# Decisions

Why the system is built the way it is. Add a section when you make a choice a future maintainer would
otherwise undo; update it when the choice changes.

## Modular monolith on Next.js

One Next.js app hosts the UI, Server Actions and `/api/v1`, with business logic in framework-free modules
(see [architecture](./architecture.md)). One deployable and one database suit a small team and a few
thousand concurrent users. Because modules sit behind ports and publish events through the outbox, one of
them can later be extracted without a rewrite.

- Route Handlers and Server Actions are public endpoints, so each one authenticates and validates on its own.
- UI mutations are Server Actions; an `/api/v1` endpoint is added when a client needs it.
- **Revisit** when a non-web client or an independent scaling need appears.

## PostgreSQL is the only system of record

Every other store (Redis, the queue, caches) is disposable or rebuildable from PostgreSQL. Invariants live
in the schema (unique and partial indexes, `CHECK`s, guarded updates, row locks), because application
checks cannot stop concurrent requests. One transaction covers a state change and its outbox event.

## Prisma 7, pinned

`prisma`, `@prisma/client` and `@prisma/adapter-pg` are pinned to one exact version, because Better Auth's
adapter supports Prisma only up to 7. Upgrade them together with `better-auth`, deliberately. Prisma is used
only in `infrastructure/`; raw SQL (`$queryRaw`) is fine there for `FOR UPDATE`, `UPDATE … RETURNING` and
set-based work. There are no down-migrations: fix forward.

## Better Auth for authentication, our own RBAC

Better Auth handles sign-up, sessions, verification, password reset and its own rate limits. Sessions are
database rows with the cookie cache off, so suspension and revocation apply on the next request.
Authorization is ours: account state plus roles and scoped grants, decided by `authorize()`. Better Auth's
`admin` and `organization` plugins are not used: they cannot express suspended-but-signed-in accounts or
chapter-scoped grants.

- Better Auth runs `create.after` hooks after its transaction commits, so profile provisioning is
  idempotent and `getActor()` repairs anything a crash skipped.
- Institutional email domains come from `INSTITUTIONAL_EMAIL_POLICY` and may grant only onboarding roles.
  Alumni without an institutional address submit evidence, and only a human reviewer approves them.

## Transactional outbox feeding BullMQ

Committing and then enqueueing loses work if the process dies in between; enqueueing first runs work for
transactions that roll back. So use cases write an outbox row in their transaction, and the worker relays it
to BullMQ with the row id as job id. Delivery is at least once, so every processor is idempotent.
Payloads carry ids only.

- **Revisit** (switch to a PostgreSQL-backed queue such as pg-boss) if running Redis becomes a burden.

## Two Redis instances

The cache Redis evicts (`allkeys-lru`) and holds only rebuildable data: rate limits, unread counters, pub/sub
hints. The queue Redis must never lose keys (`noeviction`, AOF). One instance cannot satisfy both. Losing
the cache degrades the app; losing the queue delays side effects, which the outbox can replay.

## Notifications fan out inside each event processor

Each event processor calls a shared `deliver()` instead of emitting a second generic job. It writes the
in-app row (deduplicated per event, recipient and type), then email if the category allows it:
`TRANSACTIONAL` always sends, `ENGAGEMENT` respects the member's preference. Message notifications are
debounced to one row and one email per conversation per five minutes. Redis side effects are best effort
and never fail the job.

## Messaging: `seq` ordering and SSE hints

Messages are ordered by a `seq` assigned under a per-conversation lock, because UUIDs and timestamps don't
give a total order. Real-time delivery is an id-only hint over SSE; clients refetch through the authorized
API and poll every 30 s, so a Redis outage delays push but loses nothing. Any verified, unblocked member may
message another; rate limits and reports bound abuse.

## Profile privacy: one level plus stricter section overrides

Each profile has a visibility level, and its contact, location, experience and education sections may
override it, but only to something stricter. One pure function decides what a viewer sees. A hidden
profile is a 404, never a 403. Institutional fields (department, degree, year) change only through
verification.

## Directory search on PostgreSQL

`pg_trgm` indexes cover the short strings people search for (names, companies, skills), including typos,
with no separate index to keep in sync. Visibility is applied inside the query so hidden sections can't be
matched. Search sits behind `SearchPort`.

- **Revisit** with an external engine if p95 latency misses its target. It must still apply visibility
  from PostgreSQL.

## Object storage through `StoragePort`

Any S3-compatible provider works by configuration; development uses MinIO. Browsers upload directly with
presigned POSTs, the worker scans and re-encodes every image, and files are served through a route that
re-checks visibility, so no storage URL is ever stored.

## Observability: Prometheus pull, no tracing yet

Each process serves `/metrics` behind the monitoring token. The request id joins a request, its outbox
row and the worker's job logs, which is enough with two processes. Errors go to any Sentry-protocol
tracker (Sentry or GlitchTip) when `SENTRY_DSN` is set.

- **Revisit** tracing when a second service appears.

## Backups: pgBackRest to an off-host bucket

PostgreSQL ships every WAL segment and takes weekly full and daily differential backups to an encrypted,
versioned bucket at another provider. That gives point-in-time recovery over 14 days, at most 5 minutes of
data loss, and a host that cannot destroy its own backups. `deploy/backup.sh` runs every job; a monthly
drill in CI and a monthly `restore-test` on the server prove restores work. A weekly `pg_dump` gives a
version-portable copy. Details: [deploy/README.md](../deploy/README.md).

## Workspace layout

Deployables live in `apps/`, everything else in `packages/`, orchestrated by Turborepo. The worker is its
own app, so its image contains only what it needs. A new package needs two consumers, or must be tooling.
