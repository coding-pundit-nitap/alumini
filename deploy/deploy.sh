#!/usr/bin/env bash
# Releases a commit on a self-hosted server (deploy/README.md). Run from anywhere inside the clone. The clone's
# deploy/.env says which environment it is (DEPLOY_ENV=staging or production; production when unset).
#
#   deploy/deploy.sh build                     git pull, build the four images on this host, release them
#   deploy/deploy.sh pull                      staging: git pull, pull CI's images for that commit, pin them by
#                                              digest, release, smoke test
#   deploy/deploy.sh promote <sha> <approver>  production: release exactly the digests that passed staging's
#                                              smoke test for <sha>
#   deploy/deploy.sh rollback <sha>            start web and worker on an earlier release (no git, no migrations)
#   deploy/deploy.sh smoke                     run the smoke test against the live release
#   deploy/deploy.sh status                    current release and the history
#
# A release is: migrate (one-shot) → every service on the new images → wait for /health/ready → smoke test →
# one line in releases.log, which holds the images by reference and is what rollback and promote read.
set -euo pipefail

cd "$(dirname "$0")"
REPO=..
LOG=releases.log
READY_TIMEOUT_S=180
IMAGES=(web worker migrate postgres)

die() { echo "deploy: $*" >&2; exit 1; }
env_get() { sed -n "s/^$1=//p" .env | tail -1 | tr -d "\"'"; }
env_set() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
# releases.log lines are `<time> key=value …`; values never contain spaces.
field() { sed -n "s/.* $2=\([^ ]*\).*/\1/p" <<< "$1"; }
var_of() { echo "${1^^}_IMAGE"; }

[ -f .env ] || die "deploy/.env is missing; copy deploy/.env.example and fill it in (README step 4)"
ENVIRONMENT=$(env_get DEPLOY_ENV)
ENVIRONMENT=${ENVIRONMENT:-production}
case "$ENVIRONMENT" in staging | production) ;; *) die "DEPLOY_ENV must be staging or production" ;; esac
WEB_PORT=$(env_get WEB_PORT)
READY_URL=http://127.0.0.1:${WEB_PORT:-3000}/health/ready

require_clean() {
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] ||
    die "the clone has local changes; the server must run exactly what is in git"
}

git_update() {
  require_clean
  # Progress to stderr: stdout is the SHA the caller captures.
  git -C "$REPO" pull --ff-only >&2
  git -C "$REPO" rev-parse HEAD
}

# Moves the clone forward to exactly <sha>, which must already be on origin/main.
git_advance() {
  local sha=$1
  require_clean
  git -C "$REPO" fetch --quiet origin
  git -C "$REPO" merge-base --is-ancestor "$sha" origin/main ||
    die "$sha is not on origin/main"
  git -C "$REPO" merge-base --is-ancestor HEAD "$sha" ||
    die "this clone is already past $sha; to go back to an older release use: deploy/deploy.sh rollback $sha"
  git -C "$REPO" merge --quiet --ff-only "$sha" >&2
}

build_images() {
  local sha=$1
  docker build -f "$REPO/docker/web.Dockerfile" --build-arg GIT_SHA="$sha" -t "nitap-web:$sha" "$REPO"
  docker build -f "$REPO/docker/web.Dockerfile" --build-arg GIT_SHA="$sha" --target migrate \
    -t "nitap-migrate:$sha" "$REPO"
  docker build -f "$REPO/docker/worker.Dockerfile" --build-arg GIT_SHA="$sha" -t "nitap-worker:$sha" "$REPO"
  docker build -f "$REPO/docker/postgres.Dockerfile" -t "nitap-postgres:$sha" "$REPO/docker"
}

# The digest reference (repo@sha256:…) of a tag that has been pulled.
digest_of() {
  local ref=$1 repo=${1%:*} digest
  digest=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$ref" | grep -m1 "^$repo@") ||
    die "no registry digest for $ref"
  echo "$digest"
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

# Ready, sign in with the smoke account, one authenticated read: the restore drill's check (spec 17 DR-12),
# through the public URL so TLS and Nginx are in the path. Prints pass, fail or skipped (no smoke account).
smoke() {
  local url origin email password headers code cookie
  origin=$(env_get APP_URL)
  url=$(env_get SMOKE_URL)
  url=${url:-$origin}
  email=$(env_get SMOKE_EMAIL)
  password=$(env_get SMOKE_PASSWORD)
  if [ -z "$email" ] || [ -z "$password" ]; then echo skipped; return; fi
  headers=$(mktemp)
  # shellcheck disable=SC2064 # expand now: $headers is local
  trap "rm -f '$headers'" RETURN
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url/health/ready") || code=000
  if [ "$code" != 200 ]; then echo "deploy: smoke: $url/health/ready answered $code" >&2; echo fail; return; fi
  # SMOKE_PASSWORD is hex (README), so it needs no JSON escaping.
  code=$(curl -s -o /dev/null -D "$headers" -w '%{http_code}' -X POST "$url/api/auth/sign-in/email" \
    -H 'content-type: application/json' -H "origin: $origin" \
    --data "{\"email\":\"$email\",\"password\":\"$password\"}") || code=000
  if [ "$code" != 200 ]; then echo "deploy: smoke: sign-in answered $code" >&2; echo fail; return; fi
  # Sent by hand: curl's cookie engine drops Secure cookies when SMOKE_URL is plain http.
  cookie=$(tr -d '\r' < "$headers" | sed -n 's/^[Ss]et-[Cc]ookie: *\([^;]*\).*/\1/p' | paste -sd ';' - | sed 's/;/; /g')
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "cookie: $cookie" "$url/api/v1/alumni?limit=5") || code=000
  if [ "$code" != 200 ]; then echo "deploy: smoke: GET /api/v1/alumni answered $code" >&2; echo fail; return; fi
  echo pass
}

# release <sha> <source> <migrate yes|no> <by> <web> <worker> <migrate> <postgres>
release() {
  local sha=$1 source=$2 migrate=$3 by=$4 refs=("${@:5}") previous i var result line
  previous=$(env_get RELEASE_SHA)
  declare -A before
  for i in "${!IMAGES[@]}"; do
    var=$(var_of "${IMAGES[$i]}")
    before[$var]=$(env_get "$var")
    env_set "$var" "${refs[$i]}"
  done
  env_set RELEASE_SHA "$sha"
  if [ "$migrate" = yes ]; then
    # A failed migration stops here, before the running release is touched.
    docker compose run --rm migrate || {
      for var in "${!before[@]}"; do env_set "$var" "${before[$var]}"; done
      env_set RELEASE_SHA "$previous"
      die "migration failed; the previous release (${previous:-none}) is still running"
    }
  fi
  docker compose up -d --remove-orphans
  wait_ready
  result=$(smoke)
  line="$(date -u +%FT%TZ) sha=$sha env=$ENVIRONMENT source=$source"
  for i in "${!IMAGES[@]}"; do line+=" ${IMAGES[$i]}=${refs[$i]}"; done
  line+=" smoke=$result by=${by// /_} was=${previous:-none}"
  echo "$line" >> "$LOG"
  [ "$result" != fail ] || die "$sha is live but failed the smoke test (above). Roll back: deploy/deploy.sh rollback ${previous:-<sha>}"
  echo "deploy: $sha is live (smoke: $result)"
}

case "${1:-}" in
  build)
    sha=$(git_update)
    build_images "$sha"
    [ "$ENVIRONMENT" = staging ] || echo "deploy: build mode skips staging; this release is not promoted" >&2
    release "$sha" build yes "$(whoami)" "nitap-web:$sha" "nitap-worker:$sha" "nitap-migrate:$sha" "nitap-postgres:$sha"
    ;;
  pull)
    [ "$ENVIRONMENT" = staging ] ||
      die "production releases what staging tested: deploy/deploy.sh promote <sha> <approver> (README Releasing)"
    registry=$(env_get IMAGE_REGISTRY)
    [ -n "$registry" ] || die "set IMAGE_REGISTRY in deploy/.env (e.g. ghcr.io/owner)"
    sha=$(git_update)
    refs=()
    for name in "${IMAGES[@]}"; do
      docker pull "$registry/nitap-$name:$sha" ||
        die "no $name image for $sha yet: CI publishes only after every check on main passes"
      refs+=("$(digest_of "$registry/nitap-$name:$sha")")
    done
    release "$sha" pull yes "$(whoami)" "${refs[@]}"
    ;;
  promote)
    [ "$ENVIRONMENT" = production ] || die "promote is for production; staging releases with: deploy/deploy.sh pull"
    sha=${2:-}
    approver=${3:-}
    [ -n "$sha" ] && [ -n "$approver" ] || die "usage: deploy/deploy.sh promote <sha> <approver>"
    staging=$(env_get STAGING_RELEASES)
    [ -n "$staging" ] || die "set STAGING_RELEASES in deploy/.env: staging's releases.log, as a path or host:path"
    if [[ "$staging" == /* ]]; then
      staged=$(cat "$staging") || die "cannot read $staging"
    else
      staged=$(ssh -o BatchMode=yes "${staging%%:*}" cat "${staging#*:}") || die "cannot read $staging over ssh"
    fi
    line=$(grep " sha=$sha" <<< "$staged" | grep " env=staging " | grep " source=pull " | grep " smoke=pass " | tail -1) ||
      die "$sha has no staging release from CI's images with a passing smoke test; release it on staging first"
    sha=$(field "$line" sha)
    git_advance "$sha"
    refs=()
    for name in "${IMAGES[@]}"; do
      refs+=("$(field "$line" "$name")")
      docker pull "${refs[-1]}"
    done
    release "$sha" promote yes "$approver" "${refs[@]}"
    ;;
  rollback)
    sha=${2:-}
    [ -n "$sha" ] || die "usage: deploy/deploy.sh rollback <sha>  (see: deploy/deploy.sh status)"
    line=$(grep " sha=$sha" "$LOG" | grep " web=" | tail -1) || die "$sha is not in $LOG"
    sha=$(field "$line" sha)
    refs=()
    for name in "${IMAGES[@]}"; do refs+=("$(field "$line" "$name")"); done
    # Pull mode: digests pull again if pruned. Build mode: the images must still be on the host (README).
    for ref in "${refs[@]}"; do
      docker image inspect "$ref" > /dev/null 2>&1 || docker pull "$ref" ||
        die "$ref is gone from this host; rebuild it from git or release forward instead"
    done
    # Expand-only migrations (reliability §9.3) keep the older release working on the newer schema.
    release "$sha" rollback no "$(whoami)" "${refs[@]}"
    ;;
  smoke)
    result=$(smoke)
    echo "smoke: $result"
    [ "$result" != fail ]
    ;;
  status)
    echo "$ENVIRONMENT, live: $(env_get RELEASE_SHA)"
    for name in "${IMAGES[@]}"; do echo "  $name: $(env_get "$(var_of "$name")")"; done
    [ -f "$LOG" ] && tail -n 10 "$LOG"
    docker compose ps
    ;;
  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
