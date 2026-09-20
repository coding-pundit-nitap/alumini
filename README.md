# NIT Arunachal Pradesh Alumni Network

A web platform connecting students, alumni, faculty and staff of NIT Arunachal Pradesh: verified profiles, an alumni directory, mentorship, jobs, events, messaging and administration.

Requirements, architecture, API contract, operations and decision records are in [`docs/`](./docs/README.md). Start with the [Technical Design Specification](./docs/architecture/technical-design-specification.md) the [Development & Testing Strategy](./docs/architecture/development-and-testing-strategy.md) and the [Implementation Roadmap](./docs/architecture/implementation-roadmap.md); the phase-by-phase task list is [`TASK.md`](./TASK.md).

## Repository layout

A pnpm workspace orchestrated by [Turborepo](https://turborepo.dev/) ([ADR-017](./docs/adr/ADR-017-repository-structure.md)).

```text
apps/web/                @nitap/web        Next.js 16 app (UI, Server Actions, /api routes, tests)
packages/ui/             @nitap/ui         design-system primitives (shadcn / Base UI)
packages/eslint-config/  @nitap/eslint-config       shared lint preset
packages/typescript-config/ @nitap/typescript-config shared tsconfigs
database/                @nitap/database   Prisma schema, migrations, generated client
docker/                  local services (Postgres, Redis) — compose project name: alumini
docs/                    requirements · architecture · api · operations · adr
```

## Getting started

Prerequisites: Node.js 22+, pnpm (version pinned in `package.json`), Docker.

```bash
pnpm install                       # also generates the Prisma client (@nitap/database postinstall)
cp .env.example .env               # one .env at the repo root serves the whole workspace
pnpm docker:up                     # Postgres + Redis (POSTGRES_PORT / REDIS_PORT in .env if the defaults are taken)
pnpm db:deploy                     # apply migrations (use `pnpm db:migrate` while developing schema changes)
pnpm dev                           # http://localhost:3000
```

## Commands

Run from the repository root. Deterministic tasks are cached by Turborepo.

| Command                                                       | What it does                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                                | Run, build, serve the web app (depends on the generated Prisma client)              |
| `pnpm lint` / `typecheck` / `test`                            | ESLint, `tsc --noEmit`, Vitest unit and component tests across packages             |
| `pnpm arch`                                                   | dependency-cruiser: cycles, module DAG, deep imports, workspace direction           |
| `pnpm test:integration`                                       | Vitest `integration` and `contract` projects (need `pnpm docker:up` and `.env`)     |
| `pnpm test:e2e`                                               | Playwright (first run: `pnpm --filter @nitap/web exec playwright install chromium`) |
| `pnpm format` / `format:check`                                | Prettier                                                                            |
| `pnpm db:generate` / `db:migrate` / `db:deploy` / `db:studio` | Prisma (run from `database/`, reads the root `.env`)                                |
| `pnpm docker:up` / `docker:down`                              | Local Postgres and Redis                                                            |

## Working agreements

Test-driven development, enforced module boundaries and the definition of done are described in the [Development & Testing Strategy](./docs/architecture/development-and-testing-strategy.md). Work proceeds in vertical slices, each leaving the app working ([roadmap](./docs/architecture/implementation-roadmap.md)). Branches are short-lived (`feat/…`, `fix/…`, `chore/…`), commits follow Conventional Commits with the module as scope, and `main` is always deployable.
