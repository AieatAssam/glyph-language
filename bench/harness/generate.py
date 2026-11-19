"""Bench generate job. Holds AI auth and (with --opaque) the held-out key. Never compiles or runs programs.

Usage: python -m bench.harness.generate round K --tasks DIR --out DIR --lang glyph|python
       [--card FILE] [--model M] [--samples N] [--subset FILE] [--opaque]

Round K in 1..attempts writes one Write attempt for every unsolved sample, reading execute's
results from round K-1. Round attempts+1 issues Read predictions and Edit programs for every
solved sample. Run `python -m bench.harness.execute` between rounds.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from . import common as C

PY_SYSTEM_BASE = ("You write complete programs. Language: Python 3.\n"
                  "Reply with exactly one fenced code block containing the whole program and nothing else.")


def extract_code(text: str) -> str:
    m = re.search(r"```[A-Za-z0-9_+-]*\n(.*?)```", text, re.S)
    return (m.group(1) if m else text.strip("\n")).rstrip("\n") + "\n"


def write_prompt(task: dict, feedback: str) -> str:
    body = "Task:\n" + task["prompt"].strip() + "\n\nReply with the complete program in one code block."
    return body + ("\n\n" + feedback if feedback else "")


def read_prompt(program: str, probe: str) -> str:
    return ("Here is a program:\n\n```\n" + program + "```\n\n"
            "Standard input for this run:\n\n```\n" + probe.rstrip("\n") + "\n```\n\n"
            "Predict exactly what the program writes to standard output for this input. "
            "Reply with only that output in one code block.")


def edit_prompt(task: dict, program: str) -> str:
    return ("Task:\n" + task["prompt"].strip() + "\n\nHere is a program that solves it:\n\n```\n"
            + program + "```\n\nChange the requirement to this:\n" + task["variant"]["prompt"].strip()
            + "\n\nReply with the complete modified program in one code block.")


def feedback_for(results_dir: Path, task: dict, key: str, s: int, attempt: int) -> str:
    res = json.loads((results_dir / key / f"s{s}-w{attempt}.json").read_text(encoding="utf-8"))
    if not res["compiled"]:
        return ("Your previous program did not compile. Compiler diagnostics as JSON:\n"
                + json.dumps(res["diagnostics"], indent=1, sort_keys=True))
    visible_fail = [t for t in res["tests"] if t["visible"] and not t["pass"]]
    if visible_fail:
        t = visible_fail[0]
        test = task["tests"][t["index"]]
        return ("Your previous program failed a visible test.\nInput:\n" + test["input"]
                + "Expected output:\n" + test["expected"] + "Actual output:\n" + t.get("actual", "")
                + f"Exit status: {t['exit']}")
    return "Some hidden tests failed. Fix the program and reply with the complete program."


class FakeModel:
    """Offline stand-in used by tests (BENCH_FAKE_MODEL=python-ref). Python only."""

    def __init__(self, tasks_dir: Path):
        self.tasks_dir = tasks_dir

    def reply(self, kind: str, task_id: str, program_path: Path | None = None, probe: str = "") -> str:
        ref = (self.tasks_dir / "ref" / f"{task_id}.py").read_text(encoding="utf-8")
        if kind == "write":
            return "```python\n" + ref + "```"
        if kind == "edit":
            flag = 'VARIANT = os.environ.get("BENCH_VARIANT") == "1"'
            if flag not in ref:
                raise SystemExit(f"ref {task_id} lacks the VARIANT line")
            return "```python\n" + ref.replace(flag, "VARIANT = True") + "```"
        if kind == "read":
            out = C.run_program([sys.executable, "-I", str(program_path)], probe)
            return "```\n" + out["stdout"] + "```"
        raise SystemExit("unknown kind")


def real_call(system: str, user: str, model: str) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        body = json.dumps({"model": model, "max_tokens": 8192, "system": system,
                           "messages": [{"role": "user", "content": user}]}).encode("utf-8")
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(req, timeout=300) as r:
            obj = json.load(r)
        return "".join(b.get("text", "") for b in obj.get("content", []) if b.get("type") == "text")
    p = subprocess.run(["claude", "-p", "--model", model, "--system-prompt", system,
                        "--no-session-persistence", "--tools", ""],
                       input=user, capture_output=True, text=True, timeout=900)
    if p.returncode != 0:
        raise SystemExit("claude -p failed: " + p.stderr[-500:])
    return p.stdout


def passed_attempt(results_dir: Path, key: str, s: int, upto: int) -> int | None:
    for a in range(1, upto + 1):
        f = results_dir / key / f"s{s}-w{a}.json"
        if f.exists() and json.loads(f.read_text(encoding="utf-8"))["pass"]:
            return a
    return None


def build_bundle(tasks: dict[str, dict], keymap: dict[str, str]) -> dict:
    """Test inputs and expected digests only. No prompts, ids or reference source."""
    bundle = {}
    for tid, t in tasks.items():
        tests = [{"input": x["input"], "expected_sha256": C.digest(x["expected"]),
                  "exit": x.get("exit", 0), "visible": bool(x["visible"])} for x in t["tests"]]
        var = None
        if t.get("variant"):
            var = {"tests": [{"input": x["input"], "expected_sha256": C.digest(x["expected"]),
                              "exit": x.get("exit", 0), "visible": False} for x in t["variant"]["tests"]]}
        bundle[keymap[tid]] = {"tests": tests, "variant": var, "probes": list(t["probe_inputs"])}
    return bundle


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["round"])
    ap.add_argument("k", type=int)
    ap.add_argument("--tasks", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lang", choices=["glyph", "python"], default="python")
    ap.add_argument("--card", type=Path)
    ap.add_argument("--model")
    ap.add_argument("--samples", type=int)
    ap.add_argument("--subset", type=Path)
    ap.add_argument("--opaque", action="store_true")
    a = ap.parse_args()

    rules = C.load_rules()["bench"]
    model = a.model or rules["model"]
    samples = a.samples or rules["samples"]
    attempts = rules["attempts"]
    if a.k < 1 or a.k > attempts + 1:
        raise SystemExit(f"round must be 1..{attempts + 1}")

    fake = os.environ.get("BENCH_FAKE_MODEL")
    if fake and (fake != "python-ref" or a.lang != "python"):
        raise SystemExit("BENCH_FAKE_MODEL supports only python-ref with --lang python")

    system = PY_SYSTEM_BASE
    card_sha = None
    if a.lang == "glyph":
        if not a.card or not a.card.exists():
            raise SystemExit("glyph generation needs --card FILE")
        card_text = a.card.read_text(encoding="utf-8")
        card_sha = hashlib.sha256(card_text.encode("utf-8")).hexdigest()
        system = (card_text + "\n\nLanguage: glyph.\n"
                  "Reply with exactly one fenced code block containing the whole program and nothing else.")

    only = C.read_subset(a.subset) if a.subset else None
    tasks = C.load_tasks(a.tasks, only)
    secret = C.heldout_secret() if a.opaque else None
    keymap = {tid: (C.opaque_key(secret, tid) if a.opaque else tid) for tid in tasks}
    by_key = {keymap[tid]: t for tid, t in tasks.items()}
    ext = C.LANG_EXT[a.lang]

    out = a.out
    out.mkdir(parents=True, exist_ok=True)
    results = out / "results"
    manifest_path = out / "manifest.json"
    if a.k == 1:
        manifest = {"lang": a.lang, "model": model, "samples": samples, "attempts": attempts,
                    "opaque": a.opaque, "card_sha256": card_sha, "fake": bool(fake)}
        manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        (out / "bundle.json").write_text(json.dumps(build_bundle(tasks, keymap), sort_keys=True) + "\n",
                                         encoding="utf-8")
    else:
        m = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (m["lang"], m["model"], m["samples"], m["opaque"]) != (a.lang, model, samples, a.opaque):
            raise SystemExit("settings differ from round 1 manifest")

    fm = FakeModel(a.tasks) if fake else None

    def call(kind: str, user: str, **kw) -> str:
        if fm:
            return fm.reply(kind, kw["task_id"], kw.get("program_path"), kw.get("probe", ""))
        return real_call(system, user, model)

    calls = 0
    if a.k <= attempts:
        for key in sorted(by_key):
            task = by_key[key]
            tid = next(t for t, k in keymap.items() if k == key)
            for s in range(1, samples + 1):
                if passed_attempt(results, key, s, a.k - 1) is not None:
                    continue
                fb = ""
                if a.k > 1:
                    if not (results / key / f"s{s}-w{a.k - 1}.json").exists():
                        raise SystemExit("execute has not produced round " + str(a.k - 1) + " results")
                    fb = feedback_for(results, task, key, s, a.k - 1)
                text = call("write", write_prompt(task, fb), task_id=tid)
                dst = out / "programs" / key / f"s{s}-w{a.k}{ext}"
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(extract_code(text), encoding="utf-8")
                calls += 1
    else:
        for key in sorted(by_key):
            task = by_key[key]
            tid = next(t for t, k in keymap.items() if k == key)
            for s in range(1, samples + 1):
                pa = passed_attempt(results, key, s, attempts)
                if pa is None:
                    continue
                prog_name = f"s{s}-w{pa}"
                prog_path = out / "programs" / key / f"{prog_name}{ext}"
                program = prog_path.read_text(encoding="utf-8")
                for i, probe in enumerate(task["probe_inputs"]):
                    dst = out / "predictions" / key / f"s{s}-r{i}.json"
                    if dst.exists():
                        continue
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    text = call("read", read_prompt(program, probe), task_id=tid,
                                program_path=prog_path, probe=probe)
                    dst.write_text(json.dumps({"program": prog_name, "prediction": extract_code(text).rstrip("\n")},
                                              sort_keys=True) + "\n", encoding="utf-8")
                    calls += 1
                if task.get("variant"):
                    dst = out / "variants" / key / f"s{s}-e{ext}"
                    if not dst.exists():
                        dst.parent.mkdir(parents=True, exist_ok=True)
                        text = call("edit", edit_prompt(task, program), task_id=tid, program_path=prog_path)
                        dst.write_text(extract_code(text), encoding="utf-8")
                        calls += 1
    print(json.dumps({"round": a.k, "model_calls": calls, "opaque": a.opaque}, sort_keys=True))


if __name__ == "__main__":
    main()
