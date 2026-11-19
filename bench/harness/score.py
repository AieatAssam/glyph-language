"""Score execute results. Protected scoring step.

  python -m bench.harness.score score RESULTS_DIR [--baseline SCORE.json] [--out FILE]
  python -m bench.harness.score compare --base X --head Y [--tolerance 2.0]

X and Y are score JSON files or results directories. compare exits 1 when head fitness is more
than the tolerance below base (the paired gate; run both on the same subset and sampling).

Definitions (first attempt = attempt 1):
  pass1      share of samples passing all tests on attempt 1
  pass3      share passing within attempts 1-3
  repair     of attempt-1 compile failures, share whose attempt 2 passes (1.0 when there are none)
  read       share of read predictions exactly equal to real stdout (read runs only on passing programs)
  edit1      share of edit programs passing the variant tests on the first try
  token_efficiency  sum of baseline output tokens / sum of this run's, over keys solved in both, capped at 1.
                    Without --baseline it is 1.0 (use this for the Python baseline run itself) and 0 when nothing is solved.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from . import common as C


def mean(xs: list) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def load_results(d: Path) -> tuple[dict, list[dict], dict]:
    writes: dict[tuple[str, int], dict[int, dict]] = {}
    reads, edits = [], {}
    for f in sorted(Path(d).glob("*/*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        if r["kind"] == "write":
            writes.setdefault((r["key"], r["sample"]), {})[r["attempt"]] = r
        elif r["kind"] == "read":
            reads.append(r)
        elif r["kind"] == "edit":
            edits[(r["key"], r["sample"])] = r
    return writes, reads, edits


def compute(results_dir: Path, baseline: dict | None = None) -> dict:
    weights = C.load_rules()["bench"]["weights"]
    writes, reads, edits = load_results(results_dir)
    groups = {g: a for g, a in writes.items() if 1 in a}
    first = [a[1] for a in groups.values()]
    pass1 = mean([float(r["pass"]) for r in first])
    pass3 = mean([float(any(a[i]["pass"] for i in (1, 2, 3) if i in a)) for a in groups.values()])
    compile1 = mean([float(r["compiled"]) for r in first])
    repaired = [float(a[2]["pass"]) for a in groups.values() if not a[1]["compiled"] and 2 in a]
    repair = mean(repaired) if repaired else 1.0
    read = mean([float(r["pass"]) for r in reads])
    edit1 = mean([float(r["pass"]) for r in edits.values()])

    tokens = {}
    for g, a in groups.items():
        passing = [a[i]["tokens"] for i in sorted(a) if a[i]["pass"]][:1]
        if passing:
            tokens[g[0]] = passing[0] if g[0] not in tokens else tokens[g[0]]
    tokens_per_task = {k: v for k, v in sorted(tokens.items())}
    if baseline is None:
        token_eff = 1.0 if tokens else 0.0
    else:
        base = baseline.get("tokens_per_task", {})
        common = [k for k in tokens if k in base]
        den = sum(tokens[k] for k in common)
        token_eff = min(1.0, sum(base[k] for k in common) / den) if common and den else 0.0

    parts = {"pass1": pass1, "pass3": pass3, "repair": repair, "read": read,
             "edit1": edit1, "token_efficiency": token_eff}
    fitness = 100 * sum(weights[k] * v for k, v in parts.items())
    diag = Counter(d["code"] for a in writes.values() for r in a.values() for d in r["diagnostics"])
    return {"fitness": round(fitness, 4), "metrics": {k: round(v, 4) for k, v in parts.items()},
            "compile1": round(compile1, 4), "samples": len(groups), "reads": len(reads),
            "edits": len(edits), "top_diagnostics": diag.most_common(10),
            "tokens_per_task": tokens_per_task}


def as_score(path_or_dir: str, baseline: dict | None) -> dict:
    p = Path(path_or_dir)
    if p.is_dir():
        return compute(p, baseline)
    return json.loads(p.read_text(encoding="utf-8"))


def compare(base: dict, head: dict, tolerance: float) -> dict:
    delta = head["fitness"] - base["fitness"]
    return {"base": base["fitness"], "head": head["fitness"], "delta": round(delta, 4),
            "tolerance": tolerance, "pass": delta >= -tolerance}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("score")
    s.add_argument("results", type=Path)
    s.add_argument("--baseline", type=Path)
    s.add_argument("--out", type=Path)
    c = sub.add_parser("compare")
    c.add_argument("--base", required=True)
    c.add_argument("--head", required=True)
    c.add_argument("--tolerance", type=float, default=C.load_rules()["bench"]["gate_tolerance"])
    a = ap.parse_args()
    if a.cmd == "score":
        base = json.loads(a.baseline.read_text(encoding="utf-8")) if a.baseline else None
        out = compute(a.results, base)
        text = json.dumps(out, indent=1, sort_keys=True) + "\n"
        if a.out:
            a.out.write_text(text, encoding="utf-8")
        print(text, end="")
        return
    base_score = as_score(a.base, None)
    head_score = as_score(a.head, None)
    result = compare(base_score, head_score, a.tolerance)
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
