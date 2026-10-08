# Self-hosted deployment

How to run the alumni network on one Linux server: setup from scratch, releases, rollback, and backups. This
is the single-host stage 0 topology from [reliability §8](../docs/operations/reliability-operations.md#8-deployment--rollback).
Staging is a second server set up the same way (see [Staging](#staging)).

```text
Internet ─▶ Nginx on the host (TLS, rate limit, 6 MB bodies) ─▶ 127.0.0.1:3000 web
                                                                   │
            compose network (nothing else published) ──────────────┤
            postgres · redis (cache) · queue-redis · minio · clamav · worker
```

| File                 | What                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `compose.yml`        | Production services. Only `web` is published, on `127.0.0.1:3000`                     |
| `.env.example`       | Template for `deploy/.env` (gitignored): environment, secrets, domain, SMTP           |
| `deploy.sh`          | `build` / `pull` / `promote <sha> <approver>` / `rollback <sha>` / `smoke` / `status` |
| `nginx/alumini.conf` | Host Nginx site                                                                       |
| `monitoring.yml`     | Prometheus, Alertmanager, Grafana and exporters, run with `monitoring.sh` (step 9)    |

The server is a clone of this repository. Every release runs exactly one commit: `deploy.sh` refuses a clone
with local changes, moves it to that commit, and releases that commit's images, built on the server or by CI.
Each release is one line in `deploy/releases.log` with its images by reference; rollback and promotion read
them from there.

## How a commit reaches production

```text
main green in CI ─▶ CI publishes web, worker, migrate, postgres :<sha>
   ─▶ staging:    deploy.sh pull                  pins each tag's digest, releases, smoke test
   ─▶ production: deploy.sh promote <sha> <name>  the same digests, only if staging's smoke test passed
```

Production never resolves a tag: it runs the exact bytes staging tested (spec 18 PRD-3, PRD-4). The smoke test
is `/health/ready`, a sign-in with the smoke account and an authenticated read, through the public URL.

**Build mode** (`deploy.sh build`) builds the four images on the server instead. It needs nothing outside the
server, but 4 GB of free RAM for `next build`, 5–10 minutes, and it can ship a commit CI never passed. On
production it skips staging, and the log line says `source=build`. Use it only without a registry.

## First-time setup

Ubuntu 24.04, 2 vCPU, **4 GB RAM or more** (ClamAV alone holds ~1 GB), 40 GB disk. A DNS `A` record for your
domain points at the server. Below, `alumni.example.org` is your domain and `OWNER` your GitHub user or
organisation.

### 1. Packages, firewall, swap

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER            # log out and back in
sudo apt install -y git nginx certbot
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# Swap, so `next build` (build mode) and clamd cannot run the host out of memory
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Docker-published ports bypass `ufw`. That is safe here only because `compose.yml` publishes nothing except
`127.0.0.1:3000`. Keep it that way.

### 2. Clone the repository

```bash
sudo mkdir -p /opt/alumini && sudo chown $USER /opt/alumini
git clone https://github.com/OWNER/alumini.git /opt/alumini
```

For a private repository, add a read-only deploy key: `ssh-keygen -t ed25519 -f ~/.ssh/alumini_deploy`, add
the `.pub` under GitHub → Settings → Deploy keys, then clone with `git@github.com:OWNER/alumini.git`.

### 3. TLS certificate and Nginx

Get the certificate while the default site still answers on port 80:

```bash
sudo certbot certonly --webroot -w /var/www/html -d alumni.example.org \
  --deploy-hook "systemctl reload nginx"
sudo sed 's/alumni.example.org/YOUR.DOMAIN/g' /opt/alumini/deploy/nginx/alumini.conf \
  | sudo tee /etc/nginx/sites-available/alumini.conf >/dev/null
sudo ln -s /etc/nginx/sites-available/alumini.conf /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Renewal is automatic (certbot's systemd timer, through the `/.well-known/acme-challenge/` location). Check it
with `sudo certbot renew --dry-run`.

### 4. Configuration

```bash
cd /opt/alumini/deploy
cp .env.example .env && chmod 600 .env
openssl rand -hex 24      # run 3×: POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, HEALTH_CHECK_TOKEN
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 48   # BACKUP_CIPHER_PASS
nano .env
```

Fill in:

- the secrets above. Hex only for the first two, because they go inside URLs.
- `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` and `APP_URL`: all `https://YOUR.DOMAIN`.
- `SMTP_URL` and `EMAIL_FROM` from your mail provider.
- `INSTITUTIONAL_EMAIL_POLICY`: the domains the institute has confirmed.
- `DEPLOY_ENV=production` (or `staging` on the staging server, see [Staging](#staging)).
- `IMAGE_REGISTRY=ghcr.io/owner`, lowercase. Not needed in build mode.
- `STAGING_RELEASES` (production): where `promote` reads staging's `releases.log`, e.g.
  `deploy@staging.example.org:/opt/alumini/deploy/releases.log`. Give this server's user an ssh key that
  staging accepts, read-only if you can (a `command="cat …"` restriction in staging's `authorized_keys`).
- `SMOKE_EMAIL` and `SMOKE_PASSWORD` (hex): a member account kept for the smoke test. Optional on production
  until the account exists (step 7); required on staging.
- `BACKUP_S3_*` and `BACKUP_CIPHER_PASS`: the off-host backup bucket (step 8 says what it needs). The stack
  refuses to start without them.

Leave `RELEASE_SHA` and the `*_IMAGE` lines empty: `deploy.sh` writes them. Database, Redis, storage and ClamAV
addresses come from `compose.yml`, so they are not in `.env`.

**Back up `.env` somewhere safe off the server.** Without `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD` the
data volumes cannot be opened by a rebuilt stack, and a new `BETTER_AUTH_SECRET` signs every user out.
**`BACKUP_CIPHER_PASS` must be escrowed apart from the backup bucket, readable by two people**: every backup
is encrypted with it, and without it none can be restored.

### 5. Registry login (not in build mode)

CI pushes to GitHub Container Registry (the `publish` job in `.github/workflows/pr.yml`). Create a GitHub
token (classic) with only `read:packages`, then:

```bash
echo "$TOKEN" | docker login ghcr.io -u OWNER --password-stdin
```

Packages are private by default. To skip the login, make the four `nitap-*` packages public under GitHub →
Packages instead.

### 6. First release

```bash
/opt/alumini/deploy/deploy.sh pull                     # staging
/opt/alumini/deploy/deploy.sh promote <sha> "Your Name"  # production, once staging has released <sha>
/opt/alumini/deploy/deploy.sh build                    # either, without a registry
```

This migrates the empty database, starts everything, and waits up to 3 minutes for `/health/ready`. In build
mode the first start also compiles pgBackRest into the PostgreSQL image (about a minute). ClamAV downloads its signatures (~300 MB) and takes a few minutes to report healthy.
Until step 8 creates the backup stanza, the postgres log shows `archive-push` errors. Check:

```bash
curl -s https://YOUR.DOMAIN/health/live
deploy/deploy.sh status                  # every service running or healthy
```

### 7. First super admin

```bash
cd /opt/alumini/deploy
# add BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) to .env, then:
docker compose run --rm migrate pnpm --filter @nitap/web admin:bootstrap
# now DELETE both lines from .env
```

It refuses if a super admin already exists. Sign in at `https://YOUR.DOMAIN/login`.

Then register the smoke account (`SMOKE_EMAIL`, with a password from `openssl rand -hex 24`), approve it as a
member from the admin screens, put both in `.env`, and check: `deploy/deploy.sh smoke` prints `smoke: pass`.

### 8. Backups

Design and reasoning: [ADR-011](../docs/architecture/adr/ADR-011-backup-and-recovery.md). PostgreSQL archives
every WAL segment with pgBackRest, at most 5 minutes apart, to an S3-compatible bucket off this server, and
takes base backups on a schedule. Everything is encrypted with `BACKUP_CIPHER_PASS` before it leaves the
host. All jobs run through `deploy/backup.sh`; `deploy/backup.sh` without arguments lists them.

**The bucket**, at a different provider or under a different account from this server (Backblaze B2,
Cloudflare R2, AWS S3, Wasabi, and so on):

- Private, with **versioning on** and a lifecycle rule that deletes noncurrent versions after **30 days**.
- An access key for this bucket only, allowed to list, read, write and delete objects but **not to delete
  object versions**. pgBackRest expires old backups itself, and versioning keeps whatever it (or an attacker
  holding the key) deletes for 30 days.
- `BACKUP_S3_ENDPOINT` is the bare host name (`s3.eu-central-003.backblazeb2.com`); https is required.
  Use `BACKUP_S3_URI_STYLE=path` if the provider does not support bucket subdomains.

**First backup**, right after the first release:

```bash
cd /opt/alumini/deploy
./backup.sh init          # creates the stanza, checks archiving, takes the first full backup
./backup.sh info
```

**Schedule** (`crontab -e`). Output goes to the journal (`journalctl -t alumini-backup`); every run also
appends a line to `deploy/backups.log`.

```cron
0 * * * *    /opt/alumini/deploy/backup.sh check 2>&1 | logger -t alumini-backup
30 2 * * 0   /opt/alumini/deploy/backup.sh backup full 2>&1 | logger -t alumini-backup
30 2 * * 1-6 /opt/alumini/deploy/backup.sh backup diff 2>&1 | logger -t alumini-backup
0 3 * * *    /opt/alumini/deploy/backup.sh uploads 2>&1 | logger -t alumini-backup
0 4 * * 0    /opt/alumini/deploy/backup.sh verify 2>&1 | logger -t alumini-backup
30 4 * * 0   /opt/alumini/deploy/backup.sh dump 2>&1 | logger -t alumini-backup
0 5 1 * *    /opt/alumini/deploy/backup.sh restore-test 2>&1 | logger -t alumini-backup
```

The hourly `check` forces a WAL switch, so archiving is proven even when nobody writes. `restore-test`
restores the latest backup into a separate `postgres-restore` container, applies migrations, re-validates
every constraint, runs `pg_amcheck`, and deletes the copy. It needs about as much free disk as the database.

**Monitoring.** Each successful job writes `alumini_backup_last_success_timestamp_seconds{kind}` to
`/var/lib/prometheus/node-exporter` (override with `BACKUP_METRICS_DIR`), for node_exporter's textfile
collector. The alerts are in [`ops/prometheus/rules/backups.yml`](../ops/prometheus/rules/backups.yml), and
[runbook R-8](../ops/runbooks/R-8.md) covers them. Create the directory once:

```bash
sudo mkdir -p /var/lib/prometheus/node-exporter && sudo chown $USER /var/lib/prometheus/node-exporter
```

**Before a risky change** (a large migration, a bulk admin action): `./backup.sh mark "what and why"`
records the exact time to restore to if the change goes wrong.

**Restoring.** Follow the runbook in
[reliability §7.3](../docs/operations/reliability-operations.md#73-postgresql-restore-runbook). In short:

```bash
./backup.sh restore                                   # host loss: latest state, onto an empty volume
./backup.sh restore --target "2026-10-08 09:30:00+00" --set-aside   # back to a moment; keeps the old cluster
./backup.sh integrity                                 # migrations, constraints, row counts
docker compose run --rm worker node apps/worker/src/cli.ts outbox:settle --before "<target>"   # dry run, then --execute
docker compose up -d
```

On a **new server**: steps 1–5, the same `.env`, then `./backup.sh restore` before the first release.
Uploads come back with `./backup.sh uploads-restore`. Logical dumps (`dumps/` in the bucket) restore
into any PostgreSQL version:

```bash
docker compose run --rm --no-deps -T backup-tools 'mc cat "backup/$BACKUP_S3_BUCKET/dumps/weekly/NAME"' |
  docker compose exec -T postgres sh -c 'openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
    -pass env:PGBACKREST_REPO1_CIPHER_PASS | pg_restore -U alumini -d alumini --clean --if-exists'
```

### 9. Monitoring

The rules, routing, dashboards and runbooks are code in [`ops/`](../ops/README.md). `monitoring.yml` runs them
on this host as a second compose project, joined to the application's network: Prometheus, Alertmanager,
Grafana, node_exporter (disk, memory, CPU and the backup timestamps from step 8), postgres and Redis exporters,
and a blackbox exporter that probes `https://YOUR.DOMAIN/health/ready` the way users reach it (TLS, Nginx,
certificate expiry). Nothing is published except on `127.0.0.1`.

**Outside this host, before launch** (reliability §5.1; a monitor on the host dies with it):

- **A dead-man's switch:** a service that pages when a heartbeat it expects every minute stops for 3 minutes
  (Healthchecks.io, Better Stack, Cronitor, PagerDuty's, and so on). Its webhook URL is `ALERT_DEADMANS_SWITCH_URL`.
- **An external uptime check** on `https://YOUR.DOMAIN/health/ready`, every minute, paging after 2 failures.
- **Where pages and tickets go:** a webhook for each (a paging service, or a chat channel through its incoming
  webhook): `ALERT_PAGER_URL` and `ALERT_TICKET_URL`.

```bash
cd /opt/alumini/deploy
cp monitoring.env.example monitoring.env && chmod 600 monitoring.env
openssl rand -hex 24      # MONITORING_DB_PASSWORD
openssl rand -base64 24   # GRAFANA_ADMIN_PASSWORD
nano monitoring.env       # the two passwords and the three receiver URLs
./monitoring.sh up -d
./monitoring.sh ps
```

`monitoring.env` is separate from `.env` because every application container receives `.env` as its
environment, and the receivers' URLs are secrets. `monitoring.sh` passes both files to compose, so the stack
also reads `DEPLOY_ENV`, `APP_URL`, `HEALTH_CHECK_TOKEN` and `POSTGRES_PASSWORD` from `.env`. On every `up` it
creates or updates the `monitoring` database role (`pg_monitor`: statistics, no table data) that
postgres-exporter signs in with.

Check it within a few minutes:

- Grafana over an SSH tunnel: `ssh -L 3030:127.0.0.1:3030 you@server`, then <http://localhost:3030> (`admin`,
  `GRAFANA_ADMIN_PASSWORD`). Prometheus on 9090 and Alertmanager on 9093 work the same way.
- Prometheus → Status → Targets: every target is up.
- The dead-man's switch shows a heartbeat every minute.
- `./monitoring.sh exec alertmanager amtool alert add DrillTest severity=ticket service=monitoring
--alertmanager.url=http://localhost:9093` and a ticket arrives within a minute. Pages are tested the same way
  with `severity=page`.

After a `git pull` that changed `ops/` or `monitoring.yml`: `./monitoring.sh up -d`. Rules and dashboards
are read at start, so `./monitoring.sh restart prometheus grafana` picks up rule-only changes. A
`docker compose down` of the application removes its network: run `./monitoring.sh up -d` again after it.

## Staging

A second, smaller server (2 vCPU, 4 GB) set up with steps 1–9, with these differences in `deploy/.env`:

- `DEPLOY_ENV=staging` and `COMPOSE_PROJECT_NAME=alumini-staging`. If it has to share the production host,
  also `WEB_PORT=3001` and a second Nginx site; it then shares that host's disk, memory and failures, which is
  why a separate server is recommended (spec 18 PRD-1).
- Its own domain (e.g. `staging.alumni.example.org`), secrets, SMTP credentials (a sandbox inbox, so test
  mail reaches no one), and its own backup bucket or at least its own prefix. **No production secret is ever
  copied here** (reliability §8.2).
- Data is synthetic, never a copy of production: register test accounts, or load the performance seed.
- `SMOKE_EMAIL` and `SMOKE_PASSWORD` are required: without a passing smoke test, nothing can be promoted.
- Monitoring (step 9) is optional. If you run it, send its pages to the ticket receiver: staging pages wake no
  one. Every alert carries `environment=staging`.

## Releasing

Merge to `main` and wait for the **Publish images** job to go green (its run summary lists the four digests).
Then:

```bash
/opt/alumini/deploy/deploy.sh pull                       # on staging
/opt/alumini/deploy/deploy.sh promote <sha> "Your Name"  # on production, after checking staging
```

Each release:

1. Moves the clone to the commit: `git pull --ff-only` on staging; on production, a fast-forward to exactly
   `<sha>`, which must be on `origin/main`. A dirty clone or a diverged history is refused.
2. Staging pulls `nitap-*:<sha>` and pins each image's digest. Production takes the digests from the staging
   line for `<sha>` and refuses if there is none with `source=pull` and `smoke=pass`.
3. Runs `prisma migrate deploy` and then the reference seed (roles, permissions, departments; insert-only, so
   it adds what the release introduces and never changes what an admin edited) as a one-shot container. **If this fails, nothing else changes**: the old
   release keeps serving, and `.env` points at it again.
4. `docker compose up -d` replaces web and worker (and postgres, when its image changed). The site is down for
   a few seconds. This is the documented stop-gap ([reliability §8.3](../docs/operations/reliability-operations.md#83-production-deploy-procedure-single-host-zero-downtime-by-bluegreen));
   blue/green is not built (spec 18 PRD-2), so release outside busy hours.
5. Waits for `/health/ready`, runs the smoke test, and appends the release to `deploy/releases.log`: commit,
   environment, source, the four images, smoke result, who released it, and the release it replaced. A failed
   smoke test is logged, exits non-zero and prints the rollback command.

Migrations must be expand-only ([reliability §9.3](../docs/operations/reliability-operations.md#93-expand--migrate--contract)):
the previous release has to keep working on the new schema, which is what makes rollback safe.

## Rollback

```bash
deploy/deploy.sh status                  # live release, its images, the recent history
deploy/deploy.sh rollback <previous-sha>
```

This restarts the services on the images that `releases.log` recorded for that SHA, then runs the smoke test.
It does not touch git or the database. Digests are pulled again if they were pruned; build-mode images must
still be on the host, so do not prune them (see below). A bad migration is fixed with a new forward
migration, never by rolling the schema back.

To return to the newer release, `promote` it again (or `pull` on staging). To stay on the old one, revert
the bad commit on `main` and release that.

## Operating

```bash
cd /opt/alumini/deploy
docker compose logs -f web worker        # JSON logs, one line per event, with request_id
docker compose ps
docker compose restart worker
docker compose exec postgres psql -U alumini alumini
```

- **Disk:** images pile up, about 1 GB per release. Keep the last few for rollback:
  `docker image ls 'nitap-*'` (build mode) or `docker image ls --digests 'ghcr.io/*/nitap-*'`, and delete
  images no recent `releases.log` line names with `docker image rm`. Do not run `docker system prune -a`: it deletes the rollback images.
- **Health:** `/health/live`, `/health/ready` and `/health/startup` are public. `/metrics` and `/health/drain`
  answer only from the host (Nginx) and only with `Authorization: Bearer $HEALTH_CHECK_TOKEN` (the app).
- **Monitoring:** step 9. `./monitoring.sh ps`, `./monitoring.sh logs -f prometheus`. Each alert links its
  runbook in [`ops/runbooks/`](../ops/runbooks/).
- **Logs** are capped per container (5 × 10 MB, `compose.yml`), so `docker compose logs` reaches back hours,
  not weeks. Anything older is in the error tracker, or gone.
- **PostgreSQL major upgrade:** the data volume belongs to one major version, and a newer image refuses
  it. Dump (`./backup.sh dump`, or `pg_dump -Fc` to a file), `docker compose down`, remove the
  `alumini-prod_postgres-data` volume, release, restore the dump, then `./backup.sh backup full`. Physical
  backups from the old version cannot be restored into the new one. A server that ran this stack before
  PostgreSQL 18 (Phase 17) needs this once.
- **Secrets rotation:** edit `.env`, then `docker compose up -d`. Changing `POSTGRES_PASSWORD` or
  `MINIO_ROOT_*` after the first start also needs the password changed inside the service, because the
  volumes keep the old one.

## Before launch

- [ ] `INSTITUTIONAL_EMAIL_POLICY` lists the institute's confirmed domains
- [ ] Real SMTP sends: register a test account and receive the verification email
- [ ] Upload a profile photo; it appears after the scan (ClamAV healthy)
- [ ] Backup bucket off-host, versioned, key without version-delete; `BACKUP_CIPHER_PASS` escrowed with two people
- [ ] `./backup.sh init` done, cron installed, `./backup.sh info` shows backups and WAL reaching the present
- [ ] `./backup.sh restore-test` passes on the server, recorded in [restore-tests](../docs/operations/restore-tests.md)
- [ ] External uptime check on `/health/ready`, paging from outside the host
- [ ] Monitoring up (step 9): every Prometheus target up, a test ticket and a test page received, the
      dead-man's switch receiving heartbeats; then `./monitoring.sh stop prometheus` pages within 5 minutes,
      and `./monitoring.sh start prometheus`
- [ ] The domain set to auto-renew at the registrar, with its expiry emails going to a shared mailbox
- [ ] Staging set up and a release promoted from it (`releases.log` on production shows `source=promote`)
- [ ] A rollback rehearsed on staging and once on production: release, `rollback <previous>`, release again
