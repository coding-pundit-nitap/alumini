#!/usr/bin/env bash
# Backups and restores for the self-hosted stack. Run from anywhere inside the
# clone; deploy/README.md step 8 has the cron lines.
#
#   deploy/backup.sh init                       create the pgBackRest stanza and take the first full backup
#   deploy/backup.sh backup full|diff           base backup (weekly full, daily diff); expires old ones
#   deploy/backup.sh check                      force a WAL switch and confirm it reached the repository (hourly)
#   deploy/backup.sh verify                     check every file in the repository against its checksum (weekly)
#   deploy/backup.sh info                       backups held and the WAL range they cover
#   deploy/backup.sh mark [note]                record a recovery point before a risky change
#   deploy/backup.sh dump                       encrypted pg_dump to the repository bucket (weekly)
#   deploy/backup.sh uploads                    mirror the uploads bucket to the repository bucket (daily)
#   deploy/backup.sh uploads-restore            mirror it back, after the object storage volume is lost
#   deploy/backup.sh integrity [service]        apply pending migrations, then constraint, row-count and
#                                               migration-status checks on a running cluster
#   deploy/backup.sh restore [--target TIME] [--set-aside|--delta]
#                                               restore the production cluster (stops web, worker, postgres)
#   deploy/backup.sh restore-test [--target TIME] [--keep]
#                                               restore into postgres-restore and run the integrity checks (monthly)
#
# TIME is anything Postgres reads as a timestamptz, e.g. "2026-10-08 09:30:00+00". Every job that succeeds
# exports alumini_backup_last_success_timestamp_seconds{kind} to node_exporter's textfile directory, which the
# alerts in ops/prometheus/rules/backups.yml watch; every job appends a line to deploy/backups.log.
# tools() takes a script that runs inside backup-tools, so its $VARS are meant to expand there, not here.
# shellcheck disable=SC2016
set -euo pipefail

cd "$(dirname "$0")"
LOG=backups.log
METRICS_DIR=${BACKUP_METRICS_DIR:-/var/lib/prometheus/node-exporter}
PGDATA_DIR=/var/lib/postgresql/18/docker

die() { echo "backup: $*" >&2; exit 1; }
say() { echo "backup: $*" >&2; }
env_get() { sed -n "s/^$1=//p" .env | tail -1 | tr -d "\"'"; }
now() { date +%s; }

[ -f .env ] || die "deploy/.env is missing; copy deploy/.env.example and fill it in (README step 4)"

record() {
  local kind=$1 started=$2 detail=${3:-} took
  took=$(($(now) - started))
  echo "$(date -u +%FT%TZ) $kind ok ${took}s $detail" >> "$LOG"
  say "$kind ok in ${took}s"
  if [ ! -d "$METRICS_DIR" ] || [ ! -w "$METRICS_DIR" ]; then
    say "$METRICS_DIR is not writable; the success metric was not exported"
    return 0
  fi
  local file="$METRICS_DIR/alumini_backup_$kind.prom"
  cat > "$file.$$" <<EOF
# HELP alumini_backup_last_success_timestamp_seconds When the backup job last succeeded (deploy/backup.sh).
# TYPE alumini_backup_last_success_timestamp_seconds gauge
alumini_backup_last_success_timestamp_seconds{kind="$kind"} $(now)
# HELP alumini_backup_last_duration_seconds How long the last successful run of the backup job took.
# TYPE alumini_backup_last_duration_seconds gauge
alumini_backup_last_duration_seconds{kind="$kind"} $took
EOF
  mv "$file.$$" "$file"
}

failed() { echo "$(date -u +%FT%TZ) $1 FAILED" >> "$LOG"; }

pgbackrest() { docker compose exec -T -u postgres postgres pgbackrest "$@"; }
psql_on() {
  local service=$1
  shift
  docker compose exec -T "$service" psql -U alumini -d alumini -v ON_ERROR_STOP=1 -X -q "$@"
}
tools() { docker compose run --rm --no-deps -T backup-tools "$1"; }

wait_promoted() {
  local service=$1 waited=0
  until [ "$(psql_on "$service" -tAc 'SELECT NOT pg_is_in_recovery()' 2>/dev/null)" = t ]; do
    [ "$waited" -lt 3600 ] || die "$service is still recovering after an hour (docker compose logs $service)"
    sleep 2
    waited=$((waited + 2))
  done
}

# Fails (exit 1) if any constraint is NOT VALID or any FK/CHECK does not hold for the rows present, then prints
# exact row counts. Each constraint is dropped and re-added inside a subtransaction that is always rolled back,
# so the re-add validates every row and nothing changes; it takes ACCESS EXCLUSIVE locks while it runs.
INTEGRITY_SQL=$(cat <<'SQL'
\echo constraints:
SELECT count(*) > 0 AS not_valid FROM pg_constraint WHERE NOT convalidated \gset
\if :not_valid
  \echo '  NOT VALID constraints present'
  SELECT conrelid::regclass, conname FROM pg_constraint WHERE NOT convalidated;
  \quit 1
\endif
BEGIN;
DO $$
DECLARE
  c record;
  checked int := 0;
  broken text[] := '{}';
BEGIN
  FOR c IN
    SELECT con.conrelid::regclass AS tbl, con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE con.contype IN ('f', 'c') AND n.nspname = 'public' AND con.conparentid = 0 AND con.coninhcount = 0
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', c.tbl, c.conname, c.def);
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback';
    EXCEPTION
      WHEN raise_exception THEN checked := checked + 1;
      WHEN OTHERS THEN broken := broken || format('%s.%s: %s', c.tbl, c.conname, SQLERRM);
    END;
  END LOOP;
  RAISE NOTICE '  % foreign key and check constraints re-validated', checked;
  IF cardinality(broken) > 0 THEN
    RAISE EXCEPTION 'constraints that do not hold: %', array_to_string(broken, '; ');
  END IF;
END $$;
ROLLBACK;
\echo row counts:
SELECT c.relname AS table,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint
         AS rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY 1;
SQL
)

# A restore point can predate the running release, so pending migrations are applied first (that is the
# reconcile step); `migrate status` must then report the schema up to date with no failed migration.
integrity() {
  local service=${1:-postgres} url
  url="postgresql://alumini:$(env_get POSTGRES_PASSWORD)@$service:5432/alumini"
  say "applying pending migrations to $service"
  docker compose run --rm --no-deps -T -e DATABASE_URL="$url" migrate
  say "integrity checks on $service"
  psql_on "$service" <<< "$INTEGRITY_SQL"
  say "migration status of $service"
  docker compose run --rm --no-deps -T -e DATABASE_URL="$url" migrate pnpm --filter @nitap/database db:status
}

# Physical restore into the volume of `service` (stopped). Leaves the cluster recovering towards the target.
restore_into() {
  local service=$1 target=$2
  shift 2
  local args=(restore "$@")
  if [ -n "$target" ]; then
    args+=(--type=time "--target=$target" --target-action=promote)
  fi
  docker compose run --rm --no-deps -T -u postgres --entrypoint sh "$service" \
    -c "mkdir -p $PGDATA_DIR && chmod 0700 $PGDATA_DIR"
  docker compose run --rm --no-deps -T -u postgres --entrypoint pgbackrest "$service" "${args[@]}"
}

has_cluster() {
  docker compose run --rm --no-deps -T -u postgres --entrypoint sh "$1" -c "test -s $PGDATA_DIR/PG_VERSION"
}

cmd=${1:-}
[ $# -gt 0 ] && shift
started=$(now)
trap '[ $? -eq 0 ] || failed "${cmd:-none}"' EXIT

case "$cmd" in
  init)
    pgbackrest stanza-create
    pgbackrest check
    pgbackrest backup --type=full
    record full "$started" "first backup"
    ;;

  backup)
    type=${1:-}
    [ "$type" = full ] || [ "$type" = diff ] || die "usage: backup.sh backup full|diff"
    pgbackrest backup --type="$type"
    record "$type" "$started"
    ;;

  check)
    pgbackrest check
    record check "$started"
    ;;

  verify)
    pgbackrest verify
    record verify "$started"
    ;;

  info)
    pgbackrest info
    ;;

  mark)
    point=$(psql_on postgres -tAc "SELECT now() || ' lsn ' || pg_current_wal_lsn()")
    pgbackrest check
    echo "$(date -u +%FT%TZ) mark $point ${*:-}" >> "$LOG"
    echo "recovery point: $point (restore with --target \"${point%% lsn *}\")"
    ;;

  dump)
    # Physical backups only restore into the same Postgres major; this copy also restores into the next one,
    # and lets one table be pulled out without a full restore. Encrypted with the repository passphrase.
    name=alumini-$(date -u +%Y%m%dT%H%M%SZ).dump.enc
    docker compose exec -T postgres sh -c 'set -o pipefail; pg_dump -U alumini -Fc alumini |
      openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:PGBACKREST_REPO1_CIPHER_PASS' |
      tools "mc pipe backup/\$BACKUP_S3_BUCKET/dumps/weekly/$name"
    # The first dump of each month is also kept a year; weekly ones eight weeks. With the bucket's
    # versioning these removals are recoverable for 30 days; the backup key cannot purge versions.
    if [ "$(date -u +%d)" -le 7 ]; then
      tools "mc cp backup/\$BACKUP_S3_BUCKET/dumps/weekly/$name backup/\$BACKUP_S3_BUCKET/dumps/monthly/$name"
    fi
    tools 'mc rm --recursive --force --older-than 56d "backup/$BACKUP_S3_BUCKET/dumps/weekly/" &&
      mc rm --recursive --force --older-than 365d "backup/$BACKUP_S3_BUCKET/dumps/monthly/"' || true
    record dump "$started" "$name"
    ;;

  uploads)
    # --remove carries deletions over (erasure); the bucket's versioning keeps them 30 days.
    tools 'mc mirror --overwrite --remove --quiet local/alumini-uploads "backup/$BACKUP_S3_BUCKET/uploads"'
    record uploads "$started"
    ;;

  uploads-restore)
    tools 'mc mirror --overwrite --quiet "backup/$BACKUP_S3_BUCKET/uploads" local/alumini-uploads'
    record uploads_restore "$started"
    ;;

  integrity)
    integrity "${1:-postgres}"
    ;;

  restore)
    target='' mode=''
    while [ $# -gt 0 ]; do
      case "$1" in
        --target) target=${2:?--target needs a time}; shift 2 ;;
        --set-aside | --delta) mode=$1; shift ;;
        *) die "unknown option $1" ;;
      esac
    done
    say "stopping web, worker and postgres"
    docker compose stop web worker postgres
    extra=()
    if has_cluster postgres; then
      case "$mode" in
        --set-aside)
          aside="$PGDATA_DIR.before-$(date -u +%Y%m%dT%H%M%SZ)"
          docker compose run --rm --no-deps -T -u postgres --entrypoint mv postgres "$PGDATA_DIR" "$aside"
          say "the old cluster is kept at $aside in the postgres-data volume; delete it once the restore is verified"
          ;;
        --delta) extra=(--delta) ;;
        *) die "postgres-data holds a cluster. Pass --set-aside to keep it beside the restore, or --delta to overwrite it" ;;
      esac
    fi
    restore_into postgres "$target" "${extra[@]}"
    docker compose up -d postgres
    wait_promoted postgres
    record restore "$started" "target=${target:-latest}"
    cat <<EOF
Postgres is restored and accepting writes; web and worker are still stopped. Continue with the runbook
(deploy/docs/reliability-operations.md) from step 5:
  deploy/backup.sh integrity          # applies migrations newer than the restore point, then checks
  docker compose run --rm worker node apps/worker/src/cli.ts outbox:settle --before "<restore point>"   # dry run first
  docker compose up -d
EOF
    ;;

  restore-test)
    target='' keep=no
    while [ $# -gt 0 ]; do
      case "$1" in
        --target) target=${2:?--target needs a time}; shift 2 ;;
        --keep) keep=yes; shift ;;
        *) die "unknown option $1" ;;
      esac
    done
    docker compose rm -sf postgres-restore >/dev/null
    docker compose run --rm --no-deps -T -u postgres --entrypoint sh postgres-restore -c 'rm -rf /var/lib/postgresql/18'
    t0=$(now)
    restore_into postgres-restore "$target"
    t1=$(now)
    docker compose up -d postgres-restore
    wait_promoted postgres-restore
    t2=$(now)
    integrity postgres-restore
    # Heap and index structure, every index entry against its heap row. Installs amcheck, so restores only.
    docker compose exec -T -u postgres postgres-restore \
      pg_amcheck -U alumini -d alumini --install-missing --heapallindexed
    t3=$(now)
    if [ "$keep" = no ]; then
      docker compose rm -sf postgres-restore >/dev/null
      docker compose run --rm --no-deps -T -u postgres --entrypoint sh postgres-restore -c 'rm -rf /var/lib/postgresql/18'
    fi
    record restore_test "$started" \
      "target=${target:-latest} restore=$((t1 - t0))s recovery=$((t2 - t1))s checks=$((t3 - t2))s"
    ;;

  *)
    trap - EXIT
    sed -n '2,/^set -euo/p' "$(basename "$0")" | grep '^#   ' | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
