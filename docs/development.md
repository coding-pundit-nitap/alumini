# Development

## Setup

Requires Node.js 24+, pnpm 12+ and Docker.

```bash
pnpm install          # also generates the Prisma client
cp .env.example .env  # one .env at the repo root serves every package
pnpm docker:up        # PostgreSQL, both Redis instances, MinIO, Mailpit
pnpm db:deploy        # apply migrations
pnpm db:seed          # roles, permissions, reference data, dev accounts
pnpm dev              # web on http://localhost:3000
pnpm worker:dev       # worker (emails, notifications, uploads)
```

Mailpit shows sent email at http://localhost:8025. `pnpm docker:scan` starts ClamAV for upload scanning,
and `pnpm docker:observability` starts Prometheus, Alertmanager and Grafana.

## Commands

| Command                              | What it does                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm lint` / `typecheck` / `format` | ESLint (with boundary rules), `tsc`, Prettier                                                |
| `pnpm arch`                          | dependency-cruiser: cycles, module graph, workspace direction                                |
| `pnpm test`                          | Unit and component tests (no services needed)                                                |
| `pnpm test:integration`              | Integration and contract tests against the `docker:up` services                              |
| `pnpm test:e2e`                      | Playwright journeys (first run: `pnpm --filter @nitap/web exec playwright install chromium`) |
| `pnpm db:migrate`                    | Create a migration from `schema.prisma` changes (local only)                                 |
| `pnpm db:drift`                      | Fails if the migrations and `schema.prisma` disagree                                         |
| `pnpm db:studio`                     | Prisma Studio                                                                                |
| `pnpm worker:cli`                    | Operator commands: outbox replay/release/settle, failed-job retry                            |
| `pnpm ops:check`                     | Validates Prometheus rules, alert tests and dashboards (needs Docker)                        |

## Tests

The file suffix picks the Vitest project:

| Suffix                        | Project     | Runs against                        |
| ----------------------------- | ----------- | ----------------------------------- |
| `*.test.ts`                   | unit        | nothing; fakes from `tests/support` |
| `*.test.tsx`, `*.dom.test.ts` | dom         | happy-dom                           |
| `*.integration.test.ts`       | integration | real PostgreSQL and Redis           |
| `*.contract.test.ts`          | contract    | real PostgreSQL                     |
| `tests/e2e/*.spec.ts`         | Playwright  | the built app and the worker        |

- Each integration test file gets its own database cloned from a migrated template, so files run in parallel.
- Write the failing test first. Domain rules get unit tests; anything that relies on a constraint, lock or
  transaction gets an integration test against PostgreSQL.
- `tests/security` covers the authorization matrix, IDOR, input fuzzing and every Server Action signed out.
  A new Route Handler must be added to `tests/security/api-inventory.ts`, or the inventory test fails.
- `tests/architecture` enforces the module rules, so a boundary violation fails `pnpm test`.

## Adding a feature

1. Put the rule in the module's `domain/` as a pure function, with tests.
2. Write the use case in `application/`: `authorize()` first, then the work inside
   `store.transaction(...)`, writing any outbox event in the same transaction.
3. Implement the store in `infrastructure/`. Enforce invariants in the schema (unique, `CHECK`, guarded
   updates), not with check-then-write.
4. Wire it in `src/composition/<module>.ts` and expose it from the module's `index.ts` or `server.ts`.
5. Add the Server Action or `/api/v1` route as a thin adapter. Server Actions take the caller from the
   session and read only named form fields.
6. A new permission goes in `packages/database/prisma/seed-data/permissions.ts`, the role bundles and the
   [RBAC matrix](../apps/web/tests/support/rbac-permission-matrix.md).
7. A new background effect is an outbox event in `packages/jobs` plus a processor registered in
   `apps/worker/src/compose.ts`. Processors must be idempotent.

## Database changes

- Change `schema.prisma`, run `pnpm db:migrate`, and commit the generated migration. Constraints Prisma
  cannot express (partial indexes, `CHECK`s, triggers) go in the migration SQL by hand.
- **Never edit a migration that has been applied anywhere.** Prisma checksums them; fix forward with a new
  migration.
- Migrations must be expand-only (add nullable columns, add indexes `CONCURRENTLY` in their own file), so
  the previous release keeps working during a deploy. CI fails a migration that holds a write-blocking lock
  on a populated table for more than a second.

## Conventions

- Conventional Commits with the module or area as scope (`feat(messaging): …`); commitlint enforces them.
- Pre-commit hooks run ESLint, Prettier, the migration drift check and a secret scan.
- `main` is always deployable; work happens on short-lived branches.
- This Next.js version differs from older ones. Read `apps/web/node_modules/next/dist/docs/` before
  writing framework code.
- Comments explain why, not what. Keep them short.
