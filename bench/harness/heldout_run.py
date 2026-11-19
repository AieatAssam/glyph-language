"""Held-out bench run. Runs as its own `heldout` job in bench.yml (environment `bench`), separate from
the generate-K jobs. Only metric totals leave it.

Held-out inputs and expected outputs are decrypted into a job-local workspace and never written to
the output directory. Generate runs on the host (it holds AI auth and HELDOUT_KEY). Execute runs in
the sandbox via `tools/sandbox/run.sh CHECKOUT OUT --data WS -- python3 -m bench.harness.execute ...`,
where CHECKOUT is the base checkout and WS is the workspace: no network, no environment from the job,
no key file mounted. Score runs on the host over the sandbox results.

python -m bench.harness.heldout_run --out DIR [--lang python] [--model M] [--samples N]
                                    [--baseline SCORE.json]

Requires HELDOUT_KEY (the AGE-SECRET-KEY line). DIR must be empty or absent and ends with exactly
one file, totals.json, holding {"fitness": ..., "metrics": {...}}.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from . import common as C
from . import heldout, score

SANDBOX = C.ROOT / "tools" / "sandbox" / "run.sh"
HOST_ENV_KEYS = ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG", "GLYPH_SANDBOX_IMAGE")


def sandbox_execute(ws: Path, results: Path) -> None:
    """Execute every program in ws inside the sandbox container; results land in `results`."""
    env = {k: v for k, v in os.environ.items() if k in HOST_ENV_KEYS}
    cmd = ["bash", str(SANDBOX), str(C.ROOT), str(results), "--data", str(ws), "--",
           "python3", "-m", "bench.harness.execute", "--in", "/data", "--out", "/out", "--lang", "python"]
    subprocess.run(cmd, check=True, env=env, cwd=C.ROOT)


def run(out: Path, *, lang: str = "python", model: str | None = None, samples: int | None = None,
        baseline: dict | None = None, archive: Path = heldout.ARCHIVE, sandbox=sandbox_execute) -> dict:
    if out.exists() and any(out.iterdir()):
        raise SystemExit(f"{out} must be empty or absent")
    rules = C.load_rules()["bench"]
    attempts = rules["attempts"]
    work = Path(tempfile.mkdtemp(prefix="heldout-job-"))
    try:
        tasks = heldout.extract(work / "tasks", archive)
        ws = work / "ws"
        ws.mkdir()
        results = ws / "results"
        gen_args = ["--tasks", str(tasks), "--out", str(ws), "--lang", lang, "--opaque"]
        if model:
            gen_args += ["--model", model]
        if samples:
            gen_args += ["--samples", str(samples)]
        for k in range(1, attempts + 2):
            subprocess.run([sys.executable, "-m", "bench.harness.generate", "round", str(k), *gen_args],
                           check=True, cwd=C.ROOT, env=os.environ)
            sandbox(ws, results)
        totals = score.compute(results, baseline)
        summary = {"fitness": totals["fitness"], "metrics": totals["metrics"]}
    finally:
        shutil.rmtree(work, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "totals.json").write_text(json.dumps(summary, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lang", choices=["python"], default="python")
    ap.add_argument("--model")
    ap.add_argument("--samples", type=int)
    ap.add_argument("--baseline", type=Path)
    a = ap.parse_args()
    baseline = json.loads(a.baseline.read_text(encoding="utf-8")) if a.baseline else None
    run(a.out, lang=a.lang, model=a.model, samples=a.samples, baseline=baseline)
    print(a.out / "totals.json")


if __name__ == "__main__":
    main()
