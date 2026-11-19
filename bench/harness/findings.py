"""Writes findings.md for one nightly run. Uses dev detail and held-out totals only.

python -m bench.harness.findings RESULTS_DIR --totals TOTALS.json --out findings.md

The held-out side contributes its fitness and metrics totals and nothing else.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import score


def render(dev: dict, heldout: dict | None) -> str:
    lines = ["# Benchmark findings", "", f"Dev fitness: {dev['fitness']}", ""]
    lines.append("| metric | dev |" + (" held-out |" if heldout else ""))
    lines.append("|---|---|" + ("---|" if heldout else ""))
    for k, v in sorted(dev["metrics"].items()):
        row = f"| {k} | {v} |"
        if heldout:
            row += f" {heldout['metrics'].get(k, '')} |"
        lines.append(row)
    if heldout:
        lines += ["", f"Held-out fitness: {heldout['fitness']} (totals only)"]
    lines += ["", "## Most common diagnostics", ""]
    diags = dev.get("top_diagnostics") or []
    lines += [f"- {code}: {n}" for code, n in diags] or ["- none"]
    return "\n".join(lines) + "\n"


def write(results_dir: Path, totals: dict | None, out: Path) -> str:
    text = render(score.compute(results_dir), totals)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    return text


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("results", type=Path)
    ap.add_argument("--totals", type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    totals = json.loads(a.totals.read_text(encoding="utf-8")) if a.totals else None
    write(a.results, totals, a.out)
    print(a.out)


if __name__ == "__main__":
    main()
