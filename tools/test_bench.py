"""Tests for the fitness bench harness (bench/). Offline: uses the Python fake model only."""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bench.harness import common as C  # noqa: E402
from bench.harness import gate, heldout, heldout_run, score, subset  # noqa: E402

TEST_SECRET = "AGE-SECRET-KEY-1" + "Q" * 58


def task(tid: str, category: str = "arithmetic", tier: int = 1, variant: bool = True) -> dict:
    tests = [{"input": f"{i}\n", "expected": f"{i * 2}\n", "visible": i < 2} for i in range(6)]
    t = {"id": tid, "category": category, "tier": tier,
         "prompt": "Read one integer from standard input and write its double.",
         "tests": tests, "probe_inputs": ["5\n", "7\n"]}
    if variant:
        t["variant"] = {"prompt": "Write the triple instead of the double.",
                        "tests": [{"input": f"{i}\n", "expected": f"{i * 3}\n", "visible": False}
                                  for i in range(2)]}
    return t


REF = ("import os\nVARIANT = os.environ.get(\"BENCH_VARIANT\") == \"1\"\n"
       "n = int(input())\nprint(n * (3 if VARIANT else 2))\n")


def make_tasks(root: Path, ids: list[str]) -> Path:
    d = root / "tasks"
    (d / "ref").mkdir(parents=True)
    import yaml
    for tid in ids:
        (d / f"{tid}.yml").write_text(yaml.safe_dump(task(tid), sort_keys=False), encoding="utf-8")
        (d / "ref" / f"{tid}.py").write_text(REF, encoding="utf-8")
    return d


def run_mod(*args: str, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    e = dict(os.environ, PYTHONPATH=str(ROOT))
    e.pop("HELDOUT_KEY", None)
    e.update(env or {})
    p = subprocess.run([sys.executable, "-m", *args], cwd=ROOT, env=e, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise AssertionError(f"{args} exited {p.returncode}: {p.stderr[-800:]}")
    return p


class NormTests(unittest.TestCase):
    def test_norm_strips_trailing_space_and_blank_tail(self):
        self.assertEqual(C.norm("a  \r\nb\t\n\n"), "a\nb")

    def test_digest_ignores_normalised_differences(self):
        self.assertEqual(C.digest("x \n"), C.digest("x"))
        self.assertNotEqual(C.digest("x"), C.digest("y"))


class OpaqueTests(unittest.TestCase):
    def test_opaque_key_is_stable_and_secret_dependent(self):
        a = C.opaque_key("s1", "arith-1")
        self.assertEqual(a, C.opaque_key("s1", "arith-1"))
        self.assertEqual(len(a), 16)
        self.assertNotEqual(a, C.opaque_key("s2", "arith-1"))
        self.assertNotIn("arith", a)


class CheckTests(unittest.TestCase):
    def test_valid_task_passes(self):
        self.assertEqual(C.check_task(task("t1")), [])

    def test_missing_visibility_and_banned_text_reported(self):
        t = task("t1")
        t["tests"][0]["visible"] = False
        t["prompt"] = "Use print( and braces {}"
        problems = C.check_task(t)
        self.assertTrue(any("first two" in p for p in problems))
        self.assertTrue(any("code-like" in p for p in problems))

    def test_short_task_rejected(self):
        t = task("t1")
        t["tests"] = t["tests"][:5]
        self.assertIn("fewer than 6 tests", C.check_task(t))

    def test_load_tasks_rejects_id_mismatch(self):
        import yaml
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "other.yml").write_text(yaml.safe_dump(task("t1")), encoding="utf-8")
            with self.assertRaises(SystemExit):
                C.load_tasks(Path(d))


class SubsetTests(unittest.TestCase):
    def test_two_per_category_in_sorted_order(self):
        tasks = {}
        for cat in C.CATEGORIES:
            for n in range(3):
                tid = f"{cat}-{n}"
                tasks[tid] = {"category": cat}
        ids = subset.pick(tasks)
        self.assertEqual(len(ids), 2 * len(C.CATEGORIES))
        self.assertEqual(ids, sorted(ids))
        self.assertIn("text-0", ids)
        self.assertNotIn("text-2", ids)


class GateTests(unittest.TestCase):
    def test_gate_fails_only_beyond_tolerance(self):
        base = {"fitness": 60.0}
        self.assertTrue(score.compare(base, {"fitness": 58.0}, 2.0)["pass"])
        self.assertFalse(score.compare(base, {"fitness": 57.9}, 2.0)["pass"])
        self.assertTrue(score.compare(base, {"fitness": 70.0}, 2.0)["pass"])


def result(kind: str, key: str, sample: int, attempt: int = 0, **kw) -> dict:
    base = {"kind": kind, "key": key, "sample": sample, "compiled": True, "diagnostics": [],
            "pass": True, "tests": [], "tokens": 10}
    if kind == "write":
        base["attempt"] = attempt
    if kind == "read":
        base["probe"] = 0
    base.update(kw)
    return base


class GateVerdictTests(unittest.TestCase):
    """Verdict: pass when head fitness is within tolerance of base. Fail with attempts left exits 2."""

    TOL = 2.0

    def _verdict(self, base, head, attempt=1, max_attempts=2):
        return gate.verdict(7, {"fitness": base}, {"fitness": head}, self.TOL, attempt, max_attempts)

    def test_delta_within_tolerance_passes(self):
        out, rc = self._verdict(50.0, 49.0)  # delta -1.0 is inside -2.0
        self.assertTrue(out["pass"])
        self.assertEqual((out["delta"], rc), (-1.0, 0))

    def test_delta_over_tolerance_fails_and_asks_for_rerun(self):
        out, rc = self._verdict(50.0, 46.0)  # delta -4.0 is past -2.0
        self.assertFalse(out["pass"])
        self.assertEqual(rc, gate.RERUN)

    def test_failure_on_last_attempt_is_final(self):
        out, rc = self._verdict(50.0, 46.0, attempt=2, max_attempts=2)
        self.assertFalse(out["pass"])
        self.assertEqual(rc, 0)

    def test_passing_rerun_overrides_first_failure(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        base, head, out = d / "base.json", d / "head.json", d / "bench-gate" / "7.json"
        base.write_text(json.dumps({"fitness": 50.0}), encoding="utf-8")
        cmd = [sys.executable, "-m", "bench.harness.gate", "verdict", "--pr", "7", "--base", str(base),
               "--head", str(head), "--out", str(out)]

        head.write_text(json.dumps({"fitness": 46.0}), encoding="utf-8")
        first = subprocess.run(cmd + ["--attempt", "1"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(first.returncode, gate.RERUN)
        self.assertFalse(json.loads(out.read_text(encoding="utf-8"))["pass"])

        head.write_text(json.dumps({"fitness": 49.5}), encoding="utf-8")
        second = subprocess.run(cmd + ["--attempt", "2"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(second.returncode, 0, second.stderr)
        final = json.loads(out.read_text(encoding="utf-8"))
        self.assertTrue(final["pass"])
        self.assertEqual(final["attempt"], 2)


class ScoreTests(unittest.TestCase):
    def write_results(self, root: Path, rows: list[dict]) -> Path:
        d = root / "results"
        for r in rows:
            name = {"write": f"s{r['sample']}-w{r.get('attempt')}", "read": f"s{r['sample']}-r{r.get('probe')}",
                    "edit": f"s{r['sample']}-e"}[r["kind"]]
            p = d / r["key"] / f"{name}.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(r), encoding="utf-8")
        return d

    def test_metrics_from_synthetic_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [
                result("write", "k1", 1, 1),                                  # solved first try
                result("write", "k2", 1, 1, compiled=False, **{"pass": False},
                       diagnostics=[{"code": "E1"}]),
                result("write", "k2", 1, 2),                                  # repaired
                result("read", "k1", 1, probe=0),
                result("read", "k1", 1, probe=1, **{"pass": False}),
                result("edit", "k1", 1),
            ]
            d = self.write_results(Path(tmp), rows)
            out = score.compute(d)
            m = out["metrics"]
            self.assertEqual(m["pass1"], 0.5)
            self.assertEqual(m["pass3"], 1.0)
            self.assertEqual(m["repair"], 1.0)
            self.assertEqual(m["read"], 0.5)
            self.assertEqual(m["edit1"], 1.0)
            self.assertEqual(m["token_efficiency"], 1.0)
            self.assertGreater(out["fitness"], 0)

    def test_repair_is_zero_when_fix_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [result("write", "k", 1, 1, compiled=False, **{"pass": False}),
                    result("write", "k", 1, 2, compiled=False, **{"pass": False})]
            out = score.compute(self.write_results(Path(tmp), rows))
            self.assertEqual(out["metrics"]["repair"], 0.0)

    def test_token_efficiency_against_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = self.write_results(Path(tmp), [result("write", "k", 1, 1, tokens=50)])
            base = {"tokens_per_task": {"k": 100}}
            self.assertEqual(score.compute(d, base)["metrics"]["token_efficiency"], 1.0)
            base = {"tokens_per_task": {"k": 25}}
            self.assertEqual(score.compute(d, base)["metrics"]["token_efficiency"], 0.5)


class PipelineTests(unittest.TestCase):
    """Full generate/execute/score loop on two throwaway tasks, using the offline Python fake."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="bench-test-"))
        cls.tasks = make_tasks(cls.tmp, ["arith-a", "text-b"])
        cls.out = cls.tmp / "gen"
        fake = {"BENCH_FAKE_MODEL": "python-ref"}
        common = ["bench.harness.generate", "--tasks", str(cls.tasks), "--out", str(cls.out),
                  "--lang", "python", "--samples", "1"]
        for k in range(1, 5):
            run_mod(*common, "round", str(k), env=fake)
            run_mod("bench.harness.execute", "--in", str(cls.out), "--out", str(cls.out / "results"),
                    "--lang", "python")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_every_sample_solved_and_read_and_edit_recorded(self):
        results = self.out / "results"
        for key in ("arith-a", "text-b"):
            self.assertTrue((results / key / "s1-w1.json").exists())
            self.assertTrue(json.loads((results / key / "s1-w1.json").read_text())["pass"])
            self.assertTrue((self.out / "predictions" / key / "s1-r0.json").exists())
            self.assertTrue((self.out / "variants" / key / "s1-e.py").exists())

    def test_score_is_perfect_on_fake_model(self):
        out = score.compute(self.out / "results")
        self.assertEqual(out["metrics"]["pass1"], 1.0)
        self.assertEqual(out["metrics"]["read"], 1.0)
        self.assertEqual(out["metrics"]["edit1"], 1.0)
        self.assertEqual(out["samples"], 2)

    def test_bundle_has_no_prompts_or_ids_in_plain_mode(self):
        bundle = json.loads((self.out / "bundle.json").read_text())
        self.assertEqual(set(bundle), {"arith-a", "text-b"})
        self.assertNotIn("prompt", json.dumps(bundle))

    def test_execute_glyph_without_compiler_exits_3(self):
        # bin/glyphc is owned by the check builder and may exist. Test the no-compiler path on a temp
        # copy of the repo with compiler/ACTIVE removed, so the real checkout is never changed.
        copy = self.tmp / "nocompiler"
        for part in ("bench", "bin", "compiler", "toolkit", "governance", "tools"):
            src = ROOT / part
            if src.exists():
                shutil.copytree(src, copy / part, ignore=shutil.ignore_patterns("__pycache__"))
        (copy / "compiler" / "ACTIVE").unlink(missing_ok=True)
        gen = self.tmp / "glyph-gen"
        (gen / "programs" / "arith-a").mkdir(parents=True)
        (gen / "programs" / "arith-a" / "s1-w1.glyph").write_text("main", encoding="utf-8")
        (gen / "bundle.json").write_text((self.out / "bundle.json").read_text(), encoding="utf-8")
        p = subprocess.run([sys.executable, "-m", "bench.harness.execute", "--in", str(gen),
                            "--out", str(gen / "results"), "--lang", "glyph"],
                           cwd=copy, env=dict(os.environ, PYTHONPATH=str(copy)),
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 3, p.stderr)

    def test_opaque_mode_hides_ids(self):
        gen = self.tmp / "opaque"
        common = ["bench.harness.generate", "--tasks", str(self.tasks), "--out", str(gen),
                  "--lang", "python", "--samples", "1", "--opaque"]
        env = {"BENCH_FAKE_MODEL": "python-ref", "HELDOUT_KEY": TEST_SECRET}
        run_mod(*common, "round", "1", env=env)
        bundle_text = (gen / "bundle.json").read_text()
        self.assertNotIn("arith-a", bundle_text)
        keys = {p.name for p in (gen / "programs").iterdir()}
        self.assertEqual(keys, {C.opaque_key(TEST_SECRET, "arith-a"), C.opaque_key(TEST_SECRET, "text-b")})
        self.assertTrue(json.loads((gen / "manifest.json").read_text())["opaque"])

    def test_opaque_requires_key(self):
        p = run_mod("bench.harness.generate", "--tasks", str(self.tasks), "--out", str(self.tmp / "nk"),
                    "--lang", "python", "--opaque", "round", "1", check=False,
                    env={"BENCH_FAKE_MODEL": "python-ref"})
        self.assertNotEqual(p.returncode, 0)


@unittest.skipUnless(shutil.which("age") and shutil.which("age-keygen"), "age not installed")
class HeldoutTests(unittest.TestCase):
    def test_setup_then_extract_round_trip(self):
        tmp = Path(tempfile.mkdtemp(prefix="bench-held-"))
        try:
            src = tmp / "src"
            (src / "ref").mkdir(parents=True)
            (src / "h1.yml").write_text("id: h1\n", encoding="utf-8")
            (src / "ref" / "h1.py").write_text(REF, encoding="utf-8")
            key_out = tmp / "key.txt"
            archive = tmp / "held.tar.age"
            env = {"HELDOUT_KEY_OUT": str(key_out), "HELDOUT_ARCHIVE": str(archive)}
            p = subprocess.run(["sh", str(ROOT / "tools" / "setup.sh"), str(src)], cwd=ROOT,
                               env=dict(os.environ, **env), capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertNotIn("AGE-SECRET-KEY", p.stdout + p.stderr)
            self.assertEqual(oct(key_out.stat().st_mode & 0o777), "0o600")
            secret = [l for l in key_out.read_text().splitlines() if l.startswith("AGE-SECRET-KEY-")][0]
            os.environ["HELDOUT_KEY"] = secret
            try:
                out = heldout.extract(tmp / "out", archive)
            finally:
                del os.environ["HELDOUT_KEY"]
            self.assertTrue((out / "h1.yml").exists())
            self.assertTrue((out / "ref" / "h1.py").exists())
            with open(archive, "rb") as fh:
                self.assertNotIn(b"h1.yml", fh.read())  # ciphertext only
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


@unittest.skipUnless(shutil.which("age") and shutil.which("age-keygen"), "age not installed")
class HeldoutRunTests(unittest.TestCase):
    def test_heldout_run_leaves_only_totals(self):
        import yaml
        tmp = Path(tempfile.mkdtemp(prefix="bench-hrun-"))
        saved = {k: os.environ.get(k) for k in ("HELDOUT_KEY", "BENCH_FAKE_MODEL")}
        try:
            src = tmp / "src"
            (src / "ref").mkdir(parents=True)
            for tid in ("h-a", "h-b"):
                (src / f"{tid}.yml").write_text(yaml.safe_dump(task(tid), sort_keys=False), encoding="utf-8")
                (src / "ref" / f"{tid}.py").write_text(REF, encoding="utf-8")
            key = tmp / "key.txt"
            subprocess.run(["age-keygen", "-o", str(key)], capture_output=True, check=True)
            secret = [l for l in key.read_text(encoding="utf-8").splitlines() if l.startswith("AGE-SECRET-KEY-")][0]
            pub = subprocess.run(["age-keygen", "-y", str(key)], capture_output=True, text=True,
                                 check=True).stdout.strip()
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w") as tar:
                for p in sorted(src.rglob("*")):
                    if p.is_file():
                        tar.add(p, arcname=str(p.relative_to(src)))
            archive = tmp / "held.tar.age"
            subprocess.run(["age", "-r", pub, "-o", str(archive)], input=buf.getvalue(), check=True)

            seen_envs = []

            def local_execute(ws: Path, results: Path) -> None:
                # Stand-in for the sandbox: same command, scrubbed environment, no key in env.
                env = {"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT)}
                seen_envs.append(env)
                subprocess.run([sys.executable, "-m", "bench.harness.execute", "--in", str(ws),
                                "--out", str(results), "--lang", "python"],
                               cwd=ROOT, env=env, check=True, capture_output=True)

            os.environ["HELDOUT_KEY"] = secret
            os.environ["BENCH_FAKE_MODEL"] = "python-ref"
            out = tmp / "out"
            summary = heldout_run.run(out, samples=1, archive=archive, sandbox=local_execute)

            self.assertEqual(sorted(p.name for p in out.iterdir()), ["totals.json"])
            totals = json.loads((out / "totals.json").read_text(encoding="utf-8"))
            self.assertEqual(set(totals), {"fitness", "metrics"})
            self.assertEqual(totals, json.loads(json.dumps(summary)))
            self.assertGreater(totals["fitness"], 0)
            text = (out / "totals.json").read_text(encoding="utf-8")
            self.assertNotIn("h-a", text)
            self.assertNotIn("AGE-SECRET", text)
            self.assertTrue(seen_envs)
            for env in seen_envs:
                self.assertNotIn("HELDOUT_KEY", env)
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
