"""Print docs/SPEC.md as it stood at a spec version, read from the spec-vX.Y.Z tag.

Usage: python -m tools.spec_at 1.2.0
"""
import os
import subprocess
import sys
from pathlib import Path


def main(argv) -> int:
    if len(argv) != 1:
        print("usage: python -m tools.spec_at X.Y.Z", file=sys.stderr)
        return 2
    root = Path(os.environ.get("GLYPH_ROOT") or os.getcwd())
    res = subprocess.run(["git", "-C", str(root), "show", f"spec-v{argv[0]}:docs/SPEC.md"],
                         capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stderr.strip(), file=sys.stderr)
        return 1
    sys.stdout.write(res.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
