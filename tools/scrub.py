"""Replace secret values in every file under OUTDIR with [REDACTED]. Byte level, so JSON and binary are covered.

    python -m tools.scrub OUTDIR

Secrets come from environment variables whose names look like credentials. Empty or unset values
are skipped, and values shorter than 8 bytes are skipped too, so a stray "1" never blanks a file.
"""
import os
import re
import sys
from pathlib import Path

NAME = re.compile(r"TOKEN|SECRET|PASSWORD|API_KEY|_KEY$|CREDENTIAL", re.I)
REPLACEMENT = b"[REDACTED]"


def secrets(env=os.environ) -> list[bytes]:
    out = set()
    for name, value in env.items():
        if NAME.search(name) and value and len(value.encode("utf-8")) >= 8:
            out.add(value.encode("utf-8"))
    # longest first so a secret that contains another is removed whole
    return sorted(out, key=len, reverse=True)


def scrub_file(path: Path, values: list[bytes]) -> int:
    data = path.read_bytes()
    new = data
    for v in values:
        new = new.replace(v, REPLACEMENT)
    if new != data:
        path.write_bytes(new)
        return 1
    return 0


def scrub(outdir: Path, env=os.environ) -> int:
    values = secrets(env)
    if not values:
        return 0
    changed = 0
    for p in sorted(outdir.rglob("*")):
        if p.is_file() and not p.is_symlink():
            changed += scrub_file(p, values)
    return changed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m tools.scrub OUTDIR")
    print(f"scrubbed {scrub(Path(sys.argv[1]))} file(s)")
