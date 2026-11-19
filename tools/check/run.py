"""Merge-gate check runner: SPEC section 6 rules 4, 5, 7, 8, 9, 10, 11 and 12.

Usage: python -m tools.check.run --repo DIR --out result.json [--pr N --sha S --base-sha B]

Writes canonical JSON (CONTRACTS.md encoding). Rules 1, 2, 3, 6, 13 and 14 belong to the merge
bot. The runner never raises for a failing rule: each rule is wrapped and reports its error.
Designed to run inside tools/sandbox with the candidate repo mounted read-only at /repo.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from . import conformance, gates, peg, tokens, untrusted

HERE = Path(__file__).resolve().parent
HOST = HERE / "wasm_host.ts"
ACCEPTING_KINDS = ("run", "trap", "fmt")


def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def load_rules(repo):
    """Read the fenced yaml block in governance/RULES.md that defines caps."""
    import yaml  # lazy: only the check path needs PyYAML
    text = (Path(repo) / "governance" / "RULES.md").read_text(encoding="utf-8")
    for block in re.findall(r"```yaml\n(.*?)\n```", text, re.S):
        data = yaml.safe_load(block)
        if isinstance(data, dict) and "caps" in data:
            return data
    raise ValueError("no yaml rules block with caps in governance/RULES.md")


def rule_4(ctx):
    rc, out, err = conformance._glyphc(ctx["repo"], ["--version"], ctx["repo"])
    out = out.strip()
    if rc != 0 or not out:
        return False, "bin/glyphc --version rc %d: %s" % (rc, (err or out)[-300:])
    return True, "compiler responds: %s" % out.splitlines()[0]


def rule_5(ctx):
    s = ctx["summary"]
    if s is None:
        return False, "conformance not run: %s" % ctx["rules_error"]
    ok = s["total"] > 0 and s["failed"] == 0
    return ok, "%d/%d tests passed%s" % (s["passed"], s["total"],
                                         "" if s["total"] else " (no tests found)")


def rule_7(ctx):
    wasms = [r["wasm"] for r in ctx["records"] if r.get("wasm")]
    if not wasms:
        return True, "no modules produced"
    res = conformance._host(HOST, "validate", {"files": wasms}, ctx["tmp"])
    bad = [(r["file"], r["errors"]) for r in res if not r["ok"]]
    if bad:
        return False, "%d module(s) invalid: %s" % (len(bad), str(bad)[:300])
    return True, "%d module(s) validate" % len(wasms)


def rule_8(ctx):
    pairs = [r for r in ctx["records"] if r.get("wasm") and r.get("wasm2")]
    if not pairs:
        return True, "no modules compared"
    diff = [r["id"] for r in pairs
            if Path(r["wasm"]).read_bytes() != Path(r["wasm2"]).read_bytes()]
    if diff:
        return False, "nondeterministic builds: %s" % ", ".join(diff[:10])
    return True, "%d module(s) build identically twice" % len(pairs)


def rule_9(ctx):
    if ctx["rules"] is None:
        return False, "governance/RULES.md unreadable: %s" % ctx["rules_error"]
    caps = ctx["rules"]["caps"]
    counts = tokens.spec_counts(ctx["repo"], caps.get("tokeniser_scale", 1.0))
    ctx["stats"]["core_tokens"] = counts["core"]
    ctx["stats"]["card_tokens"] = counts["card"]
    problems = []
    if counts["core"] > caps["core_spec_tokens"]:
        problems.append("core %d > %d" % (counts["core"], caps["core_spec_tokens"]))
    if counts["card"] > caps["card_tokens"]:
        problems.append("card %d > %d" % (counts["card"], caps["card_tokens"]))
    if problems:
        return False, "; ".join(problems)
    return True, "core %d/%d, card %d/%d" % (counts["core"], caps["core_spec_tokens"],
                                             counts["card"], caps["card_tokens"])


def rule_10(ctx):
    grammar = (Path(ctx["repo"]) / "spec" / "grammar.peg").read_text(encoding="utf-8")
    names = peg.rule_names(grammar)
    covered, rejected = set(), []
    for r in ctx["records"]:
        if r["kind"] not in ACCEPTING_KINDS or r["source"] is None:
            continue
        accepted, hits, _ = peg.parse(grammar, r["source"])
        if not accepted:
            rejected.append(r["id"])
        covered |= hits
    missing = [n for n in names if n not in covered]
    problems = []
    if rejected:
        problems.append("grammar rejects: %s" % ", ".join(rejected[:10]))
    if missing:
        problems.append("productions without a test: %s" % ", ".join(missing))
    if problems:
        return False, "; ".join(problems)
    return True, "%d productions covered" % len(names)


def _caps(rules):
    ex = rules["execution"]
    return {"fuel": ex["fuel"], "memory_mb": ex["memory_mb"], "stdout_bytes": ex["stdout_bytes"]}


def _check_expect(ctx, expect, wasm):
    """Run a compiled example against its sibling .expect container. Returns a problem or None."""
    try:
        sec = conformance.parse_sections(expect.read_text(encoding="utf-8"))
    except ValueError as e:
        return "malformed .expect: %s" % e
    for need in ("expect-stdout", "expect-exit"):
        if need not in sec:
            return ".expect lacks --- %s" % need
    res = conformance._run_wasm(HOST, wasm, sec.get("stdin", ""), _caps(ctx["rules"]), ctx["tmp"])
    if res.get("trap"):
        return "trap: %s" % res["trap"]
    if conformance._strip_nl(res["stdout"]) != sec["expect-stdout"]:
        return "stdout mismatch"
    if res["exitCode"] != int(sec["expect-exit"]):
        return "exit %s, expected %s" % (res["exitCode"], sec["expect-exit"])
    return None


def rule_11(ctx):
    repo = Path(ctx["repo"])
    files = []
    for d in ("examples", "stdlib", "compiler/self"):
        base = repo / d
        if base.is_dir():
            files += sorted(base.rglob("*.gl"))
    if not files:
        return True, "no example, stdlib or self programs"
    failed, expects = [], 0
    for i, f in enumerate(files):
        rel = f.relative_to(repo).as_posix()
        wasm = ctx["tmp"] / ("ex%03d.wasm" % i)
        rc, _, _ = conformance._glyphc(repo, ["build", str(f), "-o", str(wasm)], repo)
        if rc != 0:
            failed.append("%s (rc %d)" % (rel, rc))
            continue
        expect = f.with_suffix(".expect")
        if expect.is_file():
            expects += 1
            if ctx["rules"] is None:
                failed.append("%s: governance/RULES.md unreadable, cannot run .expect" % rel)
                continue
            problem = _check_expect(ctx, expect, wasm)
            if problem:
                failed.append("%s: %s" % (rel, problem))
    if failed:
        return False, "%d of %d failed: %s" % (len(failed), len(files), "; ".join(failed[:5]))
    return True, "%d programs compile, %d .expect files pass" % (len(files), expects)


def rule_12(ctx):
    if ctx["rules"] is None:
        return False, "governance/RULES.md unreadable: %s" % ctx["rules_error"]
    flags = ctx["rules"].get("gates", {})
    if not any(flags.get(name) for name in ("differential", "fixed_point", "native")):
        return True, "gates off (differential, fixed_point, native all false)"
    ok, detail, stats = gates.check_gates(ctx["repo"], flags, _caps(ctx["rules"]),
                                          ctx["tmp"] / "gates", ctx["records"],
                                          artifacts=ctx["artifacts"])
    ctx["stats"].update(stats)
    return ok, detail


def _rule(ctx, fn):
    try:
        ok, detail = fn(ctx)
    except Exception as e:
        ok, detail = False, "error: %s: %s" % (type(e).__name__, e)
    return {"ok": bool(ok), "detail": detail}


def run_checks(repo, artifacts=None):
    """artifacts: directory that receives the fixed point's A.wasm, B.wasm and C.wasm (the out dir)."""
    repo = Path(repo).resolve()
    started = time.time()
    ctx = {"repo": repo, "rules": None, "rules_error": None, "summary": None,
           "records": [], "stats": {}, "tmp": None,
           "artifacts": Path(artifacts) if artifacts is not None else None}
    try:
        ctx["rules"] = load_rules(repo)
    except Exception as e:
        ctx["rules_error"] = "%s: %s" % (type(e).__name__, e)
    with untrusted.scratch("glyph-check-") as tmpdir:
        ctx["tmp"] = tmpdir
        if ctx["rules"] is not None:
            caps = _caps(ctx["rules"])
            try:
                ctx["summary"], ctx["records"] = conformance.run_suite(
                    repo, ctx["tmp"] / "conf", caps, HOST)
            except Exception as e:
                ctx["rules_error"] = "conformance crashed: %s: %s" % (type(e).__name__, e)
        rules = {}
        for num, fn in ((4, rule_4), (5, rule_5), (7, rule_7), (8, rule_8), (9, rule_9),
                        (10, rule_10), (11, rule_11), (12, rule_12)):
            rules[str(num)] = _rule(ctx, fn)
    summary = ctx["summary"] or {"passed": 0, "failed": 0, "total": 0, "failures": []}
    ctx["stats"]["tests"] = summary["total"]
    ctx["stats"]["seconds"] = round(time.time() - started, 3)
    return {"rules": rules, "conformance": summary, "stats": ctx["stats"]}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="tools.check.run")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pr", type=int)
    ap.add_argument("--sha")
    ap.add_argument("--base-sha")
    a = ap.parse_args(argv)
    untrusted.harden()
    result = run_checks(a.repo, Path(a.out).parent)
    result = {"pr": a.pr, "sha": a.sha, "base_sha": a.base_sha, **result}
    Path(a.out).write_bytes(canon(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
