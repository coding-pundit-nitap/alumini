# ADR-011 — Backup and recovery: pgBackRest to an off-host bucket, driven by one script, proven by a drill

**Status:** accepted, 2026-10-08

## Context

set the targets (RPO 15 min, RTO 2 h, 14-day point-in-time window) and named pgBackRest, but nothing was built: `deploy/README.md` step 8 was a nightly `pg_dump` cron to a local directory, which loses up to a day, sits on the host it protects, and had never been restored. Hosting is the self-hosted single-host compose stack in `deploy/`, with no managed database to provide PITR. requires restore testing to be scheduled and alerting, and requires "backups work, restore tested" before launch.

## Decision

- **PostgreSQL 18 with pgBackRest in one image (`docker/postgres.Dockerfile`).** The image is the official `postgres:18.6-alpine3.24` plus pgBackRest 2.59.3, compiled from the checksum-pinned release tarball because Alpine packages an older version. Compose builds it on the server, and CI lints, builds and scans it but never publishes it. The 18 image enables data checksums at `initdb`. Dev, CI and production all move to 18 together, so a restore is always tested on the major version it will run on.
- **All configuration is in `deploy/compose.yml` as `PGBACKREST_*` variables.** There is no config file to drift. `archive_command` pushes each WAL segment, and `archive_timeout=300` bounds a quiet database's loss to 5 minutes. The repository is an S3-compatible bucket at another provider or account (`BACKUP_S3_*`, required: the stack refuses to start without them). Data is encrypted with `aes-256-cbc` before it leaves the host, under `BACKUP_CIPHER_PASS`, which is escrowed apart from the bucket.
- **Retention:** fulls are kept 28 days and diffs are kept 14, with WAL for both, so PITR reaches back at least 14 days. A weekly full, a daily diff, a weekly encrypted `pg_dump` (8 weekly, 12 monthly), and a daily mirror of the uploads bucket. pgBackRest cannot keep "3 monthly" physical fulls; the monthly logical dumps cover long-range recovery, and they are version-portable, which a physical backup is not.
- **"The host cannot delete its backups" is provided by the bucket, not by a second identity.** pgBackRest expires old backups itself, so the host's key may delete objects. Bucket versioning keeps deleted or overwritten objects for 30 days, and the key is not allowed to delete versions. A compromised host can hide backups for 30 days but cannot destroy them. Object lock with a separate expiry identity would be stronger; it waits for a provider that supports it.
- **One script, `deploy/backup.sh`, runs every job:** `init`, `backup full|diff`, `check`, `verify`, `mark`, `dump`, `uploads`, `uploads-restore`, `integrity`, `restore`, `restore-test`. Cron calls it. Each success writes `alumini_backup_last_success_timestamp_seconds{kind}` for node_exporter's textfile collector and appends to `deploy/backups.log`.
  - `restore` stops the app, refuses a volume that already holds a cluster unless told `--set-aside` (keep it beside the restore) or `--delta` (overwrite it), restores latest or `--target TIME`, and waits for promotion.
  - `restore-test` restores into a separate `postgres-restore` service with `archive_mode=off`, so a test can never write into the production stanza.
- **Integrity means four checks:**
  - Pending migrations are applied first. A restore point can predate the running release, and this is the runbook's reconcile step.
  - Every FK and CHECK constraint is dropped and re-added inside a rolled-back subtransaction, so each row is re-validated; no constraint may be `NOT VALID`.
  - `pg_amcheck --heapallindexed`, on throwaway restores only, because it installs `amcheck`.
  - Exact row counts, then `prisma migrate status` must be clean.
- **Archiving is monitored from the database and the jobs from their timestamps.** `pg_stat_archiver` (postgres_exporter) pages on failures and on a last archive older than 75 minutes. An idle database switches WAL only when the hourly `backup.sh check` forces it, which is why the threshold is not's 10 minutes. Overdue base backups, verify, dump and uploads open tickets. A restore test older than 35 days pages (`ops/prometheus/rules/backups.yml`, runbook R-8).
- **Restore is proven by a drill, monthly in CI and before launch by hand.** `packages/scripts/drills/restore.ts` runs the production compose file and script against a TLS MinIO stand-in, measures RPO and RTO from a host-loss scenario, and proves PITR. CI runs it monthly (`.github/workflows/restore-drill.yml`). The server runs `backup.sh restore-test` monthly against the real bucket and passphrase, which CI cannot see. Evidence goes to `docs/operations/restore-tests.md`.
- **Unpublished outbox rows from before the restore point are settled by a command, not ad-hoc SQL.** `outbox:settle --before <target> [--type] [--execute]` (dry run by default) marks them published without publishing them, because their effects may already have happened after the restore point. By default it settles every type; `--type` narrows it.

## Consequences

- Moving to PostgreSQL 18 changes the volume layout (`/var/lib/postgresql/18/docker`). An existing 17 volume is refused at start and needs a dump and restore once, in development and on any server that ran the stack before; physical backups never cross a major version.
- The postgres container holds the backup credentials and passphrase in its environment, since `archive_command` needs them. Anyone with Docker access on the host can read them, as they can already read the database.
- The uploads mirror is encrypted only by the provider (server-side), not before leaving the host as database backups are. Uploads are user-visible files, but some are private; client-side encryption of the mirror is an open item.
- The official image's `gosu` is built with an older Go and trips the image scan on standard-library CVEs it cannot reach. `.trivyignore.yaml` records that exception, scoped to the one file, until upstream rebuilds it.
- A restore always replays WAL. The measured restore times are in `docs/operations/restore-tests.md` and; they grow with database size and WAL since the last base backup, and the drill is re-run as the data grows.

## Alternatives

- **WAL-G.** Equivalent capability. pgBackRest was already named, has `verify` and block-level incremental backups, and configures entirely through environment variables.
- **`pg_dump` only.** Rejected: up to a day of loss and no point-in-time recovery. It remains as the weekly portable copy.
- **A managed PostgreSQL with built-in PITR.** Would replace most of this ADR. It is not available under the self-hosted decision; revisit if hosting changes.
- **Streaming replica as the backup.** Rejected: a replica copies a bad `DELETE` within milliseconds. It is an availability measure, not a backup.
- **Revisit when:** the bucket provider offers object lock; the database outgrows a 2-hour restore on the drill; or a second host appears and a standby becomes affordable.
