"""Static checks for the GitHub Actions workflows under .github/.

Run from the repository root: python3 -m unittest tools.test_workflows
"""
import json
import pathlib
import re
import subprocess
import sys
import unittest

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
WF_DIR = ROOT / ".github" / "workflows"
RANK = {"none": 0, "read": 1, "write": 2}
BANNED_TRIGGERS = {"pull_request", "pull_request_target"}
AGENT_ENV = "agents"
# The only jobs allowed to reference secrets.
SECRET_JOBS = {("phase.yml", "agents"), ("bench.yml", "generate")}
MAX_NESTING = 10
USES_RE = re.compile(r"[\w.-]+/[\w.-]+(?:/[\w./-]+)?@v\d+")
MODULE_RE = re.compile(r"python3? -m ((?:tools|bench)(?:\.\w+)*)(?:\s+([a-z][a-z-]*))?")


def load_workflows():
    docs = {}
    for path in sorted(WF_DIR.glob("*.yml")):
        with open(path, encoding="utf-8") as f:
            docs[path.name] = yaml.safe_load(f)
    return docs


def trigger_names(doc):
    # PyYAML reads the bare key `on` as the boolean True.
    on = doc.get("on", doc.get(True))
    if isinstance(on, (dict, list)):
        return set(on)
    return {on}


def jobs_of(doc):
    return doc.get("jobs") or {}


def steps_of(job):
    return job.get("steps") or []


def env_name(job):
    env = job.get("environment")
    if isinstance(env, dict):
        return env.get("name")
    return env


def local_call(job):
    """Return the file name of a local reusable workflow this job calls, or None."""
    uses = job.get("uses")
    if isinstance(uses, str) and uses.startswith("./.github/workflows/"):
        return uses.rsplit("/", 1)[-1]
    return None


def merge_into(acc, perms):
    for scope, level in perms.items():
        if RANK.get(level, -1) > RANK.get(acc.get(scope, "none"), 0):
            acc[scope] = level
    return acc


def effective(name, docs, memo=None, stack=()):
    """Highest permission each scope can reach inside workflow `name`, callees included."""
    memo = {} if memo is None else memo
    if name in memo:
        return memo[name]
    if name in stack:
        raise AssertionError(f"reusable workflow cycle through {name}")
    acc = {}
    for job in jobs_of(docs[name]).values():
        callee = local_call(job)
        if callee:
            merge_into(acc, effective(callee, docs, memo, stack + (name,)))
        else:
            merge_into(acc, job.get("permissions") or {})
    memo[name] = acc
    return acc


def depth(name, docs, memo=None, stack=()):
    """Reusable-call levels from `name` down, counting `name` itself as level 1."""
    memo = {} if memo is None else memo
    if name in memo:
        return memo[name]
    if name in stack:
        raise AssertionError(f"reusable workflow cycle through {name}")
    d = 1
    for job in jobs_of(docs[name]).values():
        callee = local_call(job)
        if callee:
            d = max(d, 1 + depth(callee, docs, memo, stack + (name,)))
    memo[name] = d
    return d


def module_exists(mod):
    base = ROOT.joinpath(*mod.split("."))
    return base.with_suffix(".py").is_file() or base.is_dir()


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs = load_workflows()

    def test_workflows_present(self):
        for name in ("nightly.yml", "cycle.yml", "phase.yml", "bench.yml",
                     "weekly.yml", "ci.yml", "release.yml", "baseline.yml"):
            self.assertIn(name, self.docs)

    def test_no_pull_request_triggers(self):
        for name, doc in self.docs.items():
            banned = trigger_names(doc) & BANNED_TRIGGERS
            self.assertFalse(banned, f"{name} uses banned trigger(s) {banned}")

    def test_permissions_declared_and_valid(self):
        for name, doc in self.docs.items():
            self.assertIsInstance(doc.get("permissions"), dict, f"{name}: top-level permissions")
            for job_id, job in jobs_of(doc).items():
                where = f"{name}:{job_id}"
                self.assertIsInstance(job.get("permissions"), dict, f"{where}: permissions")
                for scope, level in job["permissions"].items():
                    self.assertIn(level, RANK, f"{where}: bad level {level!r} for {scope}")

    def test_agent_jobs_are_read_only(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                if env_name(job) != AGENT_ENV:
                    continue
                where = f"{name}:{job_id}"
                self.assertEqual(job["permissions"], {"contents": "read"}, where)
                dumped = json.dumps(job)
                self.assertNotIn("GH_TOKEN", dumped, f"{where}: agent job must not get GH_TOKEN")
                self.assertNotIn("github.token", dumped, f"{where}: agent job must not get a token")

    def test_secrets_only_in_agent_and_bench_generate(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                if "secrets." in json.dumps(job):
                    self.assertIn((name, job_id), SECRET_JOBS,
                                  f"{name}:{job_id} references secrets")
        for name, job_id in SECRET_JOBS:
            job = jobs_of(self.docs[name]).get(job_id)
            self.assertIsNotNone(job, f"{name}:{job_id} missing")
            self.assertIn("secrets.", json.dumps(job), f"{name}:{job_id} should use secrets")

    def test_callers_do_not_set_environment(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                if "uses" in job:
                    self.assertNotIn("environment", job, f"{name}:{job_id} is a caller")

    def test_environment_is_scalar_or_mapping(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                if "environment" in job:
                    self.assertIsInstance(job["environment"], (str, dict),
                                          f"{name}:{job_id} environment must not be a list")

    def test_needs_reference_real_jobs(self):
        for name, doc in self.docs.items():
            jobs = jobs_of(doc)
            for job_id, job in jobs.items():
                needs = job.get("needs", [])
                if isinstance(needs, str):
                    needs = [needs]
                for n in needs:
                    self.assertIn(n, jobs, f"{name}:{job_id} needs unknown job {n}")

    def test_external_actions_pinned_to_major(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                uses_list = [job.get("uses")] + [s.get("uses") for s in steps_of(job)]
                for uses in uses_list:
                    if not uses or uses.startswith("./"):
                        continue
                    self.assertRegex(uses, rf"^{USES_RE.pattern}$", f"{name}:{job_id} uses {uses}")

    def test_local_references_exist(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                uses_list = [job.get("uses")] + [s.get("uses") for s in steps_of(job)]
                for uses in uses_list:
                    if not uses or not uses.startswith("./"):
                        continue
                    target = ROOT / uses[2:]
                    ok = target.is_file() or (target / "action.yml").is_file()
                    self.assertTrue(ok, f"{name}:{job_id} references missing {uses}")

    def test_reusable_call_depth_within_limit(self):
        memo = {}
        for name in self.docs:
            d = depth(name, self.docs, memo)
            self.assertLessEqual(d, MAX_NESTING, f"{name}: reusable call depth {d}")

    def test_call_jobs_grant_what_callee_needs(self):
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                callee = local_call(job)
                if not callee:
                    continue
                grant = job.get("permissions") or {}
                for scope, level in effective(callee, self.docs).items():
                    self.assertGreaterEqual(
                        RANK[grant.get(scope, "none")], RANK[level],
                        f"{name}:{job_id} grants {grant} but {callee} needs {scope}: {level}")

    def test_cycle_group_shared_by_nightly_weekly_baseline(self):
        for name in ("nightly.yml", "weekly.yml", "baseline.yml"):
            conc = self.docs[name].get("concurrency") or {}
            self.assertEqual(conc.get("group"), "nightly", name)
            self.assertIs(conc.get("cancel-in-progress"), False, name)

    def test_codeowners_line(self):
        path = ROOT / ".github" / "CODEOWNERS"
        self.assertTrue(path.is_file(), "missing .github/CODEOWNERS")
        lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
        self.assertIn("* @AieatAssam", lines)

    def test_tools_modules_referenced_by_workflows(self):
        # Modules that do not exist yet are reported, not failed: they are built in later milestones.
        missing = set()
        for name, doc in self.docs.items():
            for job_id, job in jobs_of(doc).items():
                for step in steps_of(job):
                    for mod, _sub in MODULE_RE.findall(step.get("run", "") or ""):
                        if not module_exists(mod):
                            missing.add(mod)
        for mod in sorted(missing):
            print(f"WARNING: workflow calls {mod}, which is not in the repo yet", file=sys.stderr)

    def test_subcommands_answer_help(self):
        # `python -m tools.mergebot open` must parse its subcommand; --help exits 0 without side effects.
        found = set()
        for doc in self.docs.values():
            for job in jobs_of(doc).values():
                for step in steps_of(job):
                    for mod, sub in MODULE_RE.findall(step.get("run", "") or ""):
                        if sub and module_exists(mod):
                            found.add((mod, sub))
        self.assertIn(("tools.mergebot", "open"), found)
        for mod, sub in sorted(found):
            with self.subTest(command=f"{mod} {sub}"):
                proc = subprocess.run([sys.executable, "-m", mod, sub, "--help"], cwd=ROOT,
                                      capture_output=True, text=True, timeout=60)
                self.assertEqual(proc.returncode, 0, proc.stderr[-300:])
                self.assertIn(sub, proc.stdout)


if __name__ == "__main__":
    unittest.main()
