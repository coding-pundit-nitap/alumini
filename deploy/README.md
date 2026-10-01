# Self-hosted deployment

How to run the alumni network on one Linux server: setup from scratch, releases, rollback, and backups. This
is the single-host stage 0 topology from [reliability §8](../docs/operations/reliability-operations.md#8-deployment--rollback).

```text
Internet ─▶ Nginx on the host (TLS, rate limit, 6 MB bodies) ─▶ 127.0.0.1:3000 web
                                                                   │
            compose network (nothing else published) ──────────────┤
            postgres · redis (cache) · queue-redis · minio · clamav · worker
```

| File                 | What                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| `compose.yml`        | Production services. Only `web` is published, on `127.0.0.1:3000`         |
| `.env.example`       | Template for `deploy/.env` (gitignored): secrets, domain, SMTP, image tag |
| `deploy.sh`          | `build` / `pull` / `rollback <sha>` / `status`                            |
| `nginx/alumini.conf` | Host Nginx site                                                           |

The server is a clone of this repository. Every release runs exactly one commit: `deploy.sh` refuses a clone
with local changes, pulls `main`, and releases that commit's images, built on the server or by CI.

## Choose how images are built

|                     | `deploy.sh build`: build on the server            | `deploy.sh pull`: use CI's images                          |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| What happens        | `git pull`, `docker build` × 3 on the server      | `git pull`, `docker pull` the images CI built for that SHA |
| Needs               | 4 GB RAM free for `next build` (add swap, step 1) | Registry login on the server (step 5)                      |
| Release time        | ~5–10 min (Docker cache helps)                    | ~1 min                                                     |
| Ships a red commit? | Possible: nothing checks CI first                 | No: CI publishes only after every check on `main` passes   |

`pull` is the safer default. `build` needs nothing outside the server. You can switch between them for any
release.

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
nano .env
```

Fill in:

- the secrets above. Hex only for the first two, because they go inside URLs.
- `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` and `APP_URL`: all `https://YOUR.DOMAIN`.
- `SMTP_URL` and `EMAIL_FROM` from your mail provider.
- `INSTITUTIONAL_EMAIL_POLICY`: the domains the institute has confirmed.
- `IMAGE_REGISTRY=ghcr.io/owner`, lowercase. Needed for pull mode only.

Leave `IMAGE_PREFIX` and `IMAGE_TAG` empty: `deploy.sh` writes them. Database, Redis, storage and ClamAV
addresses come from `compose.yml`, so they are not in `.env`.

**Back up `.env` somewhere safe off the server.** Without `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD` the
data volumes cannot be opened by a rebuilt stack, and a new `BETTER_AUTH_SECRET` signs every user out.

### 5. Registry login (pull mode only)

CI pushes to GitHub Container Registry (the `publish` job in `.github/workflows/pr.yml`). Create a GitHub
token (classic) with only `read:packages`, then:

```bash
echo "$TOKEN" | docker login ghcr.io -u OWNER --password-stdin
```

Packages are private by default. To skip the login, make the three `nitap-*` packages public under GitHub →
Packages instead.

### 6. First release

```bash
/opt/alumini/deploy/deploy.sh pull       # or: deploy.sh build
```

This migrates the empty database, starts everything, and waits up to 3 minutes for `/health/ready`. On the
very first start ClamAV downloads its signatures (~300 MB) and takes a few minutes to report healthy. Check:

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

### 8. Backups

Backup tooling is not built yet (Phase 17). Until it is, take at least a nightly database dump and an
uploads copy, and move both **off the server**:

```bash
sudo mkdir -p /var/backups/alumini && sudo chown $USER /var/backups/alumini
crontab -e
```

```cron
0 3 * * * cd /opt/alumini/deploy && docker compose exec -T postgres pg_dump -U alumini -Fc alumini > /var/backups/alumini/db-$(date +\%F).dump
30 3 * * * docker run --rm -v alumini-prod_minio-data:/data:ro -v /var/backups/alumini:/out alpine tar czf /out/uploads-$(date +\%F).tgz -C /data .
0 4 * * * find /var/backups/alumini -mtime +14 -delete
```

Restore the database into a running stack with
`docker compose exec -T postgres pg_restore -U alumini -d alumini --clean --if-exists < db-DATE.dump`.
Test a restore before you rely on one.

## Releasing

Merge to `main`. In pull mode, wait for the **Publish images** job to go green. Then on the server:

```bash
/opt/alumini/deploy/deploy.sh pull       # or: deploy.sh build
```

Each release:

1. `git pull --ff-only` (refuses a dirty clone or a diverged history).
2. Builds or pulls `web`, `migrate` and `worker` for that SHA.
3. Runs `prisma migrate deploy` as a one-shot container. **If this fails, nothing else changes**: the old
   release keeps serving, and `.env` points at it again.
4. `docker compose up -d` replaces web and worker. The site is down for a few seconds. This is the documented
   stop-gap ([reliability §8.3](../docs/operations/reliability-operations.md#83-production-deploy-procedure-single-host-zero-downtime-by-bluegreen));
   blue/green is not built yet, so release outside busy hours.
5. Waits for `/health/ready`, then records the release in `deploy/releases.log`.

Migrations must be expand-only ([reliability §9.3](../docs/operations/reliability-operations.md#93-expand--migrate--contract)):
the previous release has to keep working on the new schema, which is what makes rollback safe.

## Rollback

```bash
deploy/deploy.sh status                  # recent releases and their SHAs
deploy/deploy.sh rollback <previous-sha>
```

This restarts web and worker on that SHA's images. It does not touch git or the database. In build mode the
images must still be on the host, so do not prune them (see below). In pull mode they are pulled again if
missing. A bad migration is fixed with a new forward migration, never by rolling the schema back.

The next `deploy.sh pull` or `build` returns to the newest `main`. To stay on the old release, revert the bad
commit on `main` first.

## Operating

```bash
cd /opt/alumini/deploy
docker compose logs -f web worker        # JSON logs, one line per event, with request_id
docker compose ps
docker compose restart worker
docker compose exec postgres psql -U alumini alumini
```

- **Disk:** images pile up, about 1 GB per release. Keep the last few for rollback:
  `docker image ls 'nitap-*'` (build mode) or `docker image ls 'ghcr.io/*/nitap-*'` (pull mode), and delete
  old SHAs with `docker image rm`. Do not run `docker system prune -a`: it deletes the rollback images.
- **Health:** `/health/live`, `/health/ready` and `/health/startup` are public. `/metrics` and `/health/drain`
  answer only from the host (Nginx) and only with `Authorization: Bearer $HEALTH_CHECK_TOKEN` (the app).
- **Monitoring:** the Prometheus, Alertmanager and Grafana stack in [`ops/`](../ops/README.md) is not part of
  this compose file yet. Add an external uptime check on `https://YOUR.DOMAIN/health/ready` at minimum.
- **Secrets rotation:** edit `.env`, then `docker compose up -d`. Changing `POSTGRES_PASSWORD` or
  `MINIO_ROOT_*` after the first start also needs the password changed inside the service, because the
  volumes keep the old one.

## Before launch

- [ ] `INSTITUTIONAL_EMAIL_POLICY` lists the institute's confirmed domains
- [ ] Real SMTP sends: register a test account and receive the verification email
- [ ] Upload a profile photo; it appears after the scan (ClamAV healthy)
- [ ] Backups run, a copy lands off the server, and one restore has been tried
- [ ] External uptime check on `/health/ready`
- [ ] A rollback rehearsed: release, `rollback <previous>`, release again
