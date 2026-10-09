# NIT Arunachal Pradesh Alumni Network

A web platform connecting students, alumni, faculty and staff of NIT Arunachal Pradesh: verified profiles,
an alumni directory, connections, mentorship, messaging, jobs, events, a feed, donations and
administration.

Built with Next.js, PostgreSQL (Prisma), Redis, BullMQ and Better Auth, as a pnpm and Turborepo workspace.

## Quick start

Requires Node.js 24+, pnpm 12+ and Docker.

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:deploy && pnpm db:seed
pnpm dev            # http://localhost:3000
pnpm worker:dev     # background jobs, in a second terminal
```

## Layout

```text
apps/web        Next.js app: UI, Server Actions, /api/v1, business modules
apps/worker     outbox relay and background job processors
packages/       database, job contracts, queue, email, storage, search, observability, ui, testing, scripts
deploy/         production compose stack, release and backup scripts
docker/         images and local development services
ops/            Prometheus, Alertmanager, Grafana config and incident runbooks
docs/           user guide, product, architecture, API, operations, decisions
```

## Documentation

- [User guide](./docs/user-guide.md): features and roles
- [Product](./docs/product.md), [architecture](./docs/architecture.md), [domain model](./docs/domain.md), [HTTP API](./docs/api.md)
- [Development](./docs/development.md): commands, tests, adding a feature, database changes
- [Decisions](./docs/decisions.md)
- [Deployment and operations](./deploy/README.md)
