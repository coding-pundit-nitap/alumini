#!/usr/bin/env bash
# Runs deploy/monitoring.yml beside this clone's application stack: `docker compose` with the
# project `<app project>-monitoring`, joined to the application's network, reading deploy/.env and
# deploy/monitoring.env. Takes any compose arguments:
#
#   deploy/monitoring.sh up -d           start or update the stack (after a git pull, too)
#   deploy/monitoring.sh ps              what runs
#   deploy/monitoring.sh logs -f prometheus
#   deploy/monitoring.sh down            stop it; the data volumes stay
#
# The project name never comes from COMPOSE_PROJECT_NAME: shared with the app, each stack would see the
# other's containers as orphans.
set -euo pipefail

cd "$(dirname "$0")"
for file in .env monitoring.env; do
  [ -f "$file" ] || { echo "monitoring: deploy/$file is missing (deploy/README.md, Monitoring)" >&2; exit 1; }
done
app=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env | tail -1 | tr -d "\"'")
app=${app:-alumini-prod}
export APP_NETWORK=${app}_default
# Alert runbook links: RUNBOOK_BASE from .env, else this clone's GitHub origin, so a fork links its own runbooks.
runbook_base=$(sed -n 's/^RUNBOOK_BASE=//p' .env | tail -1 | tr -d "\"'")
if [ -z "$runbook_base" ]; then
  origin=$(git remote get-url origin 2>/dev/null || true)
  repo=$(printf '%s' "$origin" | sed -nE 's#^(git@github\.com:|ssh://git@github\.com/|https://github\.com/)([^/]+/[^/]+)$#\2#p')
  repo=${repo%.git}
  [ -n "$repo" ] || { echo "monitoring: set RUNBOOK_BASE in deploy/.env (origin is not a GitHub URL)" >&2; exit 1; }
  runbook_base=https://github.com/$repo/blob/main/ops/runbooks
fi
export RUNBOOK_BASE=$runbook_base
exec docker compose -p "$app-monitoring" -f monitoring.yml --env-file .env --env-file monitoring.env "$@"
