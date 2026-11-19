#!/bin/sh
# Encrypt the held-out task set to bench/heldout.tar.age.
# Run by the protected owner only. Writes a new age key to HELDOUT_KEY_OUT (mode 0600) and never prints it.
#
#   HELDOUT_KEY_OUT=/path/outside/repo/HELDOUT_KEY.txt sh tools/setup.sh /path/to/heldout
#
# Optional: HELDOUT_ARCHIVE overrides the output path (default bench/heldout.tar.age).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${1:?usage: sh tools/setup.sh HELDOUT_DIR}
KEY_OUT=${HELDOUT_KEY_OUT:?set HELDOUT_KEY_OUT to a key file path outside the repo}
ARCHIVE=${HELDOUT_ARCHIVE:-$ROOT/bench/heldout.tar.age}

[ -d "$SRC" ] || { echo "no such directory: $SRC" >&2; exit 1; }
[ -e "$KEY_OUT" ] && { echo "refusing to overwrite existing key file" >&2; exit 1; }
command -v age >/dev/null && command -v age-keygen >/dev/null || { echo "age and age-keygen are required" >&2; exit 1; }

umask 077
age-keygen -o "$KEY_OUT" >/dev/null 2>&1
chmod 600 "$KEY_OUT"
PUB=$(age-keygen -y "$KEY_OUT")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar -C "$SRC" -cf "$TMP/heldout.tar" .
age -r "$PUB" -o "$ARCHIVE" "$TMP/heldout.tar"
echo "wrote $ARCHIVE (key file written, contents not shown)"
