"""Decrypt bench/heldout.tar.age using HELDOUT_KEY. The key goes to a 0600 temp file that is removed
afterwards. Nothing about the contents is logged.

python -m bench.harness.heldout --out DIR      extracts into DIR (must be empty or absent)
"""
import argparse
import io
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

from . import common as C

ARCHIVE = C.ROOT / "bench" / "heldout.tar.age"


def extract(out: Path, archive: Path = ARCHIVE) -> Path:
    secret = C.heldout_secret()
    fd, key_path = tempfile.mkstemp(prefix="heldout-key-")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(secret + "\n")
        p = subprocess.run(["age", "-d", "-i", key_path, str(archive)], capture_output=True)
        if p.returncode != 0:
            raise SystemExit("could not decrypt held-out archive (wrong HELDOUT_KEY?)")
    finally:
        os.unlink(key_path)
    out.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(p.stdout)) as tar:
        tar.extractall(out, filter="data")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    extract(a.out)
    print(a.out)


if __name__ == "__main__":
    main()
