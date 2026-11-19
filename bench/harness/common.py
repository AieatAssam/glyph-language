"""Shared helpers for the fitness bench (stdlib plus pyyaml). Protected path: bench/."""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import subprocess
from pathlib import Path

import yaml

from tools.check import untrusted

ROOT = Path(__file__).resolve().parents[2]
DEV_TASKS = ROOT / "bench" / "tasks" / "dev"
SUBSET_FILE = ROOT / "bench" / "tasks" / "gate_subset.txt"
RULES_FILE = ROOT / "governance" / "RULES.md"

CATEGORIES = ["arithmetic", "text", "collections", "data", "parsing",
              "state", "recursion", "failure", "decomposition", "larger"]
LANG_EXT = {"glyph": ".glyph", "python": ".py"}
STDOUT_LIMIT = 1 << 20
RUN_TIMEOUT = 10
LINT_BANNED = ("```", "{", "}", "def ", "import ", "print(", "lambda ")


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def load_rules() -> dict:
    text = RULES_FILE.read_text(encoding="utf-8")
    m = re.search(r"^```yaml rules\n(.*?)^```", text, re.S | re.M)
    if not m:
        raise SystemExit("governance/RULES.md has no yaml rules block")
    return yaml.safe_load(m.group(1))


def norm(s: str) -> str:
    """Output normaliser used for every comparison: LF newlines, no trailing spaces or blank tail."""
    lines = s.replace("\r\n", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines).rstrip("\n")


def digest(s: str) -> str:
    return hashlib.sha256(norm(s).encode("utf-8")).hexdigest()


def count_tokens(text: str) -> int:
    try:
        from tools.check import tokens as tk  # optional, owned by the tokeniser
        fn = getattr(tk, "count_tokens", None) or getattr(tk, "count", None)
        if fn:
            return int(fn(text))
    except ImportError:
        pass
    return math.ceil(len(text) / 4)


def lint_task(t: dict) -> list[str]:
    problems = []
    prompts = [t.get("prompt", "")] + ([t["variant"]["prompt"]] if t.get("variant") else [])
    for p in prompts:
        for bad in LINT_BANNED:
            if bad in p:
                problems.append(f"prompt contains code-like text {bad!r}")
    return problems


def check_task(t: dict) -> list[str]:
    """Return a list of problems with one task dict (empty when valid)."""
    problems = []
    for f in ("id", "category", "tier", "prompt", "tests", "probe_inputs"):
        if f not in t:
            problems.append(f"missing {f}")
    if problems:
        return problems
    if t["category"] not in CATEGORIES:
        problems.append("unknown category")
    if t["tier"] not in (1, 2, 3):
        problems.append("tier not 1-3")
    if len(t["tests"]) < 6:
        problems.append("fewer than 6 tests")
    for i, test in enumerate(t["tests"]):
        for f in ("input", "expected", "visible"):
            if f not in test:
                problems.append(f"test {i} missing {f}")
        if test.get("visible") != (i < 2):
            problems.append("first two tests must be visible, the rest hidden")
    if len(t["probe_inputs"]) < 2:
        problems.append("fewer than 2 probe inputs")
    if t.get("variant") and len(t["variant"].get("tests", [])) < 2:
        problems.append("variant has fewer than 2 tests")
    return problems + lint_task(t)


def load_tasks(d: Path, only: set[str] | None = None) -> dict[str, dict]:
    tasks = {}
    for p in sorted(Path(d).glob("*.yml")):
        if p.name.startswith("._"):  # macOS AppleDouble metadata, never a task
            continue
        t = yaml.safe_load(p.read_text(encoding="utf-8"))
        bad = check_task(t)
        if bad:
            raise SystemExit(f"{p}: {'; '.join(bad)}")
        if t["id"] != p.stem:
            raise SystemExit(f"{p}: id does not match file name")
        tasks[t["id"]] = t
    if only is not None:
        tasks = {k: v for k, v in tasks.items() if k in only}
    return tasks


def read_subset(path: Path) -> set[str]:
    return {line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()}


def opaque_key(secret: str, task_id: str) -> str:
    return hmac.new(secret.encode("utf-8"), task_id.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def heldout_secret() -> str:
    secret = os.environ.get("HELDOUT_KEY", "").strip()
    if not secret.startswith("AGE-SECRET-KEY-"):
        raise SystemExit("HELDOUT_KEY is not set to an AGE-SECRET-KEY line")
    return secret


def run_program(cmd: list[str], stdin: str, cwd: Path | None = None, timeout: float = RUN_TIMEOUT) -> dict:
    """Run a command with stdin text. Returns exit, stdout (capped), stderr, timed_out."""
    try:
        p = untrusted.run(cmd, input=stdin.encode("utf-8"), cwd=cwd, capture_output=True,
                           timeout=timeout)
        out = p.stdout[:STDOUT_LIMIT].decode("utf-8", "replace")
        return {"exit": p.returncode, "stdout": out,
                "stderr": p.stderr[:4096].decode("utf-8", "replace"), "timed_out": False}
    except subprocess.TimeoutExpired:
        return {"exit": None, "stdout": "", "stderr": "", "timed_out": True}


def ref_run(ref_path: Path, stdin: str, variant: bool = False) -> dict:
    """Run a Python reference solution. BENCH_VARIANT selects the variant behaviour."""
    import sys
    env = dict(os.environ, BENCH_VARIANT="1" if variant else "0")
    p = subprocess.run([sys.executable, "-I", str(ref_path)], input=stdin.encode("utf-8"),
                       capture_output=True, timeout=RUN_TIMEOUT, env=env)
    return {"exit": p.returncode, "stdout": p.stdout.decode("utf-8", "replace")}
