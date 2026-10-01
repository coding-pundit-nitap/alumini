#!/usr/bin/env bash
# Releases a commit on the self-hosted server (deploy/README.md). Run from anywhere inside the clone:
#
#   deploy/deploy.sh build           git pull, build the three images on this host, release them
#   deploy/deploy.sh pull            git pull, pull CI's images for that same commit, release them
#   deploy/deploy.sh rollback <sha>  start web and worker on an earlier release (no git, no migrations)
#   deploy/deploy.sh status          current release and the history
#
# A release is: migrate (one-shot) → web and worker on the new images → wait for /health/ready.
set -euo pipefail

cd "$(dirname "$0")"
REPO=..
LOG=releases.log
READY_URL=http://127.0.0.1:3000/health/ready
READY_TIMEOUT_S=180

die() { echo "deploy: $*" >&2; exit 1; }
env_get() { sed -n "s/^$1=//p" .env | tail -1 | tr -d "\"'"; }
env_set() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

[ -f .env ] || die "deploy/.env is missing; copy deploy/.env.example and fill it in (README step 4)"

git_update() {
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] ||
    die "the clone has local changes; the server must run exactly what is in git"
  # Progress to stderr: stdout is the SHA the caller captures.
  git -C "$REPO" pull --ff-only >&2
  git -C "$REPO" rev-parse HEAD
}

build_images() {
  local sha=$1
  docker build -f "$REPO/docker/web.Dockerfile" --build-arg GIT_SHA="$sha" -t "nitap-web:$sha" "$REPO"
  docker build -f "$REPO/docker/web.Dockerfile" --build-arg GIT_SHA="$sha" --target migrate \
    -t "nitap-migrate:$sha" "$REPO"
  docker build -f "$REPO/docker/worker.Dockerfile" --build-arg GIT_SHA="$sha" -t "nitap-worker:$sha" "$REPO"
}

wait_ready() {
  local waited=0
  until curl -sf -o /dev/null "$READY_URL"; do
    if [ "$waited" -ge "$READY_TIMEOUT_S" ]; then
      docker compose logs --tail 50 web worker
      die "web is not ready after ${READY_TIMEOUT_S}s (logs above). Roll back: deploy/deploy.sh rollback <sha>"
    fi
    sleep 3
    waited=$((waited + 3))
  done
}

release() {
  local prefix=$1 sha=$2 migrate=$3 previous previous_prefix
  previous=$(env_get IMAGE_TAG)
  previous_prefix=$(env_get IMAGE_PREFIX)
  env_set IMAGE_PREFIX "$prefix"
  env_set IMAGE_TAG "$sha"
  if [ "$migrate" = yes ]; then
    # A failed migration stops here, before the running release is touched.
    docker compose run --rm migrate || {
      env_set IMAGE_PREFIX "$previous_prefix"
      env_set IMAGE_TAG "$previous"
      die "migration failed; the previous release ($previous) is still running"
    }
  fi
  docker compose up -d --remove-orphans
  wait_ready
  echo "$(date -u +%FT%TZ) ${prefix}*:$sha (was ${previous:-none})" >> "$LOG"
  echo "deploy: $sha is live"
}

case "${1:-}" in
  build)
    sha=$(git_update)
    build_images "$sha"
    release "nitap-" "$sha" yes
    ;;
  pull)
    registry=$(env_get IMAGE_REGISTRY)
    [ -n "$registry" ] || die "set IMAGE_REGISTRY in deploy/.env (e.g. ghcr.io/owner)"
    sha=$(git_update)
    prefix="$registry/nitap-"
    for name in web migrate worker; do
      docker pull "${prefix}${name}:$sha" ||
        die "no ${name} image for $sha yet: CI publishes only after every check on main passes"
    done
    release "$prefix" "$sha" yes
    ;;
  rollback)
    sha=${2:-}
    [ -n "$sha" ] || die "usage: deploy/deploy.sh rollback <sha>  (see: deploy/deploy.sh status)"
    # Expand-only migrations (reliability §9.3) keep the older release working on the newer schema.
    release "$(env_get IMAGE_PREFIX)" "$sha" no
    ;;
  status)
    echo "live: $(env_get IMAGE_PREFIX)*:$(env_get IMAGE_TAG)"
    [ -f "$LOG" ] && tail -n 10 "$LOG"
    docker compose ps
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac
