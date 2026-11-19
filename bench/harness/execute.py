"""Bench execute job. No secrets. Compiles and runs generated programs, writes pass/fail per opaque or task id.

Usage: python -m bench.harness.execute --in GEN_OUT --out GEN_OUT/results --lang glyph|python

Reads GEN_OUT/bundle.json (test inputs and expected digests), GEN_OUT/programs, GEN_OUT/predictions
and GEN_OUT/variants. Writes one JSON result per file. Actual stdout is kept only for visible tests.
Glyph uses `bin/glyphc check SRC --json` then `bin/glyphc build SRC -o OUT` (exit 3 = no compiler) and `node toolkit/run.ts WASM`
with stdin piped; both are assumptions until the compiler CLI is pinned.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

from tools.check import untrusted

from . import common as C


class NoCompiler(SystemExit):
    pass


class PyRunner:
    def compile(self, src: Path, work: Path) -> tuple[bool, list[dict], Path]:
        check = ("import ast,sys\nast.parse(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1])\n")
        r = C.run_program([sys.executable, "-I", "-c", check, str(src)], "", cwd=work)
        if r["exit"] == 0:
            return True, [], src
        m = re.search(r"line (\d+)", r["stderr"])
        msg = r["stderr"].strip().splitlines()[-1:] or ["syntax error"]
        return False, [{"code": "PY_SYNTAX", "line": int(m.group(1)) if m else None, "message": msg[0]}], src

    def run(self, artifact: Path, stdin: str, work: Path) -> dict:
        return C.run_program([sys.executable, "-I", str(artifact)], stdin, cwd=work)


class GlyphRunner:
    def __init__(self, root: Path):
        self.root = root

    def compile(self, src: Path, work: Path) -> tuple[bool, list[dict], Path | None]:
        wasm = work / "out.wasm"
        glyphc = self.root / "bin" / "glyphc"
        if not glyphc.exists():
            raise NoCompiler(3)
        # CLI contract (spec §8): `check FILE --json` prints one diagnostic object per line.
        r = C.run_program([str(glyphc), "check", str(src), "--json"], "", cwd=work, timeout=120)
        if r["exit"] == 3:
            raise NoCompiler(3)
        diags = []
        for line in r.get("stdout", "").splitlines():
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(d, dict) and d.get("severity", "error") == "error":
                start = (d.get("span") or {}).get("start") or [None]
                diags.append({"code": str(d.get("code")), "line": start[0], "message": str(d.get("message", ""))[:300],
                              "fix": d.get("fix")})
        if r["exit"] == 0:
            r = C.run_program([str(glyphc), "build", str(src), "-o", str(wasm)], "", cwd=work, timeout=120)
        if r["exit"] != 0 or not wasm.exists():
            return False, diags or [{"code": "UNKNOWN", "line": None, "message": "compile failed"}], None
        return True, [], wasm

    def run(self, artifact: Path, stdin: str, work: Path) -> dict:
        return C.run_program(["node", str(self.root / "toolkit" / "run.ts"), str(artifact)], stdin, cwd=work)


def evaluate(runner, artifact, tests: list[dict], work: Path) -> tuple[bool, list[dict]]:
    rows, ok_all = [], True
    for i, t in enumerate(tests):
        r = runner.run(artifact, t["input"], work)
        ok = (not r["timed_out"]) and r["exit"] == t.get("exit", 0) and C.digest(r["stdout"]) == t["expected_sha256"]
        ok_all = ok_all and ok
        row = {"index": i, "visible": t["visible"], "pass": ok, "exit": r["exit"]}
        if t["visible"]:
            row["actual"] = r["stdout"][:4000]
        rows.append(row)
    return ok_all, rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lang", required=True, choices=["glyph", "python"])
    a = ap.parse_args()
    bundle = json.loads((a.inp / "bundle.json").read_text(encoding="utf-8"))
    runner = PyRunner() if a.lang == "python" else GlyphRunner(C.ROOT)
    ext = C.LANG_EXT[a.lang]
    untrusted.harden()
    work_root = untrusted.mkdtemp(prefix="bench-exec-")
    counts = Counter()
    try:
        for prog in sorted((a.inp / "programs").glob(f"*/*{ext}")):
            key, stem = prog.parent.name, prog.stem
            res = score_program(runner, prog, bundle[key]["tests"], work_root, a.lang)
            write(a.out / key / f"{stem}.json", {"kind": "write", "key": key, "sample": int(stem.split("-")[0][1:]),
                                                 "attempt": int(stem.split("-w")[1]), **res})
            counts["write"] += 1
        for pred in sorted((a.inp / "predictions").glob("*/*.json")):
            key = pred.parent.name
            p = json.loads(pred.read_text(encoding="utf-8"))
            prog = a.inp / "programs" / key / f"{p['program']}{ext}"
            res = read_result(runner, prog, p["prediction"], bundle[key]["probes"][int(pred.stem.split("-r")[1])],
                              work_root)
            write(a.out / key / f"{pred.stem}.json", {"kind": "read", "key": key, "sample": int(pred.stem.split("-")[0][1:]),
                                                      "probe": int(pred.stem.split("-r")[1]), **res})
            counts["read"] += 1
        for var in sorted((a.inp / "variants").glob(f"*/*-e{ext}")):
            key = var.parent.name
            res = score_program(runner, var, bundle[key]["variant"]["tests"], work_root, a.lang)
            write(a.out / key / f"{var.stem.replace('-e', '')}-e.json",
                  {"kind": "edit", "key": key, "sample": int(var.stem.split("-")[0][1:]), **res})
            counts["edit"] += 1
    except NoCompiler:
        print("execute: no compiler (bin/glyphc exit 3); nothing scored", file=sys.stderr)
        raise SystemExit(3)
    finally:
        shutil.rmtree(work_root, ignore_errors=True)
    print(json.dumps({"executed": dict(counts)}, sort_keys=True))


def score_program(runner, prog: Path, tests: list[dict], work_root: Path, lang: str) -> dict:
    work = untrusted.mkdtemp(dir=work_root)
    source = prog.read_text(encoding="utf-8")
    compiled, diags, artifact = runner.compile(prog, work)
    res = {"compiled": compiled, "diagnostics": diags, "pass": False, "tests": [],
           "tokens": C.count_tokens(source)}
    if compiled:
        res["pass"], res["tests"] = evaluate(runner, artifact if lang == "glyph" else prog, tests, work)
    return res


def read_result(runner, prog: Path, prediction: str, probe: dict | str, work_root: Path) -> dict:
    work = untrusted.mkdtemp(dir=work_root)
    compiled, diags, artifact = runner.compile(prog, work)
    if not compiled:
        return {"pass": False, "match": False, "predicted": prediction[:4000], "actual": None}
    target = artifact if isinstance(runner, GlyphRunner) else prog
    r = runner.run(target, probe if isinstance(probe, str) else probe["input"], work)
    match = (not r["timed_out"]) and C.digest(r["stdout"]) == C.digest(prediction)
    return {"pass": match, "match": match, "predicted": prediction[:4000], "actual": r["stdout"][:4000]}


def write(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
