#!/usr/bin/env sh
# Pre-commit secret scan of the staged changes (strategy §10.2: gitleaks pre-commit AND in CI; spec 16 16E).
# Uses a local gitleaks when installed, else the pinned container; with neither it warns and lets the commit
# through, because the CI secret-scan job still blocks the merge.
set -eu
GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.0"
root=$(git rev-parse --show-toplevel)

if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks git --pre-commit --staged --redact --no-banner "$root"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  # A worktree's .git is a file pointing into the main repository's .git, so mount that too.
  common=$(git rev-parse --path-format=absolute --git-common-dir)
  exec docker run --rm -v "$root:$root:ro" -v "$common:$common:ro" -w "$root" \
    "$GITLEAKS_IMAGE" git --pre-commit --staged --redact --no-banner "$root"
fi

echo "secret scan skipped: install gitleaks or start Docker (CI still scans)" >&2
