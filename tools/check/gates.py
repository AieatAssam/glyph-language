"""Gate flags from governance/RULES.md, reported under rule 12 (SPEC section 9).

differential  stage 0 and the self-hosted Wasm module A dump byte-identical tokens, ast and ir for
              every conformance source, example and stdlib file. First difference: file, stage, offset.
fixed_point   A = stage 0 builds compiler/self, B = A builds it, C = B builds it. B must equal C;
              A != B is a warning. After cutover (compiler/ACTIVE = self): N1 = the bootstrap builds
              it, N2 = N1 builds it, and N1 must equal N2.
native        on Linux, each run/trap test built with --target x86_64-linux must match the Wasm
              stdout and exit code. Skipped with a detail on other hosts.

Every check takes its toolchain as an argument, so the tests substitute fakes for the compilers.
"""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from . import conformance, untrusted

HOST = Path(__file__).resolve().parent / "wasm_host.ts"
DUMP_STAGES = ("tokens", "ast", "ir")
STDOUT_LIMIT = 64 << 20
NATIVE_TIMEOUT = 30
IGNORED = shutil.ignore_patterns(".git", "node_modules", "__pycache__")


class GateError(Exception):
    """A gate could not run. Its check fails with this message."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class Toolchain:
    """Runs stage 0 (node) and a Wasm compiler module, both with `tree` as cwd and preopened dir.
    Each call returns (rc, stdout bytes, stderr or trap text)."""

    def __init__(self, tree, caps, tmp):
        self.tree = Path(tree)
        self.caps = caps
        self.tmp = Path(tmp)
        self.tmp.mkdir(parents=True, exist_ok=True)

    def stage0(self, args):
        p = untrusted.run(["node", str(self.tree / "compiler/stage0/src/main.ts"), *args],
                           cwd=str(self.tree), capture_output=True, timeout=conformance.TIMEOUT)
        return p.returncode, p.stdout, p.stderr.decode("utf-8", "replace")

    def wasm(self, module, args):
        req = {"wasm": str(module), "args": list(args), "dir": str(self.tree), "stdin": "",
               "fuel": self.caps["fuel"], "memoryMb": self.caps["memory_mb"],
               "stdoutLimit": STDOUT_LIMIT}
        res = conformance._host(HOST, "run", req, self.tmp)
        rc = res["exitCode"] or (1 if res.get("trap") else 0)
        return rc, res["stdout"].encode("utf-8"), res.get("trap") or ""


def copy_tree(repo, dst):
    shutil.copytree(repo, dst, symlinks=True, ignore=IGNORED)
    (Path(dst) / "out").mkdir(exist_ok=True)
    return Path(dst)


def self_entry(tree):
    """compiler/self/ENTRY holds the entry file's path relative to compiler/self/."""
    entry_file = Path(tree) / "compiler/self/ENTRY"
    if not entry_file.is_file():
        raise GateError("compiler/self/ENTRY missing: it names the entry file of compiler/self")
    entry = "compiler/self/" + entry_file.read_text(encoding="utf-8").strip()
    if not (Path(tree) / entry).is_file():
        raise GateError("entry %s named by compiler/self/ENTRY does not exist" % entry)
    return entry


def build(tc, compiler, entry, out):
    """Compile entry to out (relative to the tree). compiler None means stage 0. Returns the bytes."""
    args = ["build", entry, "-o", out]
    if compiler is None:
        rc, _, err = tc.stage0(args)
    else:
        rc, _, err = tc.wasm(compiler, args)
    if rc != 0:
        raise GateError("build to %s failed (rc %d): %s" % (out, rc, err[-300:]))
    return (tc.tree / out).read_bytes()


def stage_sources(tree):
    """Relative names of every source the differential compares. Conformance sources are written
    into the tree as gate/conformance/*.gl so both compilers see the same name in the dump."""
    tree = Path(tree)
    names = []
    for path in conformance.discover(tree):
        try:
            test = conformance.read_test(path)
        except ValueError:
            continue  # the conformance rule reports malformed tests
        rel = "gate/conformance/%s.gl" % path.relative_to(tree / "conformance").with_suffix("").as_posix()
        dst = tree / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(conformance.source_bytes(test))
        names.append(rel)
    for sub in ("examples", "stdlib"):
        names += [f.relative_to(tree).as_posix() for f in sorted((tree / sub).rglob("*.gl"))]
    return names


def _first_diff(a, b):
    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            return i
    return min(len(a), len(b))


def differential(tc, names, a_wasm, stats):
    """Compare stage 0 with the self-hosted module on every dump. Returns (ok, detail)."""
    if not names:
        return False, "differential: no sources to compare"
    comparisons = 0
    for rel in names:
        for stage in DUMP_STAGES:
            args = ["--dump", stage, rel]
            rc0, out0, _ = tc.stage0(args)
            rc1, out1, _ = tc.wasm(a_wasm, args)
            comparisons += 1
            if rc0 != rc1 or out0 != out1:
                return False, ("first difference: %s stage=%s offset=%d (stage0 rc %d, self rc %d)"
                               % (rel, stage, _first_diff(out0, out1), rc0, rc1))
    stats["differential_comparisons"] = comparisons
    return True, "%d dumps identical (%d sources, %d stages)" % (comparisons, len(names), len(DUMP_STAGES))


def keep_stage_wasm(tree, dst):
    """Copy the fixed point's A, B and C modules into dst, the check's out dir. The nightly cutover
    gate reads B.wasm from there and checks its sha256 against the recorded B hash."""
    dst = Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("A", "B", "C"):
        src = Path(tree) / "out" / (name + ".wasm")
        if src.is_file():
            shutil.copyfile(src, dst / (name + ".wasm"))


def fixed_point(tc, entry, stats):
    """Before cutover: A (stage 0), B (A), C (B). Returns (ok, detail)."""
    a = build(tc, None, entry, "out/A.wasm")
    b = build(tc, tc.tree / "out/A.wasm", entry, "out/B.wasm")
    c = build(tc, tc.tree / "out/B.wasm", entry, "out/C.wasm")
    stats["fixed_point"] = {"A": sha256(a), "B": sha256(b), "C": sha256(c)}
    if b != c:
        return False, "no fixed point: B %s != C %s" % (sha256(b)[:12], sha256(c)[:12])
    warn = "" if a == b else "; warning: A != B, stage 0 and the self-hosted compiler disagree"
    return True, "fixed point at B (sha256 %s)%s" % (sha256(b)[:12], warn)


def cutover(tc, entry, stats):
    """After cutover: N1 is built by the bootstrap binary alone, N2 by N1. Returns (ok, detail)."""
    boot = tc.tree / "compiler/bootstrap/glyphc.wasm"
    if not boot.is_file():
        raise GateError("compiler/bootstrap/glyphc.wasm missing after cutover")
    n1 = build(tc, boot, entry, "out/N1.wasm")
    n2 = build(tc, tc.tree / "out/N1.wasm", entry, "out/N2.wasm")
    stats["fixed_point"] = {"N1": sha256(n1), "N2": sha256(n2)}
    if n1 != n2:
        return False, "after cutover N1 %s != N2 %s" % (sha256(n1)[:12], sha256(n2)[:12])
    return True, "after cutover N1 == N2 (sha256 %s), N1 built by the bootstrap" % sha256(n1)[:12]


def native(repo, records, tmp, platform=sys.platform):
    """Build each run/trap test for x86_64-linux and compare its run with the Wasm result."""
    if not platform.startswith("linux"):
        return True, "native skipped on %s: native executables run only on Linux inside the sandbox" % platform
    tmp = Path(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    runs = [r for r in records if r["ok"] and r["kind"] in ("run", "trap")]
    for i, r in enumerate(runs):
        exe = tmp / ("exe%03d" % i)
        rc, _, err = conformance._glyphc(repo, ["build", "--target", "x86_64-linux", r["src"],
                                                "-o", str(exe)], repo)
        if rc != 0:
            return False, "native build of %s failed (rc %d): %s" % (r["id"], rc, err[-200:])
        try:
            p = untrusted.run([str(exe)], input=r["stdin"].encode("utf-8"), capture_output=True,
                               timeout=NATIVE_TIMEOUT)
        except subprocess.TimeoutExpired:
            return False, "native run of %s timed out" % r["id"]
        out = p.stdout.decode("utf-8", "replace")
        if out != r["wasm_stdout"] or p.returncode != r["wasm_exit"]:
            return False, ("%s: native (exit %d, %r) differs from wasm (exit %s, %r)"
                           % (r["id"], p.returncode, out[:80], r["wasm_exit"], r["wasm_stdout"][:80]))
    return True, "%d native runs match wasm" % len(runs)


def check_gates(repo, flags, caps, tmp, records, platform=sys.platform, make_toolchain=Toolchain,
                artifacts=None):
    """Run each gate flag that is on. Returns (ok, detail, stats). A failing gate never raises."""
    tmp = Path(tmp)
    stats, results = {}, []
    if flags.get("differential") or flags.get("fixed_point"):
        try:
            tree = copy_tree(repo, tmp / "tree")
            tc = make_toolchain(tree, caps, tmp / "host")
            entry = self_entry(tree)
            active = (tree / "compiler/ACTIVE").read_text(encoding="utf-8").strip()
            if flags.get("differential"):
                build(tc, None, entry, "out/A.wasm")
                results.append(differential(tc, stage_sources(tree), tree / "out/A.wasm", stats))
            if flags.get("fixed_point"):
                try:
                    results.append(cutover(tc, entry, stats) if active == "self"
                                   else fixed_point(tc, entry, stats))
                finally:
                    if artifacts is not None and active != "self":
                        keep_stage_wasm(tc.tree, artifacts)
        except GateError as e:
            results.append((False, str(e)))
    if flags.get("native"):
        results.append(native(repo, records, tmp / "native", platform))
    if not results:
        return True, "no gate flags on", stats
    ok = all(good for good, _ in results)
    return ok, "; ".join(text for _, text in results), stats
