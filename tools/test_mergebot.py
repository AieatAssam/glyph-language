"""Voting, gate rules, cooldown, and the mergebot commands run against temp git repos (dry mode)."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import mergebot as MB
from tools.lib import audit, rfc as F, roster as RO, rules as R
from tools.lib import state as S

REPO = Path(__file__).resolve().parents[1]
RULES = R.load_rules(REPO)
ROSTER = RO.load_roster(REPO)
VOTERS = RO.voters(ROSTER)  # designer-min, designer-prag, designer-safe, impl-1, tester, user-1, user-2


def vote_rec(author, votes, alters=False, breaking=False):
    return {"author": author, "votes": {a: {"vote": v, "rationale": ""} for a, v in votes.items()},
            "alters_tests": alters, "breaking": breaking}


class VotingTests(unittest.TestCase):
    def test_quorum_needs_five_cast_votes(self):
        rec = vote_rec("designer-min", {"impl-1": "approve", "tester": "approve",
                                        "user-1": "approve", "user-2": "approve"})
        res = F.tally(rec, VOTERS, RULES)
        self.assertEqual(res["outcome"], "rejected")
        self.assertIn("no quorum", res["reason"])

    def test_author_votes_are_ignored(self):
        rec = vote_rec("designer-min", {"designer-min": "approve", "designer-prag": "approve",
                                        "impl-1": "approve", "tester": "approve", "user-1": "approve",
                                        "user-2": "approve"})
        res = F.tally(rec, VOTERS, RULES)
        self.assertEqual(res["ignored"], {"designer-min": "author"})
        self.assertEqual(res["outcome"], "accepted")

    def test_non_voters_are_ignored(self):
        rec = vote_rec("designer-min", {"reviewer": "reject", "scribe": "reject"})
        res = F.tally(rec, VOTERS, RULES)
        self.assertEqual(res["ignored"], {"reviewer": "not a voter", "scribe": "not a voter"})
        self.assertEqual(res["approve"] + res["reject"] + res["abstain"], 0)

    def test_abstentions_do_not_count_against_ratio(self):
        rec = vote_rec("designer-min", {"designer-prag": "approve", "impl-1": "approve",
                                        "tester": "approve", "user-1": "approve",
                                        "user-2": "abstain", "designer-safe": "abstain"})
        self.assertEqual(F.tally(rec, VOTERS, RULES)["outcome"], "accepted")

    def test_only_abstentions_rejected(self):
        rec = vote_rec("designer-min", {"designer-prag": "abstain", "impl-1": "abstain",
                                        "tester": "abstain", "user-1": "abstain", "user-2": "abstain"})
        res = F.tally(rec, VOTERS, RULES)
        self.assertEqual((res["outcome"], res["reason"]), ("rejected", "only abstentions"))

    def test_two_thirds_boundary_accepts(self):
        rec = vote_rec("designer-min", {"designer-prag": "approve", "impl-1": "approve",
                                        "tester": "approve", "user-1": "approve",
                                        "user-2": "reject", "designer-safe": "reject"})
        self.assertEqual(F.tally(rec, VOTERS, RULES)["outcome"], "accepted")

    def test_just_below_two_thirds_rejects(self):
        rec = vote_rec("designer-min", {"designer-prag": "approve", "impl-1": "approve",
                                        "tester": "approve", "user-1": "reject",
                                        "user-2": "reject"})
        self.assertEqual(F.tally(rec, VOTERS, RULES)["outcome"], "rejected")

    def test_supermajority_for_altered_tests(self):
        votes = {"designer-prag": "approve", "impl-1": "approve", "tester": "approve",
                 "user-1": "approve", "user-2": "reject", "designer-safe": "reject"}
        self.assertEqual(F.tally(vote_rec("designer-min", votes), VOTERS, RULES)["outcome"], "accepted")
        res = F.tally(vote_rec("designer-min", votes, alters=True), VOTERS, RULES)
        self.assertEqual(res["outcome"], "rejected")
        five = dict(votes, **{"user-2": "approve"})
        res = F.tally(vote_rec("designer-min", five, breaking=True), VOTERS, RULES)
        self.assertEqual(res["outcome"], "accepted")
        self.assertTrue(res["accepted_super"])


class CooldownAndCapTests(unittest.TestCase):
    def _state(self, cycles, status_cycle, status="rejected", slug="tuples"):
        st = S.empty_state()
        st["cycles"] = cycles
        st["rfcs"]["0003"] = {"number": "0003", "slug": slug, "status": status,
                              "status_cycle": status_cycle, "author": "designer-min"}
        return st

    def test_cooldown_blocks_for_ten_nights(self):
        days = [f"2026-11-{d:02d}/c1" for d in range(1, 15)]
        st = self._state(days, status_cycle=5)  # nights since: 9
        self.assertTrue(F.in_cooldown(st, "tuples", RULES))
        self.assertEqual(F.open_refusal(st, "designer-prag", "tuples", RULES), "resubmit cooldown in effect")

    def test_cooldown_clears_after_ten_nights(self):
        days = [f"2026-11-{d:02d}/c1" for d in range(1, 15)]
        st = self._state(days, status_cycle=3)  # nights since: 11
        self.assertFalse(F.in_cooldown(st, "tuples", RULES))
        self.assertIsNone(F.open_refusal(st, "designer-prag", "tuples", RULES))

    def test_other_slugs_are_not_blocked(self):
        st = self._state(["2026-11-01/c1"], status_cycle=0)
        self.assertFalse(F.in_cooldown(st, "other", RULES))

    def test_max_open_rfcs_refuses_sixth(self):
        st = S.empty_state()
        for i in range(5):
            st["rfcs"][f"{i:04d}"] = {"number": f"{i:04d}", "slug": f"s{i}", "status": "discussion",
                                      "author": f"designer-{i}"}
        self.assertIn("max_open_rfcs", F.open_refusal(st, "designer-new", "fresh", RULES))

    def test_per_designer_cap(self):
        st = S.empty_state()
        for i in range(2):
            st["rfcs"][f"{i:04d}"] = {"number": f"{i:04d}", "slug": f"s{i}", "status": "voting",
                                      "author": "designer-min"}
        self.assertIn("per_designer", F.open_refusal(st, "designer-min", "fresh", RULES))


class GateTests(unittest.TestCase):
    def _pr(self, **over):
        pr = {"class": "bugfix", "role": "implementer", "rfc_present": False, "rfc_status": None,
              "rfc_accepted_super": False, "changed_files": ["compiler/stage0/x.ts"],
              "head_sha": "abc", "reviews": [{"agent": "reviewer", "verdict": "approve", "sha": "abc"}]}
        pr.update(over)
        return pr

    def _checks(self, **over):
        cr = {str(n): True for n in range(4, 12)}
        cr.update({k: v for k, v in over.items()})
        return cr

    def _run(self, pr=None, check_rules=None, **extra):
        ctx = {"pr": pr or self._pr(), "check_rules": check_rules or self._checks()}
        ctx.update(extra)
        return {r["rule"]: r for r in R.evaluate_gate(ctx, RULES)}

    def test_clean_bugfix_passes_everything(self):
        res = self._run()
        self.assertTrue(all(r["ok"] for r in res.values()), res)

    def test_rule1_refuses_protected_and_wrong_role_paths(self):
        self.assertFalse(self._run(pr=self._pr(changed_files=["governance/RULES.md"]))[1]["ok"])
        self.assertFalse(self._run(pr=self._pr(role="reviewer", changed_files=["compiler/x.ts"]))[1]["ok"])
        self.assertFalse(self._run(pr=self._pr(role="implementer", changed_files=[]))[1]["ok"])

    def test_rule2_language_needs_accepted_rfc(self):
        pr = self._pr(**{"class": "language", "rfc_present": True, "rfc_status": "voting",
                         "changed_files": ["spec/a", "compiler/self/a", "conformance/a", "examples/a"]})
        self.assertFalse(self._run(pr=pr)[2]["ok"])
        pr["rfc_status"] = "implementing"
        self.assertTrue(self._run(pr=pr)[2]["ok"])

    def test_rule3_language_bundles_all_parts(self):
        pr = self._pr(**{"class": "language", "rfc_present": True, "rfc_status": "accepted",
                         "changed_files": ["spec/a", "compiler/self/a"]})
        self.assertFalse(self._run(pr=pr)[3]["ok"])

    def test_rule6_altered_test_needs_supermajority(self):
        res = self._run(tests_altered=True)
        self.assertFalse(res[6]["ok"])
        res = self._run(tests_altered=True, pr=self._pr(rfc_accepted_super=True))
        self.assertTrue(res[6]["ok"])

    def test_rules_4_to_11_come_from_check(self):
        cr = self._checks(**{"7": False})
        res = self._run(check_rules=cr)
        self.assertFalse(res[7]["ok"])
        self.assertTrue(res[8]["ok"])

    def test_rule14_needs_approval_on_head_sha(self):
        pr = self._pr(reviews=[{"agent": "reviewer", "verdict": "approve", "sha": "old"}])
        res = self._run(pr=pr)
        self.assertFalse(res[14]["ok"])

    def test_rule12_and_13_off_when_gates_off(self):
        res = self._run()
        self.assertTrue(res[12]["ok"])
        self.assertTrue(res[13]["ok"])

    def test_first_failure_is_lowest_rule(self):
        res = self._run(check_rules=self._checks(**{"5": False, "9": False}))
        self.assertEqual(R.first_failure(list(res.values()))["rule"], 5)

    def test_stability_window_after_self_hosting(self):
        stab = {"self_hosted": True, "last_breaking": "2026-11-15", "today": "2026-11-19"}
        pr = self._pr(**{"class": "language", "rfc_present": True, "rfc_status": "accepted",
                         "breaking": True,
                         "changed_files": ["spec/a", "compiler/self/a", "conformance/a", "examples/a"]})
        self.assertFalse(self._run(pr=pr, stability=stab)[2]["ok"])
        self.assertTrue(self._run(pr=pr, stability=dict(stab, today="2026-11-22"))[2]["ok"])
        self.assertTrue(self._run(pr=pr, stability=dict(stab, self_hosted=False))[2]["ok"])

    def test_owner_path_protection(self):
        self.assertTrue(R.is_protected("governance/roster.yml"))
        self.assertTrue(R.is_protected("tools/lib/audit.py"))
        self.assertFalse(R.is_protected("compiler/stage0/x.ts"))


GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"}


class RepoTestCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="glyph-mb-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.env = mock.patch.dict(os.environ, dict(
            GLYPH_DRY="1", RUN_DATE="2026-11-19", CYCLE="1", BASE_BRANCH="main", **GIT_ENV))
        self.env.start()
        self.addCleanup(self.env.stop)
        self.git("init", "-b", "main")
        (self.root / "governance").mkdir()
        for name in ("RULES.md", "roster.yml"):
            shutil.copy(REPO / "governance" / name, self.root / "governance" / name)
        (self.root / "audit").mkdir()
        (self.root / "audit" / ".keep").write_text("", encoding="utf-8")
        self.commit("base", ["governance", "audit"])

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    def commit(self, msg, paths=None):
        self.git("add", "-A")
        self.git("commit", "-m", msg, "--allow-empty")
        return self.git("rev-parse", "HEAD")

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def emit(self, type, subject, data, actor, idem=None):
        return audit.append_event(self.root, type=type, actor=actor, session="s",
                                  subject=subject, data=data, ts="2026-11-19T09:00:00Z", idem=idem)

    def cycles(self, n):
        for i in range(n):
            self.emit("cycle_started", {}, {"cycle": f"2026-11-1{i}/c1"}, "mergebot")


class MergebotRepoTests(RepoTestCase):
    def test_open_records_owner_change_once(self):
        self.write("governance/RULES.md", (self.root / "governance" / "RULES.md").read_text() + "\n")
        self.commit("owner edits rules")
        first = MB.cmd_open(self.root)
        self.assertEqual(first["owner_events"], 1)
        types = [e["type"] for e in audit.load_events(self.root)]
        self.assertIn("rules_changed", types)
        self.assertIn("cycle_started", types)
        MB.cmd_open(self.root)
        types = [e["type"] for e in audit.load_events(self.root)]
        self.assertEqual(types.count("rules_changed"), 1)
        self.assertEqual(types.count("cycle_started"), 1)

    def test_bot_commits_are_not_owner_events(self):
        self.write("governance/roster.yml", "agents: []\n")
        self.commit("Audit: roster touch\n\nBot: mergebot")
        self.assertEqual(MB.cmd_open(self.root)["owner_events"], 0)

    def test_night_open_records_no_cycle(self):
        MB.cmd_open(self.root, night=True)
        self.assertNotIn("cycle_started", [e["type"] for e in audit.load_events(self.root)])

    def test_bootstrap_installs_bytes_and_records_hash(self):
        wasm = self.root / "built.wasm"
        wasm.write_bytes(b"\0asm\x01\0\0\0")
        out = MB.cmd_bootstrap(self.root, str(wasm))
        self.assertEqual((self.root / "compiler" / "bootstrap" / "glyphc.wasm").read_bytes(),
                         wasm.read_bytes())
        releases = [e for e in audit.load_events(self.root) if e["type"] == "release"]
        self.assertEqual(releases[-1]["data"]["sha256"], out["sha256"])

    def test_ingest_is_idempotent(self):
        pub = self.root / "pub"
        pub.mkdir()
        line = {"ts": "2026-11-19T10:00:00Z", "type": "rfc_opened", "actor": "designer-min",
                "session": "2026-11-19/c1/design/designer-min", "subject": {"rfc": "0001"},
                "data": {"title": "T", "slug": "t", "author": "designer-min", "class": "language",
                         "pr": 11, "branch": "agent/rfc-0001"}, "idem": "s#0"}
        (pub / "events.jsonl").write_text(json.dumps(line) + "\n", encoding="utf-8")
        self.assertEqual(MB.cmd_ingest(self.root, [str(pub)])["appended"], 1)
        self.assertEqual(MB.cmd_ingest(self.root, [str(pub)])["appended"], 0)
        self.assertEqual(S.load_state(self.root)["rfcs"]["0001"]["status"], "discussion")

    def test_ingest_refuses_over_cap_and_escalates(self):
        for i in range(5):
            self.emit("rfc_opened", {"rfc": f"{i + 1:04d}"},
                      {"title": f"x{i}", "slug": f"x{i}", "author": f"designer-{i}", "class": "language"},
                      f"designer-{i}")
        pub = self.root / "pub"
        pub.mkdir()
        line = {"ts": "2026-11-19T10:00:00Z", "type": "rfc_opened", "actor": "designer-min",
                "session": "s", "subject": {"rfc": "0006"},
                "data": {"title": "T", "slug": "t", "author": "designer-min", "class": "language",
                         "pr": 12}, "idem": "s#1"}
        (pub / "events.jsonl").write_text(json.dumps(line) + "\n", encoding="utf-8")
        out = MB.cmd_ingest(self.root, [str(pub)])
        self.assertEqual(out["refused"], 1)
        st = S.load_state(self.root)
        self.assertNotIn("0006", st["rfcs"])
        self.assertEqual(st["escalations"][-1]["data"]["kind"], "open_refused")

    def test_decide_moves_to_voting_then_accepts_and_writes_record(self):
        self.emit("rfc_opened", {"rfc": "0001"},
                  {"title": "T", "slug": "t", "author": "designer-min", "class": "language"},
                  "designer-min")
        self.cycles(2)
        MB.cmd_decide(self.root)
        self.assertEqual(S.load_state(self.root)["rfcs"]["0001"]["status"], "voting")
        self.cycles(1)
        for a in ("designer-min", "designer-prag", "impl-1", "tester", "user-1", "user-2"):
            self.emit("vote_cast", {"rfc": "0001"}, {"vote": "approve", "rationale": "ok"}, a)
        out = MB.cmd_decide(self.root)
        self.assertEqual(out["decided"], [("0001", "accepted")])
        st = S.load_state(self.root)
        self.assertEqual(st["rfcs"]["0001"]["status"], "implementing")
        self.assertTrue((self.root / "rfcs" / "0001-t.md").exists())
        record = (self.root / "audit" / "decisions" / "0001.md").read_text(encoding="utf-8")
        self.assertIn("outcome: accepted", record)
        self.assertIn("- designer-prag: approve", record)
        self.assertIn("## Ignored", record)
        self.assertIn("designer-min: author", record)

    def test_merge_passes_gate_and_squashes(self):
        self.git("checkout", "-b", "agent/impl-0002")
        self.write("compiler/stage0/fix.ts", "export const x = 1;\n")
        head = self.commit("fix")
        self.git("checkout", "main")
        self.emit("pr_opened", {"pr": 2},
                  {"branch": "agent/impl-0002", "class": "bugfix", "rfc": None, "author": "impl-1",
                   "head_sha": head}, "impl-1")
        self.emit("review_posted", {"pr": 2}, {"verdict": "approve", "sha": head}, "reviewer")
        base = self.git("rev-parse", "main")
        checks = self.root / "checks"
        checks.mkdir()
        rules = {str(n): {"ok": True, "detail": ""} for n in range(4, 12)}
        (checks / "2.json").write_text(json.dumps({"pr": 2, "sha": head, "base_sha": base,
                                                   "rules": rules}), encoding="utf-8")
        out = MB.cmd_merge(self.root, checks)
        self.assertEqual(out["merged"], 2)
        self.assertEqual((self.root / "spec" / "VERSION").read_text().strip(), "0.0.1")
        msg = self.git("log", "--format=%B", "--grep", "Merge PR #2")
        self.assertIn("Bot: mergebot", msg)
        self.assertIn("Check-Sha: " + head, msg)
        self.assertEqual(S.load_state(self.root)["prs"]["2"]["status"], "merged")

    def test_merge_blocks_without_approval(self):
        self.git("checkout", "-b", "agent/impl-0003")
        self.write("compiler/stage0/fix.ts", "y\n")
        head = self.commit("fix")
        self.git("checkout", "main")
        self.emit("pr_opened", {"pr": 3},
                  {"branch": "agent/impl-0003", "class": "bugfix", "rfc": None, "author": "impl-1",
                   "head_sha": head}, "impl-1")
        base = self.git("rev-parse", "main")
        checks = self.root / "checks"
        checks.mkdir()
        rules = {str(n): {"ok": True, "detail": ""} for n in range(4, 12)}
        (checks / "3.json").write_text(json.dumps({"pr": 3, "sha": head, "base_sha": base,
                                                   "rules": rules}), encoding="utf-8")
        out = MB.cmd_merge(self.root, checks)
        self.assertIsNone(out["merged"])
        blocked = [e for e in audit.load_events(self.root) if e["type"] == "gate_blocked"]
        self.assertEqual(blocked[-1]["data"]["rule"], 14)

    def test_stale_check_is_skipped(self):
        self.git("checkout", "-b", "agent/impl-0004")
        self.write("compiler/stage0/fix.ts", "z\n")
        head = self.commit("fix")
        self.git("checkout", "main")
        self.emit("pr_opened", {"pr": 4},
                  {"branch": "agent/impl-0004", "class": "bugfix", "rfc": None, "author": "impl-1",
                   "head_sha": head}, "impl-1")
        self.emit("review_posted", {"pr": 4}, {"verdict": "approve", "sha": head}, "reviewer")
        old_base = self.git("rev-parse", "main")
        self.write("compiler/stage0/other.ts", "moved base\n")
        self.commit("base moved")
        checks = self.root / "checks"
        checks.mkdir()
        rules = {str(n): {"ok": True, "detail": ""} for n in range(4, 12)}
        (checks / "4.json").write_text(json.dumps({"pr": 4, "sha": head, "base_sha": old_base,
                                                   "rules": rules}), encoding="utf-8")
        self.assertIsNone(MB.cmd_merge(self.root, checks)["merged"])

    def test_close_writes_daily_and_tags(self):
        self.emit("digest_published", {}, {"title": "Day", "body": "things happened"}, "scribe")
        out = MB.cmd_close(self.root)
        self.assertTrue(Path(out["daily"]).exists())
        self.assertIn("things happened", Path(out["daily"]).read_text())
        self.assertEqual(out["tag"], "audit-2026-11-19")
        self.assertEqual(self.git("tag", "-l", "audit-2026-11-19"), "audit-2026-11-19")

    def test_verify_reports_tamper(self):
        self.emit("cycle_started", {}, {"cycle": "2026-11-19/c1"}, "mergebot")
        self.emit("cycle_started", {}, {"cycle": "2026-11-19/c2"}, "mergebot")
        self.assertTrue(MB.cmd_verify(self.root)["ok"])
        log = self.root / "audit" / "events.jsonl"
        log.write_text(log.read_text().replace("c2", "c9"), encoding="utf-8")
        self.assertFalse(MB.cmd_verify(self.root)["ok"])


if __name__ == "__main__":
    unittest.main()
