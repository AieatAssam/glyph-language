"""Plans one bench run for the workflow setup job. No secrets, no network.

python -m bench.harness.plan --mode gate|nightly|baseline [--prs JSON]

Prints GITHUB_OUTPUT lines: rounds (generate/execute rounds in the static chain), gate_count and gate_matrix (a JSON {"include": [{"pr": N, "sha": S}]} for the per-PR
gate jobs, with a pr 0 placeholder when there are none). Gate mode is one round on
gate_subset; nightly and baseline use attempts+1 rounds on the full dev set, capped at MAX_ROUNDS.
"""
from __future__ import annotations

import argparse
import json
import re

from . import common as C

MAX_ROUNDS = 4  # the workflow declares generate-1..4 and execute-1..4
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def rounds_for(mode: str, attempts: int) -> int:
    if mode == "gate":
        return 1
    return min(MAX_ROUNDS, attempts + 1)


def parse_prs(text: str) -> list[dict]:
    """Validate the caller's PR list: [{"pr": int, "sha": 40-hex}] or {"include": [...]}, capped at max_gated_prs_per_cycle."""
    try:
        items = json.loads(text or "[]")
    except json.JSONDecodeError as e:
        raise SystemExit(f"prs is not JSON: {e}")
    if isinstance(items, dict):  # accepts the {"include": [...]} matrix shape cycle.yml passes on
        items = items.get("include", [])
    if not isinstance(items, list):
        raise SystemExit("prs must be a JSON list")
    out = []
    for it in items:
        if isinstance(it, dict) and it.get("pr") == 0:  # the check-plan placeholder, not a PR
            continue
        if not isinstance(it, dict) or not isinstance(it.get("pr"), int) or it["pr"] < 1:
            raise SystemExit(f"bad PR entry: {it!r}")
        if not isinstance(it.get("sha"), str) or not SHA_RE.match(it["sha"]):
            raise SystemExit(f"bad sha for PR {it['pr']}")
        out.append({"pr": it["pr"], "sha": it["sha"]})
    return out[:C.load_rules()["max_gated_prs_per_cycle"]]


def plan(mode: str, prs_text: str) -> dict:
    if mode not in ("gate", "nightly", "baseline"):
        raise SystemExit(f"unknown mode {mode!r}")
    rules = C.load_rules()["bench"]
    prs = parse_prs(prs_text) if mode == "gate" else []
    # An empty matrix is invalid in Actions, so the placeholder row stays; gate_count guards its jobs.
    matrix = prs or [{"pr": 0, "sha": ""}]
    return {"rounds": rounds_for(mode, rules["attempts"]),
            "gate_count": len(prs),
            "gate_matrix": json.dumps({"include": matrix}, sort_keys=True, separators=(",", ":"))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["gate", "nightly", "baseline"])
    ap.add_argument("--prs", default="[]")
    a = ap.parse_args()
    for k, v in plan(a.mode, a.prs).items():
        print(f"{k}={v}")


if __name__ == "__main__":
    main()
