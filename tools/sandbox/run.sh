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
#     Runs CMD from /checker. REPO_DIR is mounted read-only at /repo. bench/, governance/ and tools/
#     are mounted read-only at /checker. The caller must not pass secrets: docker receives no
#     environment from this script and no key file is mounted.
#
# Trust split (both modes): the trusted entry point runs as root with only SETUID and SETGID
# capabilities. Every command the candidate controls (glyphc, node, wasm runs, generated programs,
# built executables) is started through tools/check/untrusted.py, which drops it to uid 65534
# (GLYPH_SANDBOX_DROP=1 turns that on). The trusted side writes results to /out, a root-owned 0700
# volume the untrusted uid cannot open. The trusted side then copies /out to OUT_DIR. Scratch space
# for the untrusted side is /work, a tmpfs owned by uid 65534.
#
# Both modes: --network none, read-only root filesystem, pid/memory/cpu limits, no new privileges.
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

name="glyph-sandbox-$$-$RANDOM"
common=(
  --name "$name"
  --network none
  --read-only
  --cap-drop ALL
  --cap-add SETUID
  --cap-add SETGID
  --security-opt no-new-privileges
  --memory 4g
  --cpus 2
  --pids-limit 512
  --tmpfs /tmp:rw,size=1g,mode=1777
  --tmpfs /work:rw,size=2g,uid=65534,gid=65534,mode=1777
  --tmpfs /home/runner:rw,size=256m,uid=65534,gid=65534,mode=0700
  -e GLYPH_SANDBOX_DROP=1
  -e TMPDIR=/work
  -e PYTHONDONTWRITEBYTECODE=1
  -v "$repo:/repo:ro"
  -v /out
  -w /checker
)

# Runs the container, then copies /out back to the host even when the run failed. The volume is
# removed with the container. Exit status is the container's.
run_container() {
  set +e
  docker run "${common[@]}" "$@"
  local rc=$?
  docker cp "$name:/out/." "$out/"
  local cp_rc=$?
  docker rm -v "$name" >/dev/null 2>&1
  if [[ $cp_rc -ne 0 ]]; then
    echo "run.sh: could not copy /out out of the sandbox" >&2
    exit 1
  fi
  exit "$rc"
}

if [[ "${1:-}" == "--" ]]; then
  shift
  if [[ $# -lt 1 ]]; then
    echo "run.sh: -- needs a command" >&2
    exit 2
  fi
  run_container \
    -v "$root/bench:/checker/bench:ro" \
    -v "$root/governance:/checker/governance:ro" \
    -v "$root/tools:/checker/tools:ro" \
    --entrypoint "$1" \
    "$image" "${@:2}"
fi

run_container \
  -v "$root/tools:/checker/tools:ro" \
  -v "$root/toolkit:/checker/toolkit:ro" \
  --entrypoint python3 \
  "$image" -m tools.check.run --repo /repo --out /out/result.json "$@"
