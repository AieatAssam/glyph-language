"""Merge gate verdict for one PR: paired base and head scores on the gate subset.

python -m bench.harness.gate verdict --pr N --base SCORE --head SCORE --out BENCHDIR/N.json
                                     --attempt A --max-attempts M [--tolerance T]

Writes BENCHDIR/N.json = {pr, base, head, fitness, baseline, delta, tolerance, pass, attempt}.
Exit 0 when the verdict is final (pass, or a fail on the last attempt). Exit 2 when the caller
should rerun the paired measurement once more (fail with attempts left). The file is written
on every attempt, so a rerun overwrites it.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import common as C
from . import score

RERUN = 2


def verdict(pr: int, base: dict, head: dict, tolerance: float, attempt: int, max_attempts: int) -> tuple[dict, int]:
    cmp = score.compare(base, head, tolerance)
    passed = bool(cmp["pass"])
    out = {"pr": pr, "fitness": head["fitness"], "baseline": base["fitness"], "delta": cmp["delta"],
           "tolerance": tolerance, "pass": passed, "attempt": attempt}
    rc = 0 if passed or attempt >= max_attempts else RERUN
    return out, rc


def main() -> None:
    rules = C.load_rules()["bench"]
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verdict")
    v.add_argument("--pr", required=True, type=int)
    v.add_argument("--base", required=True, type=Path)
    v.add_argument("--head", required=True, type=Path)
    v.add_argument("--out", required=True, type=Path)
    v.add_argument("--attempt", type=int, default=1)
    v.add_argument("--max-attempts", type=int, default=1 + rules["gate_reruns"])
    v.add_argument("--tolerance", type=float, default=rules["gate_tolerance"])
    a = ap.parse_args()
    base = json.loads(a.base.read_text(encoding="utf-8"))
    head = json.loads(a.head.read_text(encoding="utf-8"))
    out, rc = verdict(a.pr, base, head, a.tolerance, a.attempt, a.max_attempts)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, sort_keys=True))
    if rc:
        raise SystemExit(rc)
    raise SystemExit(rc)


if __name__ == "__main__":
    main()
