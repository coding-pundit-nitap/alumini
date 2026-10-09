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
exec docker compose -p "$app-monitoring" -f monitoring.yml --env-file .env --env-file monitoring.env "$@"
