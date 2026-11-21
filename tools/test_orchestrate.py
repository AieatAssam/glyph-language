"""Unit tests for tools.orchestrate, plus an offline night simulation of the M1 dry run.

The unit tests use literal state and a fake repo. NightSim drives the real planner, the scripted
agents and the event log in a temp root: no network, no git writes, no GitHub.
"""
import json
import tempfile
import unittest
from unittest import mock
import os
from pathlib import Path

import jsonschema
import yaml

from tools import orchestrate as o
from tools.lib import audit
from tools.lib import rules as R
from tools.lib import state as S
from tools.scripted import agent as scripted_agent

REPO = Path(__file__).resolve().parents[1]
ROSTER = yaml.safe_load((REPO / "governance" / "roster.yml").read_text())["agents"]
ACTIONS = json.loads((REPO / "tools" / "schemas" / "actions.schema.json").read_text(encoding="utf-8"))
M2 = {"milestone": "M2", "max_open_rfcs": 5, "max_open_rfcs_per_designer": 2, "max_implementing": 3,
      "max_gated_prs_per_cycle": 2, "escalation_failures": 3, "weekly_architect_max_escalations": 3}
M1 = dict(M2, milestone="M1")
DESIGNERS = [a["id"] for a in ROSTER if a["role"] == "designer"]
USERS = [a["id"] for a in ROSTER if a["role"] == "user"]


class FakeRepo:
    base = "main"

    def __init__(self, files=None, diffs=None, refs=None):
        self.files, self.diffs, self.refs = dict(files or {}), dict(diffs or {}), dict(refs or {})

    def read(self, rel):
        return self.files.get(rel)

    def read_ref(self, branch, rel):
        return self.refs.get(branch, {}).get(rel)

    def list(self, rel):
        return sorted(k for k in self.files if k.startswith(rel + "/"))

    def diff(self, branch):
        return self.diffs.get(branch)


def run(phase, state=None, rules=M2, repo=None, events=(), run_date="2026-11-19"):
    return o.plan(phase, state=state or {}, rules=rules, roster=ROSTER,
                  repo=repo or FakeRepo(), run_date=run_date, events=events)


def rfc(n, author, status="discussion", slug=None, title=None, cls="language", **kw):
    return dict(dict(slug=slug or f"s{n}", title=title or f"t{n}", author=author, status=status,
                     **{"class": cls}, branch=f"agent/rfc-{n}"), **kw)


class Founding(unittest.TestCase):
    def test_m2_opens_four_founding_rfcs_round_robin(self):
        asgs = run("design")
        opens = [a for a in asgs if a.kind == "open"]
        self.assertEqual(sorted(x for a in opens for x in a.header["slugs"]),
                         ["diagnostic-style", "kernel", "lexical-syntax", "name"])
        self.assertEqual(sum(len(a.header["slugs"]) for a in opens), 4)
        for d in DESIGNERS:
            self.assertLessEqual(sum(len(a.header["slugs"]) for a in opens if a.agent == d), 2)

    def test_existing_founding_slug_not_reopened(self):
        st = {"rfcs": {"0001": rfc("0001", DESIGNERS[0], slug="name", title="Name", status="accepted")}}
        slugs = {x for a in run("design", state=st) if a.kind == "open" for x in a.header["slugs"]}
        self.assertNotIn("name", slugs)
        self.assertIn("kernel", slugs)

    def test_rejected_founding_rfc_returns_with_its_objections(self):
        st = {"rfcs": {"0002": rfc("0002", DESIGNERS[0], slug="kernel", status="rejected",
                                   votes={"tester": {"vote": "reject", "rationale": "Trap exit code unclear."},
                                          "impl-1": {"vote": "approve", "rationale": "ok"}})}}
        opens = [a for a in run("design", state=st) if a.kind == "open"]
        k = [a for a in opens if "kernel-v2" in a.header["slugs"]]
        self.assertEqual(len(k), 1)
        self.assertIn("Trap exit code unclear.", k[0].body)
        self.assertNotIn("ok", k[0].body.split("Attempt 2")[1])

    def test_rejected_lexical_and_kernel_go_to_one_designer(self):
        st = {"rfcs": {"0003": rfc("0003", DESIGNERS[1], slug="lexical-syntax", status="rejected"),
                       "0005": rfc("0005", DESIGNERS[2], slug="kernel", status="rejected"),
                       "0002": rfc("0002", DESIGNERS[0], slug="name", status="accepted"),
                       "0004": rfc("0004", DESIGNERS[0], slug="diagnostic-style", status="accepted")}}
        opens = [a for a in run("design", state=st) if a.kind == "open"]
        self.assertEqual([sorted(a.header["slugs"]) for a in opens], [["kernel-v2", "lexical-syntax-v2"]])

    def test_no_proposals_until_founding_rfcs_are_accepted(self):
        st = {"rfcs": {f"{i:04d}": rfc(f"{i:04d}", DESIGNERS[0], slug=s, status="rejected")
                       for i, s in enumerate(["name", "lexical-syntax", "kernel", "diagnostic-style"], 1)}}
        st["rfcs"]["0009"] = rfc("0009", DESIGNERS[1], slug="kernel-v2", status="discussion")
        kinds = {a.kind for a in run("design", state=st)}
        self.assertNotIn("propose", kinds)

    def test_m1_dry_run_opens_toy_print_only(self):
        asgs = run("design", rules=M1)
        self.assertEqual([x for a in asgs if a.kind == "open" for x in a.header["slugs"]], ["toy-print"])

    def test_scripted_run_stays_a_toy_dry_run_at_m2(self):
        with mock.patch.dict(os.environ, {"AGENT_MODE": "scripted"}):
            asgs = run("design")
        self.assertEqual([x for a in asgs if a.kind == "open" for x in a.header["slugs"]], ["toy-print"])


class Caps(unittest.TestCase):
    def test_five_open_rfcs_is_the_ceiling(self):
        st = {"rfcs": {f"{i:04d}": rfc(f"{i:04d}", DESIGNERS[i % 3]) for i in range(1, 6)}}
        self.assertEqual([a for a in run("design", state=st) if a.kind == "open"], [])

    def test_two_open_per_designer_is_the_ceiling(self):
        st = {"rfcs": {"0001": rfc("0001", DESIGNERS[0]), "0002": rfc("0002", DESIGNERS[0])}}
        opens = [a for a in run("design", state=st) if a.kind == "open"]
        self.assertTrue(all(a.agent != DESIGNERS[0] for a in opens))

    def test_blocked_pr_is_reported_while_the_next_subtask_is_built(self):
        plan = "- [x] 1. Lexer\n- [ ] 2. Parser\n"
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="kernel", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0004", "status": "open", "subtask": 1,
                             "branch": "agent/impl-0004", "head_sha": "abc"}}}
        ev = [{"type": "check_run", "subject": {"pr": 30}, "data": {"sha": "abc", "rules": {
            "3": {"ok": False, "detail": "missing: ['conformance']"}, "14": {"ok": False, "detail": "no approval"},
            "1": {"ok": True, "detail": ""}}}}]
        repo = FakeRepo(refs={"agent/impl-0004": {"rfcs/0004.plan.md": plan}})
        a = [x for x in run("implement", state=st, repo=repo, events=ev) if x.kind == "subtask"][0]
        self.assertIn("Implement subtask 2", a.body)
        self.assertIn("Current gate failures on this PR (for information; later subtasks may fix them):", a.body)
        self.assertIn("rule 3: missing: ['conformance']", a.body)
        self.assertNotIn("do not tick another plan line", a.body)
        self.assertNotIn("rule 14", a.body)
        a = [x for x in run("implement", state=st, repo=repo, events=[]) if x.kind == "subtask"][0]
        self.assertIn("Implement subtask 2", a.body)
        self.assertNotIn("Current gate failures", a.body)

    def test_fix_first_only_when_plan_is_fully_ticked(self):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="kernel", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0004", "status": "open", "subtask": 1,
                             "branch": "agent/impl-0004", "head_sha": "abc"}}}
        ev = [{"type": "check_run", "subject": {"pr": 30}, "data": {"sha": "abc", "rules": {
            "5": {"ok": False, "detail": "bad"}}}}]
        unticked = FakeRepo(refs={"agent/impl-0004": {"rfcs/0004.plan.md": "- [x] 1. a\n- [ ] 2. b\n"}})
        a = [x for x in run("implement", state=st, repo=unticked, events=ev) if x.kind == "subtask"][0]
        self.assertIn("Implement subtask 2", a.body)
        self.assertNotIn("do not tick another plan line", a.body)
        ticked = FakeRepo(refs={"agent/impl-0004": {"rfcs/0004.plan.md": "- [x] 1. a\n- [x] 2. b\n"}})
        a = [x for x in run("implement", state=st, repo=ticked, events=ev) if x.kind == "subtask"][0]
        self.assertIn("do not tick another plan line", a.body)
        self.assertIn("rule 5: bad", a.body)
        self.assertNotIn("tests", [x.kind for x in run("implement", state=st, repo=ticked, events=ev)])

    def test_founding_families_are_built_before_the_kernel_exists(self):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="diagnostic-style", status="implementing"),
                       "0016": rfc("0016", DESIGNERS[1], slug="kernel-v4", status="implementing"),
                       "0017": rfc("0017", DESIGNERS[2], slug="records", status="implementing")}}
        repo = FakeRepo(files={"rfcs/0004.plan.md": "- [ ] 1. a\n", "rfcs/0016.plan.md": "- [ ] 1. b\n",
                               "rfcs/0017.plan.md": "- [ ] 1. c\n"})
        self.assertEqual([a.header.get("rfc") for a in run("implement", state=st, repo=repo) if a.kind == "subtask"],
                         ["0004", "0016"])

    def test_diagnostic_style_is_built_before_the_kernel(self):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="diagnostic-style", status="accepted")}}
        repo = FakeRepo(files={"rfcs/0004.plan.md": "- [ ] 1. a\n"})
        self.assertEqual([a.header.get("rfc") for a in run("implement", state=st, repo=repo) if a.kind == "subtask"],
                         ["0004"])
        st["rfcs"]["0017"] = rfc("0017", DESIGNERS[1], slug="records", status="accepted")
        repo.files["rfcs/0017.plan.md"] = "- [ ] 1. c\n"
        self.assertNotIn("0017", [a.header.get("rfc") for a in run("implement", state=st, repo=repo)])

    def test_founding_subtasks_share_one_pr(self):
        st = {"rfcs": {"0011": rfc("0011", DESIGNERS[0], slug="name-v2", status="accepted"),
                       "0014": rfc("0014", DESIGNERS[1], slug="lexical-syntax-v3", status="implementing")},
              "prs": {"48": {"number": 48, "rfc": "0014", "status": "open", "subtask": 1,
                             "branch": "agent/impl-0014", "head_sha": "abc"}}}
        repo = FakeRepo(files={"rfcs/0011.plan.md": "- [ ] 1. a\n- [ ] 2. b\n",
                               "rfcs/0014.plan.md": "- [x] 1. a\n- [ ] 2. b\n"})
        out = run("implement", state=st, repo=repo)
        subtasks = [a for a in out if a.kind == "subtask"]
        # One PR, one implementer: 0011 (the lower number) takes PR 48 and 0014 gets no second assignment.
        self.assertEqual([(a.header.get("rfc"), a.header.get("pr")) for a in subtasks], [("0011", 48)])
        self.assertIn("Update PR 48 with update_pr (it is the shared founding implementation PR", subtasks[0].body)
        self.assertNotIn("plan", [a.kind for a in out])  # no new plan PR for 0011

    def test_founding_work_moves_to_the_lowest_founding_pr(self):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="diagnostic-style", status="implementing"),
                       "0014": rfc("0014", DESIGNERS[1], slug="lexical-syntax-v3", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0004", "status": "open", "subtask": 1, "branch": "agent/impl-0004"},
                      "48": {"number": 48, "rfc": "0014", "status": "open", "subtask": 1, "branch": "agent/impl-0014"}}}
        repo = FakeRepo(files={"rfcs/0004.plan.md": "- [x] 1. a\n", "rfcs/0014.plan.md": "- [ ] 1. a\n"})
        out = [a for a in run("implement", state=st, repo=repo) if a.kind == "subtask"]
        self.assertEqual([(a.header.get("rfc"), a.header.get("pr")) for a in out], [("0014", 30)])

    def test_blocked_plan_line_yields_the_shared_pr(self):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="diagnostic-style", status="implementing"),
                       "0014": rfc("0014", DESIGNERS[1], slug="lexical-syntax-v3", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0004", "status": "open", "subtask": 1, "branch": "agent/impl-0004"}}}
        repo = FakeRepo(files={"rfcs/0004.plan.md": "- [x] 1. a\n- [ ] 2. BLOCKED on a lexer.\n",
                               "rfcs/0014.plan.md": "- [ ] 1. lexer\n"})
        out = [a for a in run("implement", state=st, repo=repo) if a.kind == "subtask"]
        self.assertEqual([(a.header.get("rfc"), a.header.get("pr")) for a in out], [("0014", 30)])

    def test_rfcs_sharing_a_pr_take_turns_by_cycle(self):
        st = {"rfcs": {"0011": rfc("0011", DESIGNERS[0], slug="name-v2", status="implementing"),
                       "0014": rfc("0014", DESIGNERS[1], slug="lexical-syntax-v3", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0011", "status": "open", "subtask": 1, "branch": "agent/x"}}}
        repo = FakeRepo(files={"rfcs/0011.plan.md": "- [ ] 1. a\n", "rfcs/0014.plan.md": "- [ ] 1. b\n"})
        picks = []
        for cycles in (0, 1, 2):
            ev = [{"type": "cycle_started", "subject": {}, "data": {}}] * cycles
            out = [a for a in run("implement", state=st, repo=repo, events=ev) if a.kind == "subtask"]
            picks.append(out[0].header.get("rfc"))
        self.assertEqual(picks, ["0011", "0014", "0011"])

    def test_shared_pr_builds_before_it_is_fixed(self):
        st = {"rfcs": {"0011": rfc("0011", DESIGNERS[0], slug="name-v2", status="implementing"),
                       "0014": rfc("0014", DESIGNERS[1], slug="lexical-syntax-v3", status="implementing")},
              "prs": {"48": {"number": 48, "rfc": "0014", "status": "open", "subtask": 1,
                             "branch": "agent/impl-0014", "head_sha": "abc"}}}
        events = [{"type": "check_run", "subject": {"pr": "48"},
                   "data": {"sha": "abc", "rules": {"5": {"ok": False, "detail": "no tests"}}}}]
        repo = FakeRepo(files={"rfcs/0011.plan.md": "- [x] 1. a\n",
                               "rfcs/0014.plan.md": "- [x] 1. a\n- [ ] 2. b\n"})
        out = [a for a in run("implement", state=st, repo=repo, events=events) if a.kind == "subtask"]
        self.assertEqual([(a.header.get("rfc"), a.header.get("subtask")) for a in out], [("0014", 2)])
        self.assertNotIn("do not tick another plan line", out[0].body)

    def test_implement_respects_max_implementing(self):
        st = {"rfcs": {f"{i:04d}": rfc(f"{i:04d}", DESIGNERS[0], status="accepted") for i in range(1, 6)}}
        self.assertLessEqual(len(run("implement", state=st)), 3)

    def test_review_respects_gated_pr_cap(self):
        prs = {str(i): {"status": "open", "head_sha": f"s{i}", "branch": f"b{i}", "class": "language"}
               for i in range(1, 5)}
        events = [{"type": "check_run", "subject": {"pr": str(i)}, "data": {"sha": f"s{i}", "rules": {"r": {"ok": True}}}}
                  for i in range(1, 5)]
        asgs = run("review", state={"prs": prs}, events=events)
        self.assertEqual(len(asgs), 1)
        self.assertEqual(len(asgs[0].header["prs"]), 2)

    def test_review_scheduled_while_only_rule_14_fails(self):
        prs = {"1": {"status": "open", "head_sha": "s1", "branch": "b1", "class": "language"}}
        events = [{"type": "check_run", "subject": {"pr": "1"},
                   "data": {"sha": "s1", "rules": {"5": {"ok": True}, "14": {"ok": False}}}}]
        self.assertEqual(len(run("review", state={"prs": prs}, events=events)), 1)
        events[0]["data"]["rules"]["5"]["ok"] = False
        self.assertEqual(run("review", state={"prs": prs}, events=events), [])


class Blindness(unittest.TestCase):
    def test_user_agent_never_sees_rfc_text(self):
        repo = FakeRepo(files={"spec/card.md": "CARD", "rfcs/0002-lexical-syntax.md": "SECRET RFC BODY"})
        st = {"rfcs": {"0002": rfc("0002", DESIGNERS[0], status="voting")}}
        for a in run("use", state=st, repo=repo):
            self.assertIn("CARD", a.body)
            self.assertNotIn("SECRET RFC BODY", a.body)
            self.assertNotIn("rfcs/", a.body)

    def test_users_vote_on_summary_and_examples_only(self):
        text = ("## Summary\nSUMMARY TEXT\n## Design\nSECRET RFC BODY\n"
                "## Examples\nEXAMPLE TEXT\n")
        repo = FakeRepo(files={"rfcs/0001-s0001.md": text})
        st = {"rfcs": {"0001": rfc("0001", DESIGNERS[0], status="voting")}}
        asgs = {a.agent: a for a in run("vote", state=st, repo=repo)}
        for u in USERS:
            self.assertIn(u, asgs)
            self.assertIn("t0001", asgs[u].body)
            self.assertIn("SUMMARY TEXT", asgs[u].body)
            self.assertIn("EXAMPLE TEXT", asgs[u].body)
            self.assertNotIn("SECRET RFC BODY", asgs[u].body)
        self.assertIn("SECRET RFC BODY", asgs["designer-prag"].body)


class Escalation(unittest.TestCase):
    def test_three_failures_route_to_author_and_weekly_architect(self):
        st = {"rfcs": {"0003": rfc("0003", DESIGNERS[1], status="implementing")},
              "prs": {"9": {"rfc": "0003", "status": "open", "subtask": 2, "subtask_failures": {"2": 3}}}}
        design = run("design", state=st)
        revise = [a for a in design if a.kind == "revise"]
        self.assertEqual([a.agent for a in revise], [DESIGNERS[1]])
        weekly = run("architect-weekly", state=st, run_date="2026-11-20")  # Friday, not Sunday
        self.assertEqual(len(weekly), 1)
        self.assertEqual(weekly[0].agent, "architect-weekly")
        self.assertIn("RFC 0003 subtask 2", weekly[0].body)

    def test_below_threshold_no_escalation(self):
        st = {"rfcs": {"0003": rfc("0003", DESIGNERS[1], status="implementing")},
              "prs": {"9": {"rfc": "0003", "status": "open", "subtask_failures": {"2": 2}}}}
        self.assertEqual([a for a in run("design", state=st) if a.kind == "revise"], [])
        self.assertEqual(run("architect-weekly", state=st, run_date="2026-11-20"), [])

    def test_weekly_architect_takes_at_most_three(self):
        st = {"rfcs": {f"{i:04d}": rfc(f"{i:04d}", DESIGNERS[0], status="implementing") for i in range(1, 6)},
              "escalations": [{"seq": i, "subject": {"pr": i},  # the shape state.py records
                               "data": {"kind": "subtask_stuck", "rfc": f"{i:04d}", "subtask": 1, "failures": 3}}
                              for i in range(1, 6)] + [
                  {"seq": 9, "subject": {}, "data": {"kind": "open_refused", "reason": "cap", "agent": "x"}}]}
        asgs = run("architect-weekly", state=st, run_date="2026-11-20")
        self.assertEqual(len(asgs[0].header["rfcs"]), 3)


class Determinism(unittest.TestCase):
    def test_same_state_same_bytes(self):
        st = {"rfcs": {"0001": rfc("0001", DESIGNERS[0], status="voting")}}
        outs = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as d:
                asgs = run("vote", state=st, repo=FakeRepo({"rfcs/0001-s0001.md": "body"}))
                o.write(Path(d), asgs, "2026-11-19", 1)
                outs.append({p.name: p.read_bytes() for p in sorted(Path(d).iterdir())})
        self.assertEqual(outs[0], outs[1])

    def test_run_id_keeps_same_day_sessions_apart(self):
        st = {"rfcs": {"0001": rfc("0001", DESIGNERS[0], status="voting")}}
        asgs = run("vote", state=st, repo=FakeRepo({"rfcs/0001-s0001.md": "body"}))
        sessions = []
        for env in ({}, {"GLYPH_RUN": "7"}):
            with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, env):
                os.environ.pop("GLYPH_RUN", None) if not env else None
                o.write(Path(d), asgs, "2026-11-19", 2)
                sessions.append(json.loads((Path(d) / "assignments.json").read_text())[0]["session"])
        self.assertTrue(sessions[0].startswith("2026-11-19/c2/vote/"))
        self.assertTrue(sessions[1].startswith("2026-11-19/r7/c2/vote/"))
        from tools.lib.audit import cycle_id  # the merge bot's prefix must match the agents'
        with mock.patch.dict(os.environ, {"GLYPH_RUN": "7"}):
            self.assertTrue(sessions[1].startswith(cycle_id("2026-11-19", 2) + "/"))

    def test_m0_plans_nothing(self):
        self.assertEqual(run("design", rules=dict(M2, milestone="M0")), [])


class SimRepo:
    """The base branch and the branches as files, standing in for git. Read-only to the planner."""
    base = "main"

    def __init__(self, main):
        self.main = dict(main)
        self.branches = {}  # branch -> {path: text} for the files that branch changes

    def read(self, rel):
        return self.main.get(rel)

    def read_ref(self, branch, rel):
        return self.branches.get(branch, {}).get(rel, self.main.get(rel))

    def list(self, rel):
        return sorted(k for k in self.main if k.startswith(rel + "/"))

    def diff(self, branch):
        return None if branch not in self.branches else "\n".join(f"+ {k}" for k in sorted(self.branches[branch]))


class NightSim:
    """One M1 night: cycles c0 to c5, the real planner and scripted agents, events in a temp audit log.

    Agents act only through their actions.json, which the sim validates against the schema and turns
    into events shaped like tools/publisher.py. The merge bot and the gate are sim steps.
    """
    RUN_DATE = "2026-11-19"

    def __init__(self, root):
        self.root = root
        self.repo = SimRepo({})
        self.rules = R.load_rules(root)
        self.tick = 0
        self.pr_no = 100
        self.issue_no = 0
        self.sha_no = 0

    def st(self):
        return S.load_state(self.root)

    def emit(self, *, type, actor, session, subject, data):
        self.tick += 1
        ts = f"{self.RUN_DATE}T10:{self.tick // 60:02d}:{self.tick % 60:02d}Z"
        return audit.append_event(self.root, type=type, actor=actor, session=session,
                                  subject=subject, data=data, ts=ts)

    def sha(self):
        self.sha_no += 1
        return f"sha{self.sha_no:03d}"

    def new_pr(self):
        self.pr_no += 1
        return self.pr_no

    # agent actions -> events, shaped like tools/publisher.py handlers
    def apply(self, entry, out):
        doc = json.loads((out / "actions.json").read_text(encoding="utf-8"))
        jsonschema.validate(doc, ACTIONS)
        for a in doc["actions"]:
            getattr(self, "act_" + a["type"])(entry["agent"], entry["session"], a, out)

    def act_open_rfc(self, agent, session, a, out):
        st = self.st()
        n = f"{max([int(k) for k in st['rfcs']] or [0]) + 1:04d}"
        branch = f"agent/rfc-{n}"
        self.repo.branches[branch] = {f"rfcs/{n}-{a['slug']}.md": (out / "files" / a["file"]).read_text(encoding="utf-8")}
        pr = self.new_pr()
        self.emit(type="rfc_opened", actor=agent, session=session, subject={"rfc": n},
                  data={"title": a["title"], "slug": a["slug"], "author": agent, "class": a["class"],
                        "pr": pr, "branch": branch})

    def act_comment(self, agent, session, a, out):
        t = a["target"]
        subject = {"rfc": t["rfc"]} if "rfc" in t else {"pr": t["pr"]} if "pr" in t else {"issue": t["issue"]}
        self.emit(type="comment_posted", actor=agent, session=session, subject=subject, data={"body": a["body"]})

    def act_vote(self, agent, session, a, out):
        self.emit(type="vote_cast", actor=agent, session=session, subject={"rfc": a["rfc"]},
                  data={"vote": a["vote"], "rationale": a["rationale"]})

    def act_open_pr(self, agent, session, a, out):
        st = self.st()
        changed = {p: (out / "files" / p).read_text(encoding="utf-8") for p in a["files"]}
        branch = f"agent/impl-{a['rfc']}"
        open_on_branch = [k for k, p in st["prs"].items() if p["branch"] == branch and p["status"] == "open"]
        if open_on_branch:  # one open PR per branch: accumulate, as the publisher does
            pr = int(open_on_branch[0])
            self.repo.branches[branch].update(changed)
            self.emit(type="pr_updated", actor=agent, session=session, subject={"pr": pr},
                      data={"head_sha": self.sha(), "files": sorted(changed)})
            return
        pr = self.new_pr()
        self.repo.branches[branch] = dict(changed)
        self.emit(type="pr_opened", actor=agent, session=session, subject={"pr": pr},
                  data={"branch": branch, "class": a["class"], "rfc": a["rfc"], "author": agent,
                        "subtask": a.get("subtask"), "head_sha": self.sha()})

    def act_update_pr(self, agent, session, a, out):
        pr = a["pr"]
        branch = self.st()["prs"][str(pr)]["branch"]
        self.repo.branches[branch].update({p: (out / "files" / p).read_text(encoding="utf-8") for p in a["files"]})
        self.emit(type="pr_updated", actor=agent, session=session, subject={"pr": pr},
                  data={"head_sha": self.sha(), "files": sorted(a["files"])})

    def act_review(self, agent, session, a, out):
        head = self.st()["prs"][str(a["pr"])]["head_sha"]
        self.emit(type="review_posted", actor=agent, session=session, subject={"pr": a["pr"]},
                  data={"verdict": a["verdict"], "sha": head, "body": a["body"]})

    def act_open_issue(self, agent, session, a, out):
        self.issue_no += 1
        self.emit(type="issue_opened", actor=agent, session=session, subject={"issue": self.issue_no},
                  data={"title": a["title"], "author": agent, "body": a["body"]})

    def act_digest(self, agent, session, a, out):
        self.emit(type="digest_published", actor=agent, session=session, subject={},
                  data={"title": a["title"], "body": a["body"]})

    # planner -> agents, then the sim's merge bot and gate
    def phase(self, cycle, phase):
        asgs = o.plan(phase, state=self.st(), rules=self.rules, roster=ROSTER, repo=self.repo,
                      run_date=self.RUN_DATE, events=audit.load_events(self.root))
        work = Path(tempfile.mkdtemp(dir=self.scratch))
        o.write(work, asgs, self.RUN_DATE, cycle)
        for entry in json.loads((work / "assignments.json").read_text(encoding="utf-8")):
            out = work / "out" / entry["agent"]
            scripted_agent.main([entry["agent"], str(work / entry["file"]), str(out)])
            self.apply(entry, out)

    def set_status(self, n, to):
        rec = self.st()["rfcs"][n]
        if to == "voting" and S.cycles_since(self.st(), rec) < int(self.rules["discussion_min_cycles"]):
            raise AssertionError(f"RFC {n} went to voting before discussion_min_cycles")
        self.emit(type="rfc_status", actor="merge-bot", session=f"{self.RUN_DATE}/merge-bot",
                  subject={"rfc": n}, data={"to": to})

    def gate(self, pr):
        head = self.st()["prs"][str(pr)]["head_sha"]
        self.emit(type="check_run", actor="gate", session=f"{self.RUN_DATE}/gate",
                  subject={"pr": pr}, data={"sha": head, "rules": {"spec": {"ok": True}, "tests": {"ok": True}}})

    def merge_pr(self, pr, rfc_implemented=False):
        self.repo.main.update(self.repo.branches[self.st()["prs"][str(pr)]["branch"]])
        self.emit(type="merged", actor="merge-bot", session=f"{self.RUN_DATE}/merge-bot", subject={"pr": pr},
                  data={"rfc_implemented": rfc_implemented, "spec_after": self.repo.main["spec/VERSION"].strip()})

    def decide(self, n):
        st = self.st()
        rec = st["rfcs"][n]
        voters = {a: v for a, v in rec["votes"].items() if a != rec["author"]}
        approve = sum(v["vote"] == "approve" for v in voters.values())
        decisive = sum(v["vote"] in ("approve", "reject") for v in voters.values())
        ok = (len(voters) >= int(self.rules["quorum"]) and decisive
              and approve / decisive >= float(self.rules["accept_ratio"]))
        self.emit(type="rfc_decided", actor="merge-bot", session=f"{self.RUN_DATE}/merge-bot",
                  subject={"rfc": n}, data={"outcome": "accepted" if ok else "rejected"})
        if ok:
            self.repo.main.update(self.repo.branches[rec["branch"]])
        return ok

    def cycle(self, c):
        self.emit(type="cycle_started", actor="orchestrator", session=f"{self.RUN_DATE}/c{c}",
                  subject={}, data={"cycle": f"{self.RUN_DATE}/c{c}"})
        if c == 0:
            self.phase(c, "architect")
        elif c == 1:
            self.phase(c, "design")
        elif c == 2:
            self.phase(c, "design")
            self.phase(c, "architect")
        elif c == 3:
            self.set_status("0001", "voting")
            self.phase(c, "vote")
            self.decide("0001")
            self.phase(c, "implement")  # the plan PR
            self.gate(self.pr_no)
            self.phase(c, "review")
            self.merge_pr(self.pr_no)
        elif c == 4:
            self.set_status("0001", "implementing")
            self.phase(c, "implement")  # subtask 1 opens the implementation PR
            self.gate(self.pr_no)
            self.phase(c, "review")
        elif c == 5:
            self.phase(c, "implement")  # subtask 2 updates the same PR
            self.gate(self.pr_no)
            self.phase(c, "review")
            self.merge_pr(self.pr_no, rfc_implemented=True)
            self.phase(c, "use")
            self.phase(c, "scribe")

    def night(self):
        with tempfile.TemporaryDirectory() as scratch:
            self.scratch = scratch
            self.repo = SimRepo({"spec/VERSION": "0.0.0\n"})
            for c in range(6):
                self.cycle(c)


class NightSimTest(unittest.TestCase):
    def test_m1_night_runs_end_to_end_offline(self):
        with tempfile.TemporaryDirectory() as root_s:
            root = Path(root_s)
            (root / "governance").mkdir()
            (root / "governance" / "RULES.md").write_text((REPO / "governance" / "RULES.md").read_text(encoding="utf-8"),
                                                          encoding="utf-8")
            sim = NightSim(root)
            sim.rules = dict(sim.rules, milestone="M1")
            sim.night()
            ev = audit.load_events(root)
            ok, bad = audit.verify_chain(root)
            self.assertTrue(ok, f"hash chain broken at seq {bad}")

            def of(t):
                return [e for e in ev if e["type"] == t]

            self.assertEqual(len(of("rfc_opened")), 1)
            self.assertEqual(of("rfc_opened")[0]["actor"], "designer-min")
            decided = of("rfc_decided")
            self.assertEqual([e["data"]["outcome"] for e in decided], ["accepted"])
            approves = {e["actor"] for e in of("vote_cast") if e["data"]["vote"] == "approve"
                        and e["actor"] != "designer-min"}
            self.assertGreaterEqual(len(approves), 5)
            self.assertTrue({"user-1", "user-2"} <= approves)

            subtask_prs = {e["subject"]["pr"] for e in of("pr_opened") if e["data"]["subtask"] is not None}
            self.assertEqual(len(subtask_prs), 1, "both subtasks must share one implementation PR")
            (pr,) = subtask_prs
            updates = [e for e in of("pr_updated") if e["subject"]["pr"] == pr]
            self.assertEqual(len(updates), 1, "subtask 2 must update the open PR, not open another")
            plan_prs = {e["subject"]["pr"] for e in of("pr_opened") if e["data"]["subtask"] is None}
            reviews = {(e["subject"]["pr"], e["actor"], e["data"]["verdict"]) for e in of("review_posted")}
            self.assertIn((pr, "reviewer", "approve"), reviews)
            self.assertTrue(all((p, "reviewer", "approve") in reviews for p in plan_prs))
            self.assertEqual({e["actor"] for e in of("issue_opened")}, {"user-1", "user-2"})
            self.assertTrue(any(e["actor"] == "scribe" for e in of("digest_published")))
            self.assertTrue(any(e["actor"] == "architect" for e in of("comment_posted")))
            self.assertTrue(any(e["actor"] == "tester" for e in of("comment_posted")))
            st = S.load_state(root)
            self.assertEqual(st["rfcs"]["0001"]["status"], "implemented")
            self.assertEqual(st["prs"][str(pr)]["status"], "merged")
            self.assertEqual(st["spec_version"], "0.1.0")


class SharedPrAndBriefs(unittest.TestCase):
    PLAN = "- [x] 1. a\n- [ ] 2. b\n"
    TESTER = next(a["id"] for a in ROSTER if a["role"] == "tester")

    def state(self, rules_failed, noops=None):
        st = {"rfcs": {"0004": rfc("0004", DESIGNERS[0], slug="kernel", status="implementing")},
              "prs": {"30": {"number": 30, "rfc": "0004", "status": "open", "subtask": 1,
                             "branch": "agent/impl-0004", "head_sha": "abc"}}}
        if noops is not None:
            st["noops"] = noops
        rules = {"1": {"ok": True, "detail": ""}}
        rules.update({k: {"ok": False, "detail": "missing"} for k in rules_failed})
        check = {"type": "check_run", "subject": {"pr": 30}, "data": {"sha": "abc", "rules": rules}}
        return st, check

    def repo(self):
        return FakeRepo(refs={"agent/impl-0004": {"rfcs/0004.plan.md": self.PLAN}})

    def subtasks(self, st, events, repo=None):
        return [x for x in run("implement", state=st, repo=repo or self.repo(), events=events) if x.kind == "subtask"]

    def test_shared_pr_gets_an_early_merge_turn(self):
        st, check = self.state({"3"})
        odd = [{"type": "cycle_started", "subject": {}, "data": {"cycle": "c1"}}]
        a = self.subtasks(st, [check] + odd)[0]
        self.assertIn("merge early", a.body)
        self.assertIn("rule 3: missing", a.body)
        self.assertNotIn("Implement subtask 2", a.body)
        even = self.subtasks(st, [check] + odd * 2)[0]
        self.assertIn("Implement subtask 2", even.body)
        self.assertNotIn("merge early", even.body)

    def test_early_merge_covers_a_missing_grammar(self):
        st, check = self.state({"3", "5", "10"})
        odd = [{"type": "cycle_started", "subject": {}, "data": {"cycle": "c1"}}]
        self.assertIn("spec/grammar.peg", self.subtasks(st, [check] + odd)[0].body)

    def test_early_merge_needs_a_failure_only_in_rules_3_and_5(self):
        st, check = self.state({"3", "2"})
        odd = [{"type": "cycle_started", "subject": {}, "data": {"cycle": "c1"}}]
        a = self.subtasks(st, [check] + odd)[0]
        self.assertNotIn("merge early", a.body)
        self.assertIn("Implement subtask 2", a.body)

    def test_escalated_shared_pr_gets_the_early_merge_on_every_turn(self):
        st, check = self.state({"3"})
        even = [{"type": "cycle_started", "subject": {}, "data": {"cycle": "c1"}}] * 2
        gate = {"type": "gate_blocked", "subject": {"pr": 30}, "data": {"pr": 30, "rule": 3, "subtask": None}}
        self.assertIn("Implement subtask 2", self.subtasks(st, [check] + even + [gate] * 2)[0].body)
        self.assertIn("merge early", self.subtasks(st, [check] + even + [gate] * 3)[0].body)

    def test_a_refused_update_is_quoted_in_the_next_brief(self):
        st, check = self.state({"3"})
        noop = {"type": "subtask_noop", "subject": {"rfc": "0004"},
                "data": {"rfc": "0004", "subtask": 2, "pr": 30, "refused": ["meta: 'rfc' is a required property"]}}
        self.assertIn("refused whole", self.subtasks(st, [check, noop])[0].body)
        self.assertIn("'rfc' is a required property", self.subtasks(st, [check, noop])[0].body)
        done = {"type": "pr_updated", "subject": {"pr": 30}, "data": {"files": ["a"]}}
        self.assertNotIn("refused whole", self.subtasks(st, [check, noop, done])[0].body)

    def test_tester_cases_are_in_the_implementer_brief(self):
        st, check = self.state(set())
        ev = [check, {"type": "comment_posted", "actor": self.TESTER, "subject": {"rfc": "0004"},
                      "data": {"body": "Case 1: 1+1 prints 2, exit 0."}}]
        a = self.subtasks(st, ev)[0]
        self.assertIn("## Tester's proposed conformance cases\nCase 1: 1+1 prints 2, exit 0.", a.body)
        other = ev + [{"type": "comment_posted", "actor": DESIGNERS[0], "subject": {"rfc": "0004"},
                       "data": {"body": "Designer chatter."}}]
        self.assertNotIn("Designer chatter.", self.subtasks(st, other)[0].body)
        long = ev[:1] + [{"type": "comment_posted", "actor": self.TESTER, "subject": {"rfc": "0004"},
                          "data": {"body": "x" * 9000}}]
        section = self.subtasks(st, long)[0].body.split("## Tester's proposed conformance cases\n")[1]
        self.assertLessEqual(len(section.rstrip("\n")), o.TESTER_CAP)

    def test_subtask_with_noop_sessions_is_skipped_and_escalated(self):
        st, check = self.state(set(), noops={"0004:2": 3})
        st["prs"] = {}  # no shared PR: the plan comes from the base branch
        repo = FakeRepo(files={"rfcs/0004.plan.md": self.PLAN})
        self.assertEqual(self.subtasks(st, [], repo=repo), [])
        revise = [a for a in run("design", state=st, repo=repo) if a.kind == "revise"]
        self.assertEqual(len(revise), 1)
        self.assertIn("3 sessions made no change", revise[0].body)
        st["noops"] = {"0004:2": 2}
        self.assertEqual(len(self.subtasks(st, [], repo=repo)), 1)

    def test_scribe_digest_lines_carry_event_data(self):
        ev = [{"seq": 1, "ts": "t", "type": "vote_cast", "actor": "a", "subject": {"rfc": "0004"},
               "data": {"vote": "approve", "zlong": "x" * 500}}]
        line = [ln for ln in run("scribe", state={}, events=ev)[0].body.splitlines() if ln.startswith("- 1 ")][0]
        self.assertIn('"vote":"approve"', line)
        self.assertNotIn("x" * 201, line)

    def test_architect_brief_lists_open_user_issues(self):
        st = {"rfcs": {}, "issues": {"5": {"number": 5, "title": "Brackets confuse me", "status": "open"}}}
        body = run("architect", state=st)[0].body
        self.assertIn("## Open user issues\n- #5 Brackets confuse me", body)


if __name__ == "__main__":
    unittest.main()
