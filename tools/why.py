"""Explain a decision: every audit event touching an RFC or PR, in order.

Usage: python -m tools.why rfc 7 | python -m tools.why pr 12
"""
import os
import sys
from pathlib import Path

from tools.lib import audit


def history(root, kind: str, number: int) -> list:
    key = "rfc" if kind == "rfc" else "pr"
    out = []
    for e in audit.load_events(root):
        subj = e.get("subject") or {}
        n = subj.get(key)
        if n is None:
            continue
        if (key == "rfc" and int(str(n)) == number) or (key == "pr" and int(n) == number):
            out.append(e)
    return out


def main(argv) -> int:
    if len(argv) != 2 or argv[0] not in ("rfc", "pr"):
        print("usage: python -m tools.why rfc|pr NUMBER", file=sys.stderr)
        return 2
    root = Path(os.environ.get("GLYPH_ROOT") or os.getcwd())
    for e in history(root, argv[0], int(argv[1])):
        print(f"{e['seq']:>6} {e['ts']} {e['type']:<16} {e['actor']:<14} {e.get('data')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
