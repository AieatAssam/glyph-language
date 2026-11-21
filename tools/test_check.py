"""Tests for the protected check package. Run: python3 -m unittest tools.test_check"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.check import conformance, gates, peg, run, tokens

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tools" / "fixtures" / "check" / "repo"
GATE_RULES = ("4", "5", "7", "8", "9", "10", "11", "12")


class PegTests(unittest.TestCase):
    GRAMMAR = 'Expr <- Term ("+" Term)*\nTerm <- [0-9]+\n'

    def test_accepts_whole_input(self):
        ok, hits, err = peg.parse(self.GRAMMAR, "1+22+3")
        self.assertTrue(ok)
        self.assertIsNone(err)
        self.assertEqual(hits, {"Expr", "Term"})

    def test_rejects_trailing_input_with_position(self):
        ok, _, err = peg.parse(self.GRAMMAR, "1+")
        self.assertFalse(ok)
        self.assertEqual(err, 2)

    def test_predicates_consume_nothing_and_add_no_hits(self):
        g = 'S <- &A "x" !B\nA <- "x"\nB <- "y"\n'
        ok, hits, _ = peg.parse(g, "x")
        self.assertTrue(ok)
        self.assertEqual(hits, {"S"})

    def test_rule_names_in_order(self):
        self.assertEqual(peg.rule_names(self.GRAMMAR), ["Expr", "Term"])

    def test_left_recursion_is_an_error(self):
        with self.assertRaises(peg.PegError):
            peg.parse('E <- E "a"\n', "a")

    def test_undefined_rule_is_a_grammar_error(self):
        with self.assertRaises(peg.PegError):
            peg.compile_grammar('S <- Missing\n')


class TokenTests(unittest.TestCase):
    def test_counting_rules(self):
        self.assertEqual(tokens.count("hello"), 2)      # ceil(5/4)
        self.assertEqual(tokens.count("12345"), 2)      # ceil(5/3)
        self.assertEqual(tokens.count("a.b"), 3)        # alpha 1, punct 1, alpha 1
        self.assertEqual(tokens.count("   "), 0)

    def test_scale_applies_before_rounding_up(self):
        self.assertEqual(tokens.count("a.b", scale=2), 6)
        self.assertEqual(tokens.count("a.b", scale=1.5), 5)


class ConformanceParseTests(unittest.TestCase):
    def test_parses_run_test(self):
        t = conformance.parse_test("--- meta\nid: a/b\nkind: run\n--- source\nok\n"
                                   "--- expect-stdout\n--- expect-exit\n0\n")
        self.assertEqual(t["kind"], "run")
        self.assertEqual(t["sections"]["source"], "ok")
        self.assertEqual(t["sections"]["expect-stdout"], "")

    def test_rejects_missing_expectation(self):
        with self.assertRaises(ValueError):
            conformance.parse_test("--- meta\nid: a\nkind: run\n--- source\nok\n")

    def test_rejects_unknown_kind_and_section(self):
        with self.assertRaises(ValueError):
            conformance.parse_test("--- meta\nid: a\nkind: nope\n--- source\nok\n")
        with self.assertRaises(ValueError):
            conformance.parse_test("--- meta\nid: a\nkind: fix\n--- source\nok\n--- bogus\n")

    def test_apply_fix_replaces_utf8_byte_offsets(self):
        # "é" is two bytes, so the span [0, 3) covers "é" plus "a" and the rest is unchanged.
        out = conformance.apply_fix("éa-b\n".encode("utf-8"),
                                    {"span": {"start": 0, "end": 3}, "replacement": "x"})
        self.assertEqual(out, b"x-b\n")


@unittest.skipUnless(shutil.which("node"), "node is required for the wasm host")
class FixtureRunTests(unittest.TestCase):
    def test_fixture_repo_passes_every_gate_rule(self):
        result = run.run_checks(FIXTURE)
        for num in GATE_RULES:
            self.assertTrue(result["rules"][num]["ok"], (num, result["rules"][num]))
        self.assertEqual(result["conformance"]["passed"], 4)
        self.assertEqual(result["conformance"]["total"], 4)

    def test_failing_expectation_fails_rule_5(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d) / "repo"
            shutil.copytree(FIXTURE, repo)
            test = repo / "conformance" / "arith" / "ok.test"
            test.write_text(test.read_text().replace("--- expect-exit\n0", "--- expect-exit\n3"))
            result = run.run_checks(repo)
            self.assertFalse(result["rules"]["5"]["ok"])
            self.assertEqual(result["conformance"]["failed"], 1)

    def test_untested_grammar_production_fails_rule_10(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d) / "repo"
            shutil.copytree(FIXTURE, repo)
            grammar = repo / "spec" / "grammar.peg"
            grammar.write_text(grammar.read_text() + "Extra <- 'x'\n")
            result = run.run_checks(repo)
            self.assertFalse(result["rules"]["10"]["ok"])
            self.assertIn("Extra", result["rules"]["10"]["detail"])

    def test_oversized_core_spec_fails_rule_9(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d) / "repo"
            shutil.copytree(FIXTURE, repo)
            rules = repo / "governance" / "RULES.md"
            rules.write_text(rules.read_text().replace("core_spec_tokens: 12000",
                                                       "core_spec_tokens: 5"))
            result = run.run_checks(repo)
            self.assertFalse(result["rules"]["9"]["ok"])


class RunnerRobustnessTests(unittest.TestCase):
    def test_missing_repo_reports_failures_without_crashing(self):
        result = run.run_checks(Path(tempfile.mkdtemp()) / "absent")
        for num in GATE_RULES:
            self.assertIn(num, result["rules"])
            self.assertFalse(result["rules"][num]["ok"] and num in ("4", "5", "9", "10"))
        self.assertEqual(result["conformance"]["total"], 0)

    def test_cli_writes_canonical_json(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "result.json"
            rc = run.main(["--repo", str(FIXTURE), "--out", str(out), "--pr", "7",
                           "--sha", "abc", "--base-sha", "def"])
            self.assertEqual(rc, 0)
            raw = out.read_bytes()
            obj = json.loads(raw)
            self.assertEqual((obj["pr"], obj["sha"], obj["base_sha"]), (7, "abc", "def"))
            self.assertEqual(raw, run.canon(obj))


class GlyphcDispatchTests(unittest.TestCase):
    def _copy_dispatcher(self, d):
        (Path(d) / "bin").mkdir()
        dst = Path(d) / "bin" / "glyphc"
        shutil.copy(ROOT / "bin" / "glyphc", dst)
        dst.chmod(0o755)
        return dst

    def test_exits_3_without_compiler(self):
        with tempfile.TemporaryDirectory() as d:
            exe = self._copy_dispatcher(d)
            p = subprocess.run([str(exe), "--version"], capture_output=True, text=True)
            self.assertEqual(p.returncode, 3)

    def test_exits_3_for_unknown_active_compiler(self):
        with tempfile.TemporaryDirectory() as d:
            exe = self._copy_dispatcher(d)
            (Path(d) / "compiler").mkdir()
            (Path(d) / "compiler" / "ACTIVE").write_text("mystery\n")
            p = subprocess.run([str(exe), "--version"], capture_output=True, text=True)
            self.assertEqual(p.returncode, 3)

    def test_dispatcher_is_executable_and_parses(self):
        self.assertTrue(os.access(ROOT / "bin" / "glyphc", os.X_OK))
        subprocess.run(["bash", "-n", str(ROOT / "bin" / "glyphc")], check=True)


CAPS = {"fuel": 10000000000, "memory_mb": 256, "stdout_bytes": 1048576}


class FakeToolchain:
    """Stands in for stage 0 and the self-hosted Wasm compiler. Output bytes are deterministic.
    mode "fixed": a self-hosted build yields FIXED whatever its input, so B == C.
    mode "chain": a self-hosted build appends "+" to its input, so B != C.
    diff_at: byte offset flipped in the self-hosted `ast` dump."""

    def __init__(self, tree, caps, tmp, mode="fixed", diff_at=None):
        self.tree, self.mode, self.diff_at = Path(tree), mode, diff_at

    def _write(self, args, data):
        out = self.tree / args[args.index("-o") + 1]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)

    def _dump(self, args, self_hosted):
        stage = args[1]
        data = bytearray(("%s|" % stage).encode() + b"0123456789")
        if self_hosted and stage == "ast" and self.diff_at is not None:
            data[self.diff_at] = ord("x")
        return bytes(data)

    def stage0(self, args):
        if args[0] == "build":
            self._write(args, b"STAGE0")
            return 0, b"", ""
        return 0, self._dump(args, False), ""

    def wasm(self, module, args):
        if args[0] == "build":
            data = b"FIXED" if self.mode == "fixed" else Path(module).read_bytes() + b"+"
            self._write(args, data)
            return 0, b"", ""
        return 0, self._dump(args, True), ""


class GateTests(unittest.TestCase):
    def _repo(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        repo = Path(d) / "repo"
        shutil.copytree(FIXTURE, repo)
        (repo / "compiler" / "self").mkdir(parents=True)
        (repo / "compiler" / "self" / "main.gl").write_text("main\n", encoding="utf-8")
        (repo / "compiler" / "self" / "ENTRY").write_text("main.gl\n", encoding="utf-8")
        return repo

    def _check(self, repo, flags, make=FakeToolchain, platform=sys.platform):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, True)
        return gates.check_gates(repo, flags, CAPS, tmp, [], platform=platform, make_toolchain=make)

    def test_differential_reports_first_offset(self):
        ok, detail, _ = self._check(self._repo(), {"differential": True},
                                    lambda t, c, tmp: FakeToolchain(t, c, tmp, diff_at=7))
        self.assertFalse(ok)
        self.assertIn("gate/conformance/arith/ok.gl", detail)
        self.assertIn("stage=ast offset=7", detail)

    def test_differential_identical_dumps_pass(self):
        ok, detail, stats = self._check(self._repo(), {"differential": True})
        self.assertTrue(ok, detail)
        self.assertEqual(stats["differential_comparisons"], 15)  # 5 sources x 3 stages

    def test_fixed_point_b_equals_c_passes_and_warns_when_a_differs(self):
        ok, detail, stats = self._check(self._repo(), {"fixed_point": True})
        self.assertTrue(ok, detail)
        self.assertIn("warning: A != B", detail)
        fp = stats["fixed_point"]
        self.assertEqual(fp["B"], fp["C"])
        self.assertNotEqual(fp["A"], fp["B"])

    def test_fixed_point_b_not_equal_c_fails(self):
        ok, detail, _ = self._check(self._repo(), {"fixed_point": True},
                                    lambda t, c, tmp: FakeToolchain(t, c, tmp, mode="chain"))
        self.assertFalse(ok)
        self.assertIn("no fixed point", detail)

    def test_fixed_point_keeps_a_b_c_wasm_for_the_cutover_gate(self):
        artifacts = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, artifacts, True)
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, True)
        ok, detail, stats = gates.check_gates(self._repo(), {"fixed_point": True}, CAPS, tmp, [],
                                              make_toolchain=FakeToolchain, artifacts=artifacts)
        self.assertTrue(ok, detail)
        for name in ("A", "B", "C"):
            self.assertTrue((artifacts / (name + ".wasm")).is_file(), name)
        # Cutover input contract: B.wasm is present and its sha256 is the B hash fixedpoint records.
        b_sha = hashlib.sha256((artifacts / "B.wasm").read_bytes()).hexdigest()
        self.assertEqual(b_sha, stats["fixed_point"]["B"])

    def test_native_is_skipped_on_darwin(self):
        ok, detail, _ = self._check(FIXTURE, {"native": True}, platform="darwin")
        self.assertTrue(ok)
        self.assertIn("skipped on darwin", detail)


@unittest.skipUnless(shutil.which("node"), "node is required for the wasm host")
class ExpectTests(unittest.TestCase):
    def _repo_with_expect(self, body):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        repo = Path(d) / "repo"
        shutil.copytree(FIXTURE, repo)
        (repo / "examples" / "hello.expect").write_text(body, encoding="utf-8")
        return repo

    def test_rule_11_passes_matching_expect(self):
        repo = self._repo_with_expect("--- stdin\n--- expect-stdout\n--- expect-exit\n0\n")
        rule = run.run_checks(repo)["rules"]["11"]
        self.assertTrue(rule["ok"], rule)
        self.assertIn("1 .expect files pass", rule["detail"])

    def test_rule_11_fails_mismatched_expect(self):
        repo = self._repo_with_expect("--- stdin\n--- expect-stdout\n--- expect-exit\n3\n")
        rule = run.run_checks(repo)["rules"]["11"]
        self.assertFalse(rule["ok"])
        self.assertIn("examples/hello.gl: exit 0, expected 3", rule["detail"])


class UntrustedTests(unittest.TestCase):
    def test_run_adds_drop_prefix_only_when_enabled(self):
        from unittest import mock
        from tools.check import untrusted
        with mock.patch.dict(os.environ, {untrusted.ENV: "1"}), \
                mock.patch.object(untrusted.subprocess, "run") as run_mock:
            run_mock.return_value = subprocess.CompletedProcess([], 0)
            untrusted.run(["/bin/echo", "hi"], timeout=7)
        args, kw = run_mock.call_args
        self.assertEqual(args[0][:3], ["setpriv", "--reuid=65534", "--regid=65534"])
        i = args[0].index("timeout")
        self.assertEqual(args[0][i:i + 4], ["timeout", "-s", "KILL", "7"])
        self.assertEqual(args[0][-2:], ["/bin/echo", "hi"])
        self.assertEqual(kw["timeout"], 7 + untrusted.BACKSTOP)

        with mock.patch.dict(os.environ, {untrusted.ENV: ""}), \
                mock.patch.object(untrusted.subprocess, "run") as run_mock:
            run_mock.return_value = subprocess.CompletedProcess([], 0)
            untrusted.run(["/bin/echo", "hi"], timeout=7)
        self.assertEqual(run_mock.call_args[0][0], ["/bin/echo", "hi"])


ATTACKER = """#!/usr/bin/env python3
# Hostile fake compiler: tries to forge the result and reach the checker's output.
import os, socket, sys

def probe(name, fn):
    try:
        fn()
        outcome = "ALLOWED"
    except OSError as e:
        outcome = "denied errno=%d" % e.errno
    print("ATTACK uid=%d %s %s" % (os.getuid(), name, outcome), file=sys.stderr)

def write(path):
    with open(path, "w") as f:
        f.write('{"forged": true}')

probe("result.json", lambda: write("/out/result.json"))
probe("proc1-stdout", lambda: write("/proc/1/fd/1"))
probe("ppid-stdout", lambda: write("/proc/%d/fd/1" % os.getppid()))
probe("socket", lambda: socket.create_connection(("1.1.1.1", 53), timeout=3).close())
print("FORGED")
sys.exit(1)
"""


@unittest.skipUnless(shutil.which("docker") and subprocess.run(
    ["docker", "info"], capture_output=True).returncode == 0, "docker is not available")
class SandboxAdversarialTests(unittest.TestCase):
    def test_hostile_compiler_cannot_forge_the_result(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d) / "repo"
            shutil.copytree(FIXTURE, repo)
            glyphc = repo / "bin" / "glyphc"
            glyphc.write_text(ATTACKER, encoding="utf-8")
            glyphc.chmod(0o755)
            out = Path(d) / "out"
            p = subprocess.run(["bash", str(ROOT / "tools" / "sandbox" / "run.sh"), str(repo), str(out)],
                               capture_output=True, text=True, timeout=900)
            self.assertNotIn("FORGED", p.stdout)
            result = json.loads((out / "result.json").read_text(encoding="utf-8"))
            self.assertNotIn("forged", json.dumps(result))
            self.assertFalse(result["rules"]["4"]["ok"])


if __name__ == "__main__":
    unittest.main()
