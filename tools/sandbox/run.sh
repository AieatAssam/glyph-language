#!/usr/bin/env bash
# Runs inside the sandbox container for one repo checkout. Two modes:
#
#   Merge-gate check (unchanged):
#     run.sh REPO_DIR OUT_DIR [--pr N --sha S --base-sha B]
#     Writes OUT_DIR/result.json. The checker's own tools/ and toolkit/ come from this checkout
#     (trusted), mounted read-only; the candidate repo is mounted read-only at /repo.
#
#   Bench command (held-out runs):
#     run.sh REPO_DIR OUT_DIR -- CMD [ARGS...]
#     Runs CMD from /checker. REPO_DIR is mounted read-only at /repo and OUT_DIR read-write at /out.
#     bench/ and governance/ are mounted read-only at /checker. The caller must not pass secrets:
#     docker receives no environment from this script and no key file is mounted.
#
# Both modes: --network none, read-only root filesystem, non-root user, tmpfs /tmp and home.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
image="${GLYPH_SANDBOX_IMAGE:-glyph-sandbox}"

if [[ $# -lt 2 ]]; then
  echo "usage: run.sh REPO_DIR OUT_DIR [check args... | -- CMD [ARGS...]]" >&2
  exit 2
fi
repo="$(cd "$1" && pwd)"
mkdir -p "$2"
out="$(cd "$2" && pwd)"
shift 2

if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build -t "$image" "$here"
fi

common=(
  --rm
  --network none
  --read-only
  --user 10001:10001
  --memory 4g
  --cpus 2
  --pids-limit 512
  --tmpfs /tmp:rw,size=1g,mode=1777
  --tmpfs /home/runner:rw,size=256m,uid=10001,gid=10001
  -v "$repo:/repo:ro"
  -v "$out:/out:rw"
  -w /checker
)

if [[ "${1:-}" == "--" ]]; then
  shift
  if [[ $# -lt 1 ]]; then
    echo "run.sh: -- needs a command" >&2
    exit 2
  fi
  exec docker run "${common[@]}" \
    -e PYTHONDONTWRITEBYTECODE=1 \
    -v "$root/bench:/checker/bench:ro" \
    -v "$root/governance:/checker/governance:ro" \
    --entrypoint "$1" \
    "$image" "${@:2}"
fi

exec docker run "${common[@]}" \
  -v "$root/tools:/checker/tools:ro" \
  -v "$root/toolkit:/checker/toolkit:ro" \
  --entrypoint python3 \
  "$image" -m tools.check.run --repo /repo --out /out/result.json "$@"
