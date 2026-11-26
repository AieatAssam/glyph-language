"""Deterministic offline token counter for the spec caps (SPEC section 6 rule 9).

Text is split into alphabetic runs, digit runs and single other non-space characters.
An alphabetic run of n characters costs ceil(n/4), a digit run ceil(n/3), and any other
piece costs 1. The sum is multiplied by RULES caps.tokeniser_scale and rounded up.

CLI: python -m tools.check.tokens --repo DIR [--scale S]
     python -m tools.check.tokens FILE...   (count each file; `-` reads stdin)
"""
from __future__ import annotations

import argparse
import math
import re
from fractions import Fraction
from pathlib import Path

_PIECE = re.compile(r"[A-Za-z]+|[0-9]+|\S")


def count(text, scale=1.0):
    raw = 0
    for m in _PIECE.finditer(text):
        s = m.group(0)
        c = s[0]
        if "A" <= c <= "Z" or "a" <= c <= "z":
            raw += -(-len(s) // 4)
        elif "0" <= c <= "9":
            raw += -(-len(s) // 3)
        else:
            raw += 1
    return math.ceil(Fraction(str(scale)) * raw)


def core_text(repo):
    root = Path(repo) / "spec" / "core"
    files = sorted(root.rglob("*.md"), key=lambda p: p.relative_to(root).as_posix())
    if not files:
        raise FileNotFoundError("no spec/core/**/*.md files under %s" % repo)
    return "\n".join(f.read_text(encoding="utf-8") for f in files)


def card_text(repo):
    return (Path(repo) / "spec" / "card.md").read_text(encoding="utf-8")


def spec_counts(repo, scale=1.0):
    return {"core": count(core_text(repo), scale), "card": count(card_text(repo), scale)}


def _main(argv):
    ap = argparse.ArgumentParser(prog="tools.check.tokens")
    ap.add_argument("--repo")
    ap.add_argument("--scale", default="1.0")
    ap.add_argument("files", nargs="*")
    a = ap.parse_args(argv)
    if a.files:
        import sys
        for f in a.files:
            text = sys.stdin.read() if f == "-" else Path(f).read_text(encoding="utf-8")
            print(count(text, a.scale), f)
        return 0
    if not a.repo:
        ap.error("give --repo DIR or FILE...")
    print(spec_counts(a.repo, a.scale))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(_main(sys.argv[1:]))
