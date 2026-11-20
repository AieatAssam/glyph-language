"""Local end-to-end run of two nightly runs (six cycles each) on one temp origin.

    python3 tools/e2e_night.py [--keep] [--json]

Every CI job becomes a fresh clone of a bare origin whose branch `dryrun` is seeded from HEAD of
this repo. Each job runs the same tools/ commands the workflows run, with the real git and a
persistent fake `gh` on PATH. State moves between jobs only through the origin, and agent output
moves through directories standing in for workflow artifacts, as in CI.

Deviations from CI, all deliberate:
  - the sandboxed rules check (docker, bin/glyphc) is replaced by a synthesized result JSON per open
    agent PR, with every rule passing and sha equal to the PR head;
  - bench, base-check, fixed-point, cutover, release and site are not run;
  - night 2 keeps running cycles after its sixth, up to EXTRA_CAP, until RFC 0001 is implemented.

Assertions (see checks()): RFC 0001 implemented; PR numbers not reused across nights; every agent
event's session carries /r1/ or /r2/; night 1 events survive night 2 unchanged with unique idem
keys; close succeeds on both nights for the same date.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from tools.lib import audit, state as S  # noqa: E402  (inspection only; jobs run the clone's own code)

BASE = "dryrun"
SLUG = "local/dryrun"
RUN_DATE = "2026-11-20"
CYCLES = 6
EXTRA_CAP = 6
DROP_ENV = re.compile(r"TOKEN|SECRET|PASSWORD|API_KEY|_KEY$|CREDENTIAL|^GLYPH_|^GITHUB_|^GH_|^GIT_|"
                      r"^CYCLE$|^RUN_DATE$|^BASE_BRANCH$|^AGENT_MODE$|^RUNNER_TEMP$")
TOPLEVEL_RULES = 14

FAKE_GH = r'''#!/usr/bin/env python3
"""Persistent fake gh. PRs, issues and comments live in $FAKE_GH_STATE; heads are read from $FAKE_GH_ORIGIN."""
import json, os, subprocess, sys

STATE = os.environ["FAKE_GH_STATE"]
ORIGIN = os.environ["FAKE_GH_ORIGIN"]
REPO = os.environ["GITHUB_REPOSITORY"]
ARGS = sys.argv[1:]


def opt(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


def fail(msg):
    print(f"fake gh: {msg}", file=sys.stderr)
    sys.exit(1)


def load():
    if os.path.exists(STATE):
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    return {"next": 1, "items": {}}


def save(s):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=1)


def branch_sha(branch):
    r = subprocess.run(["git", "-C", ORIGIN, "rev-parse", "--verify", "-q", f"refs/heads/{branch}"],
                       capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def pr_obj(n, it):
    return {"number": int(n), "title": it["title"], "body": it["body"], "state": it["state"],
            "headRefName": it["head"], "headRefOid": branch_sha(it["head"]), "baseRefName": it["base"],
            "head": {"ref": it["head"]}}


def issue_obj(n, it):
    return {"number": int(n), "title": it["title"], "body": it["body"], "state": it["state"]}


def emit(data):
    jq = opt("--jq")
    if jq is None:
        print(json.dumps(data))
        return
    r = subprocess.run(["jq", "-r", jq], input=json.dumps(data), capture_output=True, text=True)
    if r.returncode:
        fail(f"jq: {r.stderr.strip()}")
    sys.stdout.write(r.stdout)


def main():
    s = load()
    items = s["items"]
    if ARGS[0] == "api":
        ep = next(a for a in ARGS[1:] if a.startswith("repos/"))
        path = ep.split("?")[0].split("/")  # repos, owner, repo, kind, number, sub
        kind = path[3]
        if len(path) == 6 and path[5] in ("comments", "reviews"):
            it = items.get(path[4])
            emit(list(it.get(path[5], [])) if it else [])
        elif kind == "pulls":
            emit([pr_obj(n, it) for n, it in items.items() if it["kind"] == "pr"])
        elif kind == "issues":
            emit([issue_obj(n, it) for n, it in items.items()])
        else:
            fail(f"unsupported endpoint {ep}")
        return
    cmd = tuple(ARGS[:2])
    if cmd == ("pr", "create"):
        head, base, title = opt("--head"), opt("--base"), opt("--title")
        if not branch_sha(head):
            fail(f"head ref {head} not found on origin")
        if any(it["kind"] == "pr" and it["head"] == head and it["state"] == "OPEN" for it in items.values()):
            fail("a pull request for this branch already exists")
        n = s["next"]
        s["next"] += 1
        items[str(n)] = {"kind": "pr", "title": title, "body": sys.stdin.read(), "head": head, "base": base,
                         "state": "OPEN", "comments": [], "reviews": []}
        save(s)
        print(f"https://github.com/{REPO}/pull/{n}")
    elif cmd == ("issue", "create"):
        n = s["next"]
        s["next"] += 1
        items[str(n)] = {"kind": "issue", "title": opt("--title"), "body": sys.stdin.read(), "head": "",
                         "base": "", "state": "OPEN", "comments": [], "reviews": []}
        save(s)
        print(f"https://github.com/{REPO}/issues/{n}")
    elif cmd == ("pr", "list"):
        want = {"open": {"OPEN"}, "closed": {"CLOSED", "MERGED"}, "all": None}[opt("--state", "open")]
        head = opt("--head")
        fields = opt("--json", "number").split(",")
        rows = []
        for n, it in reversed(list(items.items())):  # newest first, as gh lists them
            if it["kind"] != "pr" or (want and it["state"] not in want) or (head and it["head"] != head):
                continue
            o = pr_obj(n, it)
            rows.append({f: o[f] for f in fields})
        emit(rows)
    elif cmd in (("pr", "view"), ("issue", "view")):
        n = ARGS[2]
        it = items.get(n)
        if not it or it["kind"] != ("pr" if cmd[0] == "pr" else "issue"):
            fail(f"{cmd[0]} {n} not found")
        o = pr_obj(n, it) if cmd[0] == "pr" else issue_obj(n, it)
        emit({f: o[f] for f in opt("--json").split(",")})
    elif cmd in (("pr", "comment"), ("issue", "comment")):
        items[ARGS[2]]["comments"].append({"body": sys.stdin.read()})
        save(s)
    elif cmd == ("pr", "review"):
        items[ARGS[2]]["reviews"].append({"body": sys.stdin.read(), "state": "COMMENTED"})
        save(s)
    elif cmd == ("pr", "close"):
        n, comment = ARGS[2], opt("--comment")
        if comment:
            items[n]["comments"].append({"body": comment})
        items[n]["state"] = "MERGED" if comment and comment.startswith("Merged to base") else "CLOSED"
        save(s)
    elif cmd == ("issue", "close"):
        items[ARGS[2]]["state"] = "CLOSED"
        save(s)
    else:
        fail(f"unsupported call: {' '.join(ARGS)}")


main()
'''

ITEM_JQ_QUEUE = '[.[] | select(.headRefName | startswith("agent/")) | select(.baseRefName == $ENV.BASE_BRANCH) | {pr: .number, sha: .headRefOid}]'


class StepFailed(RuntimeError):
    pass


class Harness:
    def __init__(self, tmp: Path):
        self.tmp = tmp
        self.origin = tmp / "origin.git"
        self.gh_state = tmp / "gh-state.json"
        self.bin = tmp / "bin"
        self.jobs = tmp / "jobs"
        self.art = tmp / "artifacts"
        self.gitcfg = tmp / "gitconfig"
        self.steps: list[dict] = []
        self.njob = 0
        roster = yaml.safe_load((REPO / "governance" / "roster.yml").read_text(encoding="utf-8"))
        self.agents = [a["id"] for a in roster["agents"]]
        self.base_env = {k: v for k, v in os.environ.items() if not DROP_ENV.search(k)}
        self.snap: list[dict] = []
        self.status_by_cycle: list[str | None] = []
        self.close: dict[str, dict] = {}
        self.extra = 0

    # ----- setup -------------------------------------------------------
    def setup(self):
        for d in (self.jobs, self.art, self.bin):
            d.mkdir(parents=True)
        self.gitcfg.write_text("", encoding="utf-8")
        subprocess.run(["git", "init", "-q", "--bare", str(self.origin)], check=True)
        # Seed with HEAD's tree under a "Bot: mergebot" message, so owner_scan skips the seed commit
        # (it would otherwise log every protected file as an owner change).
        seed_env = dict(os.environ, GIT_AUTHOR_NAME="glyph-e2e", GIT_AUTHOR_EMAIL="e2e@local",
                        GIT_COMMITTER_NAME="glyph-e2e", GIT_COMMITTER_EMAIL="e2e@local")
        # The seed drops audit/: a fresh night starts from an empty log, as the live repo did.
        idx = dict(seed_env, GIT_INDEX_FILE=str(self.tmp / "seed.index"))
        subprocess.run(["git", "-C", str(REPO), "read-tree", "HEAD"], check=True, env=idx)
        subprocess.run(["git", "-C", str(REPO), "rm", "-r", "-q", "--cached", "--ignore-unmatch", "audit"],
                       check=True, env=idx)
        tree = subprocess.run(["git", "-C", str(REPO), "write-tree"], capture_output=True, text=True,
                              check=True, env=idx).stdout.strip()
        seed = subprocess.run(["git", "-C", str(REPO), "commit-tree", tree, "-m",
                               "Harness seed\n\nBot: mergebot"], capture_output=True, text=True,
                              check=True, env=seed_env).stdout.strip()
        subprocess.run(["git", "-C", str(REPO), "push", "-q", str(self.origin),
                        f"{seed}:refs/heads/main", f"{seed}:refs/heads/{BASE}"], check=True)
        gh = self.bin / "gh"
        gh.write_text(FAKE_GH, encoding="utf-8")
        gh.chmod(0o755)

    def env_for(self, clone: Path, night: int, cycle: int) -> dict:
        env = dict(self.base_env)
        env.update({
            "PATH": f"{self.bin}{os.pathsep}{self.base_env.get('PATH', '')}",
            "GH_TOKEN": "fake-token-for-local-run",
            "GITHUB_REPOSITORY": SLUG,
            "BASE_BRANCH": BASE,
            "RUN_DATE": RUN_DATE,
            "GLYPH_RUN": str(night),
            "CYCLE": str(cycle),
            "AGENT_MODE": "scripted",
            "GLYPH_ROOT": str(clone),
            "FAKE_GH_STATE": str(self.gh_state),
            "FAKE_GH_ORIGIN": str(self.origin),
            "GIT_CONFIG_GLOBAL": str(self.gitcfg),
            "GIT_CONFIG_NOSYSTEM": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(clone),
        })
        return env

    def clone(self, label: str) -> Path:
        self.njob += 1
        d = self.jobs / f"{self.njob:03d}-{label}"
        subprocess.run(["git", "clone", "-q", "--branch", BASE, str(self.origin), str(d)], check=True,
                       capture_output=True, text=True, env=self.env_for(d, 0, 0))
        return d

    def run(self, label, argv, cwd: Path, env: dict, check=True):
        res = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, text=True)
        self.steps.append({"job": label, "rc": res.returncode, "stdout": res.stdout[-400:],
                           "stderr": res.stderr[-400:]})
        if check and res.returncode:
            raise StepFailed(f"{label} exited {res.returncode}: {res.stderr.strip()[-800:]}")
        return res

    # ----- jobs, mirroring .github/workflows ----------------------------
    def mergebot(self, label, args, night, cycle, files=None, check=True):
        c = self.clone(label)
        for name, src in (files or {}).items():
            shutil.copytree(src, c / name)
        res = self.run(label, [sys.executable, "-m", "tools.mergebot", *args], c,
                       self.env_for(c, night, cycle), check=check)
        return res

    def phase(self, night: int, cycle: int, phase: str):
        """phase.yml: plan (orchestrate), one agent job per assignment, publish, ingest."""
        tag = f"n{night}-c{cycle}-{phase}"
        env_cycle = cycle
        plan = self.clone(f"plan-{tag}")
        orch = plan / "orch"
        self.run(f"plan {tag}", [sys.executable, "-m", "tools.orchestrate", "--phase", phase, "--out",
                                 str(orch)], plan, self.env_for(plan, night, env_cycle))
        asg = json.loads((orch / "assignments.json").read_text(encoding="utf-8"))
        if not asg:
            return
        orch_art = self.art / f"orch-{tag}"
        shutil.copytree(orch, orch_art)
        sessions = self.art / f"sessions-{tag}"
        sessions.mkdir()
        for a in asg:
            agent = a["agent"]
            c = self.clone(f"agent-{agent}-{tag}")
            shutil.copytree(orch_art, c / "orch")
            (c / "agent-out" / agent).mkdir(parents=True)
            self.run(f"agent {agent} {tag}", ["bash", "tools/run_agent.sh", agent, f"orch/{agent}.md",
                                              f"agent-out/{agent}"], c, self.env_for(c, night, env_cycle))
            shutil.copytree(c / "agent-out" / agent, sessions / agent)
        pub = self.clone(f"publish-{tag}")
        shutil.copytree(sessions, pub / "sessions")
        dirs = sorted(p.name for p in (pub / "sessions").iterdir())
        self.run(f"publish {tag}", [sys.executable, "-m", "tools.publisher", "--session-dirs",
                                    *[f"sessions/{d}" for d in dirs], "--out", "published"], pub,
                 self.env_for(pub, night, env_cycle))
        pub_art = self.art / f"published-{tag}"
        shutil.copytree(pub / "published", pub_art)
        ing = self.clone(f"ingest-{tag}")
        shutil.copytree(pub_art, ing / "published")
        self.run(f"ingest {tag}", [sys.executable, "-m", "tools.mergebot", "ingest", "published"], ing,
                 self.env_for(ing, night, env_cycle))

    def checks(self, night: int, cycle: int) -> Path:
        """Stands in for the check job: one result per open agent PR, sha = head, base = origin tip."""
        out = self.art / f"checks-n{night}-c{cycle}"
        out.mkdir(parents=True)
        c = self.clone(f"check-n{night}-c{cycle}")
        env = self.env_for(c, night, cycle)
        res = self.run("list open agent PRs", ["gh", "pr", "list", "-R", SLUG, "--state", "open", "--limit",
                                               "200", "--json", "number,headRefName,headRefOid,baseRefName",
                                               "--jq", ITEM_JQ_QUEUE], c, env)
        prs = json.loads(res.stdout or "[]")
        base = subprocess.run(["git", "-C", str(c), "rev-parse", "HEAD"], capture_output=True,
                              text=True).stdout.strip()
        rules = {str(k): {"ok": True, "detail": ""} for k in range(1, TOPLEVEL_RULES + 1)}
        for p in prs:
            (out / f"{p['pr']}.json").write_text(json.dumps({"pr": p["pr"], "sha": p["sha"],
                                                              "base_sha": base, "rules": rules}),
                                                 encoding="utf-8")
        return out

    def cycle(self, night: int, c: int):
        self.mergebot(f"open n{night}c{c}", ["open"], night, c)
        self.phase(night, c, "design")
        self.phase(night, c, "vote")
        self.mergebot(f"decide n{night}c{c}", ["decide"], night, c)
        self.phase(night, c, "implement")
        checks = self.checks(night, c)
        self.phase(night, c, "review")
        # CI downloads check results outside the repo (RUNNER_TEMP), so pass them by absolute path
        # rather than copying them into the clone (a copy would be committed by the merge job).
        self.mergebot(f"merge n{night}c{c}", ["merge", str(checks)], night, c)
        self.phase(night, c, "use")
        self.status_by_cycle.append(self.rfc_status())

    def night(self, n: int, extend_until_implemented=False):
        self.mergebot(f"open-night n{n}", ["open", "--night"], n, 0)
        self.phase(n, 0, "architect")
        for c in range(1, CYCLES + 1):
            self.cycle(n, c)
        if extend_until_implemented:
            while self.rfc_status() != "implemented" and self.extra < EXTRA_CAP:
                self.extra += 1
                self.cycle(n, CYCLES + self.extra)
        self.phase(n, 0, "scribe")
        res = self.mergebot(f"close n{n}", ["close"], n, 0, check=False)
        self.close[str(n)] = {"rc": res.returncode, "stdout": res.stdout[-300:], "stderr": res.stderr[-300:]}

    # ----- inspection (read-only clones of the origin) -------------------
    def inspect(self, label: str) -> Path:
        return self.clone(f"inspect-{label}")

    def rfc_status(self):
        c = self.inspect("rfc")
        return S.load_state(c)["rfcs"].get("0001", {}).get("status")

    def origin_git(self, *args) -> subprocess.CompletedProcess:
        return subprocess.run(["git", "-C", str(self.origin), *args], capture_output=True, text=True)


def load_events(clone: Path) -> list[dict]:
    return audit.load_events(clone)


def analyze(h: Harness, report: dict):
    c = h.inspect("final")
    final = load_events(c)
    ok, bad = audit.verify_chain(c)
    report["chain_ok"] = bool(ok)
    report["events_total"] = len(final)
    report["rfc_0001_status"] = S.load_state(c)["rfcs"].get("0001", {}).get("status")
    report["rfc_status_by_cycle"] = h.status_by_cycle
    report["extra_cycles"] = h.extra
    cycles_to = next((i + 1 for i, s in enumerate(h.status_by_cycle) if s == "implemented"), None)
    report["cycles_to_implemented"] = cycles_to

    gh_items = json.loads(h.gh_state.read_text(encoding="utf-8"))["items"] if h.gh_state.exists() else {}
    purposes: dict[str, set] = {}
    for e in final:
        if e["type"] == "pr_opened":
            n = str(e["subject"]["pr"])
            head = gh_items.get(n, {}).get("head")
            purposes.setdefault(n, set()).add((head, e["data"].get("rfc"), e["data"].get("subtask")))
    report["pr_number_reuse"] = [{"pr": n, "uses": sorted(map(str, v))} for n, v in purposes.items() if len(v) > 1]
    report["pr_opened"] = {n: sorted(map(str, v)) for n, v in purposes.items()}

    agents = set(h.agents)
    agent_events = [e for e in final if e.get("actor") in agents]
    report["agent_events"] = len(agent_events)
    report["session_violations"] = [
        {"idem": e.get("idem"), "actor": e.get("actor"), "session": e.get("session")}
        for e in agent_events
        if not any(tag in (e.get("session") or "") for tag in ("/r1/", "/r2/"))]

    snap_keys = [(s["seq"], s["hash"]) for s in h.snap]
    final_keys = [(e["seq"], e["hash"]) for e in final[:len(h.snap)]]
    report["night1_events"] = len(h.snap)
    report["night1_prefix_intact"] = snap_keys == final_keys
    idems = Counter(e["idem"] for e in final if e.get("idem"))
    report["idem_duplicates"] = [k for k, v in idems.items() if v > 1]
    final_idems = set(idems)
    drops = []
    for d in sorted(h.art.glob("published-*")):
        ev_file = d / "events.jsonl"
        if not ev_file.exists():
            continue
        for line in ev_file.read_text(encoding="utf-8").splitlines():
            ev = json.loads(line)
            if ev.get("idem") not in final_idems:
                drops.append({"published": d.name, "idem": ev.get("idem"), "type": ev.get("type")})
    report["event_drops"] = drops

    close = {}
    for n in ("1", "2"):
        res = h.close.get(n, {})
        close[n] = {"rc": res.get("rc"), "stderr": (res.get("stderr") or "").strip()[-300:]}
    daily = f"audit/daily/{RUN_DATE}.md"
    # Night 1 tags audit-<date>; a second run on the same date tags audit-<date>-r<run> (mergebot cmd_close).
    tags = {t: h.origin_git("rev-parse", "-q", "--verify", f"refs/tags/{t}^{{commit}}").stdout.strip() or None
            for t in (f"audit-{RUN_DATE}", f"audit-{RUN_DATE}-r2")}
    close["tags_at_end"] = tags
    close["tag_at_end"] = tags[f"audit-{RUN_DATE}-r2"]
    close["dryrun_tip_at_end"] = h.origin_git("rev-parse", f"refs/heads/{BASE}").stdout.strip()
    close["daily_on_base_at_end"] = h.origin_git("cat-file", "-e", f"{BASE}:{daily}").returncode == 0
    report["close"] = close


def checks(report: dict) -> list[tuple[str, bool, str]]:
    """The five assertions, as (name, passed, detail). Used by the CLI and by test_e2e_night.py."""
    if report.get("aborted"):
        return [(n, False, f"run aborted: {report['aborted']}") for n in
                ("A1 RFC 0001 implemented", "A2 PR numbers not reused", "A3 agent sessions carry /r1/ or /r2/",
                 "A4 night 1 events kept, idem keys unique", "A5 close on both nights")]
    cl = report["close"]
    return [
        ("A1 RFC 0001 implemented", report["rfc_0001_status"] == "implemented",
         f"status={report['rfc_0001_status']} implemented after cycle {report['cycles_to_implemented']} "
         f"(extra cycles past six: {report['extra_cycles']})"),
        ("A2 PR numbers not reused", not report["pr_number_reuse"],
         f"PR numbers seen: {sorted(report['pr_opened'], key=int)}; reused: {report['pr_number_reuse']}"),
        ("A3 agent sessions carry /r1/ or /r2/", report["agent_events"] > 0 and not report["session_violations"],
         f"agent events: {report['agent_events']}; without run tag: {report['session_violations'][:5]}"),
        ("A4 night 1 events kept, idem keys unique",
         report["night1_prefix_intact"] and not report["idem_duplicates"] and not report["event_drops"]
         and report["chain_ok"],
         f"night 1 events: {report['night1_events']}; prefix intact: {report['night1_prefix_intact']}; "
         f"duplicate idems: {report['idem_duplicates'][:5]}; dropped: {report['event_drops'][:5]}; "
         f"chain ok: {report['chain_ok']}"),
        ("A5 close on both nights",
         cl["1"]["rc"] == 0 and cl["2"]["rc"] == 0 and all(cl["tags_at_end"].values())
         and cl["daily_on_base_at_end"],
         f"close rc n1={cl['1']['rc']} n2={cl['2']['rc']}; tags: {cl['tags_at_end']}; "
         f"daily on base: {cl['daily_on_base_at_end']}; n1 stderr: {cl['1']['stderr']!r}; "
         f"n2 stderr: {cl['2']['stderr']!r}"),
    ]


def run_e2e(keep=False) -> dict:
    tmp = Path(tempfile.mkdtemp(prefix="glyph-e2e-"))
    h = Harness(tmp)
    report: dict = {"tmp": str(tmp), "aborted": None}
    t0 = time.time()
    try:
        h.setup()
        h.night(1)
        h.snap = load_events(h.inspect("snap"))
        h.snap = [{"seq": e["seq"], "hash": e["hash"]} for e in h.snap]
        h.night(2, extend_until_implemented=True)
        analyze(h, report)
    except StepFailed as e:
        report["aborted"] = str(e)
    finally:
        report["runtime_s"] = round(time.time() - t0, 1)
        report["jobs"] = h.njob
        report["steps"] = len(h.steps)
        report["failed_steps"] = [s for s in h.steps if s["rc"]]
        if not keep:
            shutil.rmtree(tmp, ignore_errors=True)
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python3 tools/e2e_night.py")
    ap.add_argument("--keep", action="store_true", help="keep the temp directory for inspection")
    ap.add_argument("--json", action="store_true", help="print the full report as JSON")
    a = ap.parse_args(argv)
    report = run_e2e(keep=a.keep)
    if a.json:
        print(json.dumps(report, indent=1, default=str))
    results = checks(report)
    for name, passed, detail in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name}: {detail}")
    print(f"runtime {report['runtime_s']}s, jobs {report['jobs']}, steps {report['steps']}, "
          f"failed steps {len(report['failed_steps'])}")
    if a.keep:
        print(f"kept {report['tmp']}")
    return 0 if all(p for _, p, _ in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
