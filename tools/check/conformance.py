"""Conformance .test runner (SPEC section 7).

Container format: a header line `--- NAME` starts each section. `meta` holds `key: value` lines
(id, kind). Section bodies are the lines between headers joined with newlines; the source is
written to main.gl with one trailing newline.

Kinds and pass conditions:
  run            compiles, runs under the execution caps, stdout and exit match expect-stdout, expect-exit
  trap           compiles, runs, exit code matches expect-exit and expect-stderr is a substring of stderr
  compile-error  `glyphc check FILE` exits 1 and its error records match expect-errors. Each
                 non-empty expect-errors line is either `CODE LINE` (compares code and span.line) or
                 a JSON object (compares `code`, and `span` and `fix` where the object gives them,
                 matching the keys it gives). The multisets must be equal.
  fmt            `glyphc fmt` output equals expect-stdout and formatting the output again changes nothing
  fix            applying the first error's fix to the UTF-8 source yields a program that `glyphc check` accepts

Assumed glyphc behaviour (RFC 0004, SPEC section 8 CLI table): `check FILE` writes diagnostics as
JSON Lines to standard error, one record per line, with `span` byte offsets (end exclusive) and
1-based line and column, and an optional single `fix` `{span, replacement}`. Non-JSON lines are
ignored. `build FILE -o OUT`; `fmt FILE` prints formatted text.
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


def read_test(path):
    """Parse a .test file read as bytes: text mode would turn CR LF into LF and lose the CR."""
    return parse_test(Path(path).read_bytes().decode("utf-8"))


_ESC = re.compile(rb"\\(x[0-9A-Fa-f]{2}|\\)")


def source_bytes(test) -> bytes:
    """The bytes written to main.gl: the source section plus one LF.

    With `source-escapes: hex` in the meta block, `\\xHH` in the source stands for the byte HH and
    `\\\\` for one backslash, so a test can hold a CR (`\\x0D`), a tab, a BOM or invalid UTF-8
    that an agent cannot type into a file. Without the key the source is taken as written.
    """
    raw = (test["sections"]["source"] + "\n").encode("utf-8")
    if test["meta"].get("source-escapes") == "hex":
        raw = _ESC.sub(lambda m: b"\\" if m.group(1) == b"\\" else bytes([int(m.group(1)[1:], 16)]), raw)
    return raw


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


def apply_fix(data, fix):
    """Apply one RFC 0004 fix to UTF-8 bytes: replace [span.start, span.end) with the replacement."""
    s, e = fix["span"]["start"], fix["span"]["end"]
    return data[:s] + fix["replacement"].encode("utf-8") + data[e:]


def _diagnostics(err):
    recs = []
    for ln in err.splitlines():
        if not ln.lstrip().startswith("{"):
            continue
        try:
            recs.append(json.loads(ln))
        except ValueError:
            continue
    return recs


def _subset(want, got):
    """True if every key the expected value gives matches the actual value (dicts recurse)."""
    if isinstance(want, dict):
        return isinstance(got, dict) and all(k in got and _subset(v, got[k])
                                             for k, v in want.items())
    return want == got


def _matches(exp, act):
    if isinstance(exp, tuple):  # ("line", (code, line))
        return act.get("code") == exp[1][0] and act.get("span", {}).get("line") == exp[1][1]
    if exp.get("code") != act.get("code"):
        return False
    if "span" in exp and not _subset(exp["span"], act.get("span") or {}):
        return False
    return "fix" not in exp or _subset(exp["fix"], act.get("fix") or {})


def _perfect(exps, acts):
    """True if the expected entries and actual records pair one to one."""
    if not exps:
        return not acts
    for i, a in enumerate(acts):
        if _matches(exps[0], a) and _perfect(exps[1:], acts[:i] + acts[i + 1:]):
            return True
    return False


def _expected(text):
    out = []
    for ln in text.split("\n"):
        if not ln.strip():
            continue
        if ln.lstrip().startswith("{"):
            out.append(json.loads(ln))
        else:
            code, line = ln.split()
            out.append(("line", (code, int(line))))
    return out


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
        test = read_test(path)
    except (ValueError, OSError) as e:
        rec["detail"] = "malformed: %s" % e
        return rec
    kind, sec = test["kind"], test["sections"]
    rec["id"], rec["kind"] = test["meta"]["id"], kind
    raw = source_bytes(test)
    rec["source"] = raw.decode("utf-8", errors="replace")
    work.mkdir(parents=True, exist_ok=True)
    src = work / "main.gl"
    src.write_bytes(raw)
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
            rc, _, err = _glyphc(repo, ["check", str(src)], work)
            if rc != 1:
                rec["detail"] = "expected compile failure, rc %d" % rc
                return rec
            actual = [d for d in _diagnostics(err) if d.get("severity", "error") == "error"]
            expected = _expected(sec["expect-errors"])
            if len(actual) != len(expected) or not _perfect(expected, actual):
                rec["detail"] = "errors %s, expected %s" % (actual, sec["expect-errors"])
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
            _, _, err = _glyphc(repo, ["check", str(src)], work)
            fixable = [d for d in _diagnostics(err)
                       if d.get("severity", "error") == "error" and d.get("fix")]
            if not fixable:
                rec["detail"] = "no error with a fix"
                return rec
            fixed = apply_fix(raw, fixable[0]["fix"])
            fixed_path = work / "fixed.gl"
            fixed_path.write_bytes(fixed)
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
