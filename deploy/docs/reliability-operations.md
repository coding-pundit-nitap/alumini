# Reliability & Operations

Deployment, rollback, restore and migration procedures referenced by `deploy/README.md` and `deploy/backup.sh`.

### 7.3 PostgreSQL restore runbook

Commands are `deploy/backup.sh` subcommands, **confirmed by the drill** (restore-tests.md): `packages/scripts/drills/restore.ts` runs steps 4–8 against the production compose file.

```text
1. DECLARE. Open an incident. Freeze deploys. Put the site in maintenance mode / stop web + worker so nothing writes.
2. PRESERVE. If the old DB is reachable, snapshot/copy it read-only for forensics — do not restore over it.
3. CHOOSE THE TARGET.
     Host loss/corruption  → latest (no target; replay all archived WAL)
     Logical data loss     → the timestamp just BEFORE the damaging event (from audit log, deploy marker,
                              pre-change marker, or logs)
4. RESTORE (stops web, worker and postgres; waits until recovery ends and the cluster is promoted):
     deploy/backup.sh restore                                        # host loss: end of the archive
     deploy/backup.sh restore --target "<YYYY-MM-DD HH:MM:SS+00>" --set-aside
       --set-aside keeps an existing cluster beside the restore (step 2); --delta overwrites it instead.
       On a new host: deploy/README.md steps 1–5 with the escrowed .env, then this.
5. SCHEMA + INTEGRITY. `deploy/backup.sh integrity`: applies migrations newer than the restore point
   (`prisma migrate deploy`), re-validates every FK and CHECK constraint, prints row counts, and requires
   `prisma migrate status` to be clean.
6. RETENTION. The worker's scheduled sweeps (idempotency keys, notification retention, upload sweep) run
   when it starts. Erasures and anonymisations made AFTER the restore target are not in the restored data:
   re-apply them from the logs in step 9 before announcing (O-9). There is no general
   `retention.sweep` yet.
7. OUTBOX (avoid duplicate side effects). Rows with published_at = NULL at the restore point may already have been
   processed in reality after that point. Before starting the worker:
     docker compose run --rm worker node apps/worker/src/cli.ts outbox:settle --before "<target>"            # dry run: count
     docker compose run --rm worker node apps/worker/src/cli.ts outbox:settle --before "<target>" --execute
   This settles every type (marks it published without publishing). `--type <t>` narrows it when only some
   effects are harmful to repeat; quarantined rows are left for `outbox:failed`. For a host-loss restore
   (no target), use the time of the last restored write. Record what was chosen in the incident log.
   Empty/replaced queue Redis is fine: BullMQ jobIds and processor idempotency cover the rest.
8. VERIFY. Start web only; `/health/ready` = ok; log in as a test account; read a profile; check newest rows'
   timestamps against the target; run the smoke set. Then start the worker and watch outbox lag.
9. RECONSTRUCT THE LOSS WINDOW (data between target and failure):
     - donations: run `donation.reconcile` immediately; the payment provider is the source of truth
     - Loki `event=*.created` + email-provider logs list writes/notifications that no longer exist in the DB
     - Contact affected users where a registration, donation or request was lost and reply-worthy
     - Sessions created after the target are gone: users sign in again (expected)
10. REOPEN. Announce. Keep heightened monitoring for 24 h. Take a fresh full backup once stable
    (`deploy/backup.sh backup full`) so the new timeline has its own anchor. Schedule the postmortem.
```

**Variant for scenario C (surgical recovery):** restore to a _separate_ instance at the pre-damage time, leave production running, extract the missing/changed rows with SQL or `pg_dump --table`, and apply them to production inside a reviewed transaction (two-person review, script saved in the incident record). This avoids losing the _good_ writes made since the damage. Use full rollback only when the damage is too broad to patch.

## 8. Deployment & Rollback

### 8.1 CI/CD pipeline

```text
Push / PR
  ├─ Lint ─ format:check ─ typecheck                                   (scripts exist)
  ├─ Unit tests ─ Integration tests (real Postgres + Redis service containers)
  ├─ Migration checks:
  │     apply all migrations to an empty DB · schema.prisma matches migrations (no drift)
  │     · no migration timestamp in the future · no destructive statement without an `-- allow-destructive` review tag
  ├─ Build (once) → image tagged with the git SHA, pushed to the registry
  ├─ Security: dependency audit · secret scan · image scan
  └─ (main only) Deploy to staging → e2e smoke (Playwright) → manual approval → Deploy to production
```

Rules: the pipeline is the only path to production; no builds on the host and no manual edits to running containers or the production database. A red main blocks releases. Dependency automation must ignore Prisma 8.x.

### 8.2 Artifacts and configuration

- **One immutable image per process per commit** (`web` and `worker`, built from one Dockerfile and tagged with the same git SHA), referenced in production **by digest**. The same image is promoted from staging to production; only environment variables differ. Because `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is embedded at build, the registry is private and the image is treated as sensitive.
- `deploymentId` = the git SHA (`next.config.ts`), giving version-skew protection: after a deploy, a stale browser tab does a hard reload instead of calling a Server Action that no longer exists.
- The image builds without a database: `postinstall` runs `prisma generate`, which `prisma.config.ts` permits with a placeholder `DATABASE_URL`. The runtime image runs as a non-root user with a read-only root filesystem where possible.
- Registry retains at least the **last 10 production images** and never deletes the running one — this is what makes rollback a pull, not a rebuild.
- Environments are isolated: separate databases, Redis, buckets, secrets and OAuth/provider credentials; **production secrets never appear in staging or dev**. Staging data is synthetic or anonymised, never a raw production copy.

### 8.3 Production deploy procedure (single-host, zero-downtime by blue/green)

Two web containers (`web-blue`, `web-green`) behind Nginx; only one is live.

```text
 1. CI green on the commit; staging deploy + smoke passed; approver recorded (who/when/SHA)
 2. Pre-deploy marker: note timestamp + LSN; if the release contains a contract-phase or otherwise risky
    migration, first take a differential backup and confirm it completed
 3. Migrate: run `prisma migrate deploy` as a one-shot job with the migration role.
    Only expand-safe changes may run here (old release must keep working, §9.3). Abort the deploy on failure.
 4. Start the new colour with the new image; wait for /health/startup, then /health/ready (≤ 120 s, else abort
    and leave the old colour serving)
 5. Warm-up: request key public pages (cache keys include the build id, so the cache is cold after every
    deploy — architecture §8.4)
 6. Shift traffic: switch the Nginx upstream and `nginx -s reload` (graceful; in-flight requests finish)
 7. Drain the old colour: `POST /health/drain` (bearer `HEALTH_CHECK_TOKEN`) → readiness 503 and message
    streams end; wait ≥ 2 probe intervals, SIGTERM, allow the 30 s grace, stop (drill: `packages/scripts/drills/web-shutdown.ts`)
    (keep it stopped-but-present for fast rollback for the bake period)
 8. Worker: start new worker(s); old worker receives SIGTERM, finishes its current job, exits; unfinished
    jobs return to the queue (visibility timeout). Job payloads are versioned (§8.6)
 9. Bake: 15 minutes of heightened watching — 5xx, latency, error-tracker new classes, outbox lag, DLQ,
    synthetic checks. Annotate the deploy on dashboards
10. Verify success criteria and close: record version, SHA, migrations applied, time, outcome
```

If blue/green is not built at first, the acceptable fallback is a **single-container replace in a low-traffic window** (expected interruption ≤ 30 s, announced, counted against the error budget). It is a stop-gap, not the design.

**Multi-instance later (Stage 1):** the same steps as a rolling deploy, which additionally requires the shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (already stable in the image), `deploymentId`, and a shared cache handler before more than one instance runs.

### 8.4 Release rules

- **Deploy freezes** during high-stakes windows agreed with the institute (e.g. a major alumni event's registration opening, admission/exam-critical periods) and outside coverage hours unless it is a fix.
- **Small, frequent releases** beat large ones; each release is one artifact with one changelog entry linking commits and migrations.
- **Feature flags / kill switches** (start with environment-driven config) for risky new features so the remedy for a misbehaving feature is switching it off, not rolling back the release and its migrations.
- **Hotfixes** use the same pipeline, with an expedited review; there is no "SSH in and edit" path.
- **Version tracking**: `app_build_info` metric, deploy annotations, and the SHA in error-tracker releases.

### 8.5 Rollback

**When** (any one within the bake window, decided by the deployer without needing approval):

- Readiness failing on the new colour after the shift
- 5xx rate above the paging threshold, or a step change vs. the previous hour
- A new error-tracker class affecting a core journey (login, profile read, registration)
- A synthetic journey failing
- Outbox/DLQ regressions attributable to the release

**How (application):**

```text
1. Switch the Nginx upstream back to the previous colour (still present) and reload  → seconds
   or: start the previous image by digest (from the registry) and shift traffic     → minutes
2. Worker: redeploy the previous worker image
3. Announce in the incident channel; annotate the dashboards; open the postmortem stub
```

Target: **rollback ≤ 10 min from decision to traffic restored.** It is rehearsed on every release because the procedure is the same as the forward deploy with an older digest.

**Database and rollback — the rule that makes this safe:**

- Application rollback is safe because releases only ship **expand-phase** schema changes (§9.3): the previous release runs correctly against the newer schema. That is the entire reason for expand/contract.
- **Prisma has no down-migrations, and we do not write them.** A bad migration is fixed **forward** with a new migration. If a migration was destructive or corrupted data, use PITR to the pre-change marker (§7.3 scenario C).
- Never roll back by editing or deleting an already-applied migration file (checksums, and other environments).
- Data written by the new release in a new column stays; the old release ignores it. Contract-phase migrations (dropping the old column) go in a **later** release, after the bake and once rollback to the old release is no longer needed.

### 8.6 Worker and queue compatibility

Old and new workers overlap during a deploy, and jobs enqueued by version N may be picked up by N-1 (or vice-versa):

- Job and outbox payloads carry a schema version `v`. A worker that sees a version it does not understand **delays the job** (returns it to the queue with backoff) rather than failing it into the DLQ.
- Additive payload changes only, within a release window; renaming a payload field follows expand/contract like a column.
- Queue and processor names are stable; renaming one is a migration of in-flight work.

### 8.7 Post-deploy and pre-deploy checklists

Before: CI green · migration reviewed · rollback digest identified · marker taken · no freeze in effect · someone available for the next 30 min.
After: ready and synthetic green · error rate/latency normal · outbox lag normal · no new error classes · deploy annotated · old colour retained until bake ends.

---

### 9.3 Expand → migrate → contract

Every schema change that can affect a running release is split across releases so **release and N both work against the schema during and after the change**:

```text
Release N   EXPAND     add nullable column / new table / new index / NOT VALID constraint. Old code unaffected.
                       New code writes (and dual-writes if replacing) but tolerates old rows.
Between     MIGRATE    backfill in batches by a script/worker job (not inside the migration), then VALIDATE.
Release N+1 SWITCH     reads move to the new structure.
Release N+2 CONTRACT   drop the old column/constraint/table — only after the bake and after rollback to
                       release N-1 is off the table.
```

| Change                 | Safe pattern                                                                                                          | Avoid                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Add column             | Nullable (or constant `DEFAULT`, which PostgreSQL 11+ adds without a rewrite); backfill; then enforce                 | `ADD COLUMN … NOT NULL` without a default on a populated table     |
| Make column `NOT NULL` | `ADD CONSTRAINT … CHECK (col IS NOT NULL) NOT VALID` → backfill → `VALIDATE CONSTRAINT` → `SET NOT NULL`              | Direct `SET NOT NULL` scanning a big table under an exclusive lock |
| Rename column/table    | Add new, dual-write, backfill, switch reads, drop old later                                                           | `RENAME` (breaks immediately)                                      |
| Change a column type   | New column + backfill + switch                                                                                        | `ALTER COLUMN TYPE` rewriting the table                            |
| Drop column/table      | Stop referencing it in code first (release N), drop in a later release                                                | Dropping in the same release that stops using it                   |
| Add index              | `CREATE INDEX CONCURRENTLY` in its **own** migration file                                                             | Plain `CREATE INDEX` on a busy table                               |
| Add FK / `CHECK`       | `… NOT VALID`, then `VALIDATE CONSTRAINT` (takes a weaker lock)                                                       | Adding it validated on a large table                               |
| Add enum value         | `ALTER TYPE … ADD VALUE`; the new value is not usable until that migration commits, so use it from the _next_ release | Using the value in the same migration                              |
| Backfill               | Batched, idempotent, resumable, throttled, run as a job/script; **not** a single `UPDATE` in a migration              | Long transactions that hold locks and block vacuum                 |
