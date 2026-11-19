"""Conformance .test runner (SPEC section 7).

Container format: a header line `--- NAME` starts each section. `meta` holds `key: value` lines
(id, kind). Section bodies are the lines between headers joined with newlines; the source is
written to main.gl with one trailing newline.

Kinds and pass conditions:
  run            compiles, runs under the execution caps, stdout and exit match expect-stdout, expect-exit
  trap           compiles, runs, exit code matches expect-exit and expect-stderr is a substring of stderr
  compile-error  `glyphc check --json` exits 1 and the error (code, line) multiset equals expect-errors
                 (one `CODE LINE` per line)
  fmt            `glyphc fmt` output equals expect-stdout and formatting the output again changes nothing
  fix            applying the first error's fix edits yields a program that `glyphc check` accepts

Assumed glyphc behaviour (SPEC section 8 CLI table): `check FILE --json` prints one diagnostic
object per line; `build FILE -o OUT`; `fmt FILE` prints formatted text. Columns are 1-based and
fix edit ranges are end-exclusive.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from . import untrusted

TEST_KINDS = ("run", "compile-error", "trap", "fmt", "fix")
KNOWN_SECTIONS = {"meta", "source", "stdin", "expect-stdout", "expect-stderr",
                  "expect-exit", "expect-errors"}
REQUIRED = {
    "run": ("expect-stdout", "expect-exit"),
    "trap": ("expect-exit", "expect-stderr"),
    "compile-error": ("expect-errors",),
    "fmt": ("expect-stdout",),
    "fix": (),
}
TIMEOUT = 300


def parse_sections(text):
    """Split a container into {section name: body}. Raises ValueError on malformed input."""
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    sections = {}
    cur, buf = None, []
    for ln in lines:
        m = re.fullmatch(r"--- ([a-z-]+)", ln)
        if m:
            if cur is not None:
                sections[cur] = "\n".join(buf)
            name = m.group(1)
            if name not in KNOWN_SECTIONS:
                raise ValueError("unknown section --- %s" % name)
            if name in sections or name == cur:
                raise ValueError("duplicate section --- %s" % name)
            cur, buf = name, []
            continue
        if cur is None:
            if ln.strip():
                raise ValueError("text before first section header")
            continue
        buf.append(ln)
    if cur is not None:
        sections[cur] = "\n".join(buf)
    return sections


def parse_test(text):
    """Parse a .test container. Raises ValueError on malformed input."""
    sections = parse_sections(text)
    meta = {}
    for ln in sections.get("meta", "").split("\n"):
        if not ln.strip():
            continue
        k, sep, v = ln.partition(":")
        if not sep:
            raise ValueError("bad meta line: %r" % ln)
        meta[k.strip()] = v.strip()
    for key in ("id", "kind"):
        if key not in meta:
            raise ValueError("meta lacks %s" % key)
    kind = meta["kind"]
    if kind not in TEST_KINDS:
        raise ValueError("unknown kind %s" % kind)
    if "source" not in sections:
        raise ValueError("missing --- source")
    for need in REQUIRED[kind]:
        if need not in sections:
            raise ValueError("%s test lacks --- %s" % (kind, need))
    return {"meta": meta, "kind": kind, "sections": sections}


def discover(repo):
    root = Path(repo) / "conformance"
    if not root.is_dir():
        return []
    return sorted(root.rglob("*.test"), key=lambda p: p.relative_to(root).as_posix())


def _glyphc(repo, args, cwd, stdin=None):
    exe = Path(repo) / "bin" / "glyphc"
    try:
        p = untrusted.run([str(exe), *args], cwd=str(cwd), input=stdin,
                           capture_output=True, text=True, timeout=TIMEOUT)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", "timeout after %ss" % TIMEOUT
    except OSError as e:
        return 127, "", str(e)


def _strip_nl(s):
    return s[:-1] if s.endswith("\n") else s


def _offsets(text):
    starts = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            starts.append(i + 1)
    return starts


def apply_edits(text, edits):
    starts = _offsets(text)

    def off(pos):
        line, col = pos
        return starts[line - 1] + (col - 1)

    spans = sorted(((off(e["start"]), off(e["end"]), e["replacement"]) for e in edits),
                   key=lambda t: t[0], reverse=True)
    for s, e, rep in spans:
        text = text[:s] + rep + text[e:]
    return text


def _diagnostics(out):
    return [json.loads(ln) for ln in out.splitlines() if ln.strip()]


def _host(repo_host, mode, req, tmp):
    reqpath = Path(tmp) / ("req-%s.json" % mode)
    reqpath.write_text(json.dumps(req), encoding="utf-8")
    p = untrusted.run(["node", str(repo_host), mode, str(reqpath)], capture_output=True,
                       text=True, timeout=TIMEOUT)
    if p.returncode != 0:
        raise RuntimeError("wasm host failed: %s" % p.stderr[-400:])
    return json.loads(p.stdout)


def _run_wasm(host, wasm, stdin, caps, tmp):
    req = {"wasm": str(wasm), "stdin": stdin, "fuel": caps["fuel"],
           "memoryMb": caps["memory_mb"], "stdoutLimit": caps["stdout_bytes"]}
    return _host(host, "run", req, tmp)


def run_one(repo, path, work, caps, host):
    """Run one .test. Returns a record dict; never raises for a failing test."""
    rec = {"file": str(path), "id": path.stem, "kind": None, "ok": False, "detail": "",
           "source": None, "wasm": None, "wasm2": None,
           "src": None, "stdin": "", "wasm_stdout": None, "wasm_exit": None,
           "wasm_trap": None}
    try:
        test = parse_test(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as e:
        rec["detail"] = "malformed: %s" % e
        return rec
    kind, sec = test["kind"], test["sections"]
    rec["id"], rec["kind"] = test["meta"]["id"], kind
    body = sec["source"]
    rec["source"] = body + "\n"
    work.mkdir(parents=True, exist_ok=True)
    src = work / "main.gl"
    src.write_text(rec["source"], encoding="utf-8")
    wasm, wasm2 = work / "out.wasm", work / "out2.wasm"

    try:
        if kind in ("run", "trap"):
            rc, _, err = _glyphc(repo, ["build", str(src), "-o", str(wasm)], work)
            if rc != 0:
                rec["detail"] = "compile failed (rc %d): %s" % (rc, err[-300:])
                return rec
            rec["wasm"] = str(wasm)
            rc2, _, _ = _glyphc(repo, ["build", str(src), "-o", str(wasm2)], work)
            rec["wasm2"] = str(wasm2) if rc2 == 0 else None
            res = _run_wasm(host, wasm, sec.get("stdin", ""), caps, work)
            rec.update(src=str(src), stdin=sec.get("stdin", ""), wasm_stdout=res["stdout"],
                       wasm_exit=res["exitCode"], wasm_trap=res.get("trap"))
            if kind == "run":
                if res.get("trap"):
                    rec["detail"] = "trap: %s" % res["trap"]
                    return rec
                if _strip_nl(res["stdout"]) != sec["expect-stdout"]:
                    rec["detail"] = "stdout mismatch"
                    return rec
                if res["exitCode"] != int(sec["expect-exit"]):
                    rec["detail"] = "exit %s, expected %s" % (res["exitCode"], sec["expect-exit"])
                    return rec
            else:
                if res["exitCode"] != int(sec["expect-exit"]):
                    rec["detail"] = "exit %s, expected %s" % (res["exitCode"], sec["expect-exit"])
                    return rec
                if sec["expect-stderr"] not in (res.get("stderr") or ""):
                    rec["detail"] = "stderr lacks expected text"
                    return rec

        elif kind == "compile-error":
            rc, out, err = _glyphc(repo, ["check", str(src), "--json"], work)
            if rc != 1:
                rec["detail"] = "expected compile failure, rc %d" % rc
                return rec
            actual = sorted((d["code"], d["span"]["start"][0])
                            for d in _diagnostics(out) if d.get("severity") == "error")
            expected = []
            for ln in sec["expect-errors"].split("\n"):
                if ln.strip():
                    code, line = ln.split()
                    expected.append((code, int(line)))
            if actual != sorted(expected):
                rec["detail"] = "errors %s, expected %s" % (actual, sorted(expected))
                return rec

        elif kind == "fmt":
            rc, out, err = _glyphc(repo, ["fmt", str(src)], work)
            if rc != 0:
                rec["detail"] = "fmt failed (rc %d): %s" % (rc, err[-300:])
                return rec
            if _strip_nl(out) != sec["expect-stdout"]:
                rec["detail"] = "fmt output mismatch"
                return rec
            again = work / "again.gl"
            again.write_text(out, encoding="utf-8")
            rc2, out2, _ = _glyphc(repo, ["fmt", str(again)], work)
            if rc2 != 0 or out2 != out:
                rec["detail"] = "formatting twice changed the output"
                return rec

        elif kind == "fix":
            rc, out, _ = _glyphc(repo, ["check", str(src), "--json"], work)
            fixable = [d for d in _diagnostics(out)
                       if d.get("severity") == "error" and d.get("fix", {}).get("edits")]
            if not fixable:
                rec["detail"] = "no error with fix edits"
                return rec
            fixed = apply_edits(rec["source"], fixable[0]["fix"]["edits"])
            fixed_path = work / "fixed.gl"
            fixed_path.write_text(fixed, encoding="utf-8")
            rc2, _, _ = _glyphc(repo, ["check", str(fixed_path)], work)
            if rc2 != 0:
                rec["detail"] = "fixed program still fails to check"
                return rec

        rec["ok"] = True
        rec["detail"] = "ok"
        return rec
    except Exception as e:  # a crash in one test is a failure of that test, not of the run
        rec["detail"] = "error: %s: %s" % (type(e).__name__, e)
        return rec


def run_suite(repo, tmp, caps, host):
    """Run every conformance test. Returns (summary, records)."""
    records = []
    for i, path in enumerate(discover(repo)):
        records.append(run_one(repo, path, Path(tmp) / ("t%03d" % i), caps, host))
    passed = sum(1 for r in records if r["ok"])
    failures = [{"id": r["id"], "file": r["file"], "detail": r["detail"]}
                for r in records if not r["ok"]]
    summary = {"passed": passed, "failed": len(records) - passed,
               "total": len(records), "failures": failures}
    return summary, records
