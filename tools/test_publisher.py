"""Tests for tools/publisher.py. Dry mode only: no gh, no git push.

Run: cd /Users/aieat/git/glyph-language && python3 -m unittest tools.test_publisher
"""
import contextlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
from pathlib import Path

os.environ["GLYPH_DRY"] = "1"

from tools import publisher as P  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
FIX = REPO / "tools" / "fixtures" / "publisher" / "sessions"
TS = "2026-11-19T15:00:00Z"
SESSION_ID = "2026-11-19/c014/work/{}"

OPEN_PR = {"type": "open_pr", "title": "Add strings", "class": "stdlib",
           "body": "Adds strings.", "files": ["stdlib/strings.glyph"]}
STRINGS = {"stdlib/strings.glyph": "fn upper(s) { s }\n"}
COMMENT = {"type": "comment", "target": {"pr": 3}, "body": "Looks fine."}


def voting_state():
    return {"rfcs": {"0007": {"number": "0007", "slug": "pipes", "author": "user-1",
                              "status": "voting", "votes": {}}}}


def conf(id_):
    return ("--- meta\nid: " + id_ + "\nrfc: 0004\nkind: run\n--- source\n"
            "fn main() { print(1 + 2) }\n--- stdin\n\n--- expect-stdout\n3\n--- expect-exit\n0\n")


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="pub-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = self.tmp / "root"
        self.root.mkdir()
        shutil.copytree(REPO / "governance", self.root / "governance")  # no audit log: state is None

    def session(self, name, agent, actions, files=None, outcome="ok", memory="Short notes.\n"):
        sdir = self.tmp / "sessions" / name
        sdir.mkdir(parents=True)
        meta = {"agent": agent, "session": SESSION_ID.format(agent), "phase": "work",
                "outcome": outcome, "usage": {}, "started": TS, "ended": TS}
        (sdir / "session.json").write_text(json.dumps(meta), encoding="utf-8")
        body = actions if isinstance(actions, str) else json.dumps({"actions": actions})
        (sdir / "actions.json").write_text(body, encoding="utf-8")
        (sdir / "MEMORY.md").write_text(memory, encoding="utf-8")
        (sdir / "transcript.jsonl").write_text('{"role":"assistant"}\n', encoding="utf-8")
        for rel, data in (files or {}).items():
            p = sdir / "files" / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(data, encoding="utf-8")
        return sdir

    def run_pub(self, sessions, state=None):
        pub = P.Publisher(root=self.root, base="main", dry=True, repo="local/dryrun")
        if state is not None:
            pub.state = state
            pub.hwm = max((int(k) for k in state["rfcs"]), default=0)
        out = Path(tempfile.mkdtemp(dir=self.tmp))
        with contextlib.redirect_stderr(io.StringIO()):
            for s in sessions:
                pub.process_session(s)
            pub.write(out)
        rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
        return pub, rep, out

    def test_protected_path_refuses_whole_session(self):
        s = self.session("bad", "impl-1", [OPEN_PR], files={**STRINGS, "tools/evil.py": "x\n"})
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertTrue(any("protected" in r["reason"] for r in rep["refused"]))

    def test_role_limits_each_action(self):
        s = self.session("rev", "reviewer", [OPEN_PR, COMMENT], files=STRINGS)
        _, rep, _ = self.run_pub([s])
        self.assertEqual([p["action"] for p in rep["published"]], ["comment"])
        self.assertEqual(rep["refused"][0]["action"], "open_pr")
        self.assertIn("may not post open_pr", rep["refused"][0]["reason"])

    def test_schema_error_refuses_one_action(self):
        bad = {"type": "open_pr", "title": "No class", "body": "x", "files": ["stdlib/strings.glyph"]}
        s = self.session("tst", "tester", [bad, COMMENT], files=STRINGS)
        _, rep, _ = self.run_pub([s])
        self.assertEqual([p["action"] for p in rep["published"]], ["comment"])
        self.assertTrue(rep["refused"][0]["reason"].startswith("schema:"))

    def test_failed_outcome_applies_nothing(self):
        s = self.session("f", "designer-min", [COMMENT], outcome="failed")
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertIn("outcome", rep["refused"][0]["reason"])

    def test_open_rfc_numbers_after_high_water_mark(self):
        act = {"type": "open_rfc", "title": "Card syntax", "slug": "card-syntax",
               "class": "language", "file": "drafts/card.md"}
        s = self.session("d", "designer-min", [act], files={"drafts/card.md": "# Card\n"})
        state = {"rfcs": {"0003": {"number": "0003", "slug": "other", "author": "user-1",
                                   "status": "discussion", "votes": {}}}}
        _, rep, out = self.run_pub([s], state=state)
        res = rep["published"][0]["result"]
        self.assertEqual(res["rfc"], "0004")
        self.assertEqual(res["branch"], "agent/rfc-0004")
        self.assertEqual(res["path"], "rfcs/0004-card-syntax.md")
        ev = [json.loads(x) for x in (out / "events.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(ev[0]["type"], "rfc_opened")
        self.assertEqual(ev[0]["subject"], {"rfc": "0004"})
        self.assertEqual(ev[0]["idem"], SESSION_ID.format("designer-min") + "#0")

    def test_open_rfc_refuses_used_slug(self):
        act = {"type": "open_rfc", "title": "Card syntax", "slug": "card-syntax",
               "class": "language", "file": "drafts/card.md"}
        s = self.session("d", "designer-min", [act], files={"drafts/card.md": "# Card\n"})
        state = {"rfcs": {"0003": {"number": "0003", "slug": "card-syntax", "author": "user-1",
                                   "status": "discussion", "votes": {}}}}
        _, rep, _ = self.run_pub([s], state=state)
        self.assertEqual(rep["published"], [])
        self.assertIn("already used", rep["refused"][0]["reason"])

    def test_impl_pr_branch_comes_from_rfc(self):
        act = {"type": "open_pr", "title": "Parser fix", "class": "language", "body": "Fixes.",
               "files": ["stdlib/strings.glyph"], "rfc": "0007"}
        s = self.session("i", "impl-1", [act], files=STRINGS)
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"][0]["result"]["branch"], "agent/impl-0007")

    def test_non_voter_vote_refused(self):
        act = {"type": "vote", "rfc": "0007", "vote": "approve", "rationale": "Sound."}
        s = self.session("v", "impl-2", [act])
        _, rep, _ = self.run_pub([s], state=voting_state())
        self.assertEqual(rep["published"], [])
        self.assertIn("not a voter", rep["refused"][0]["reason"])

    def test_author_vote_refused(self):
        act = {"type": "vote", "rfc": "0007", "vote": "approve", "rationale": "Sound."}
        s = self.session("v", "user-1", [act])
        _, rep, _ = self.run_pub([s], state=voting_state())
        self.assertEqual(rep["published"], [])
        self.assertIn("author", rep["refused"][0]["reason"])

    def test_vote_marker_and_event(self):
        act = {"type": "vote", "rfc": "0007", "vote": "approve", "rationale": "Sound."}
        s = self.session("v", "designer-prag", [act])
        pub, rep, out = self.run_pub([s], state=voting_state())
        self.assertEqual(rep["refused"], [])
        posts = [d["stdin"] for d in pub.dry_log if "gh" in d and d["gh"][:2] == ["pr", "comment"]]
        self.assertTrue(any('<!-- glyph:vote {"rfc":"0007","vote":"approve"} -->' in b for b in posts))
        self.assertTrue(posts[0].startswith("**[designer-prag · "))
        ev = json.loads((out / "events.jsonl").read_text(encoding="utf-8").splitlines()[0])
        self.assertEqual(ev["type"], "vote_cast")

    def test_output_byte_limit(self):
        s = self.session("big", "designer-min", [COMMENT], files={"drafts/big.md": "a" * 2_000_001})
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertIn("limit", rep["refused"][0]["reason"])

    def test_symlink_refuses_session(self):
        s = self.session("ln", "impl-1", [OPEN_PR], files=STRINGS)
        os.symlink("/etc/hosts", s / "files" / "stdlib" / "link.glyph")
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertIn("symlink", rep["refused"][0]["reason"])

    def test_traversal_path_refused(self):
        act = {"type": "open_pr", "title": "Escape", "class": "stdlib", "body": "x",
               "files": ["../escape.glyph"]}
        s = self.session("tr", "impl-1", [act])
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertEqual(len(rep["refused"]), 1)

    def test_action_count_limit(self):
        s = self.session("many", "reviewer", [COMMENT] * 51)
        _, rep, _ = self.run_pub([s])
        self.assertEqual(rep["published"], [])
        self.assertEqual(len(rep["refused"]), 1)

    def test_memory_budget_refuses_memory_only(self):
        s = self.session("mem", "designer-min", [COMMENT], memory="x" * 7000)
        _, rep, _ = self.run_pub([s])
        self.assertEqual(len(rep["published"]), 1)
        self.assertEqual(rep["refused"][0]["action"], "MEMORY.md")
        self.assertIn("budget", rep["refused"][0]["reason"])

    def test_canonical_json(self):
        self.assertEqual(P.canonical_json({"b": 1, "a": "é"}), '{"a":"é","b":1}'.encode("utf-8"))

    def test_digest_event_and_events_are_unchained(self):
        s = self.session("dg", "scribe", [{"type": "digest", "title": "Week", "body": "Things happened."}])
        _, rep, out = self.run_pub([s])
        self.assertEqual(set(rep), {"published", "refused"})
        self.assertEqual(set(rep["published"][0]), {"agent", "session", "action", "index", "result"})
        lines = (out / "events.jsonl").read_bytes().splitlines()
        ev = json.loads(lines[0])
        self.assertEqual(ev["type"], "digest_published")
        self.assertEqual(ev["subject"], {})
        for k in ("seq", "prev_hash", "hash"):
            self.assertNotIn(k, ev)
        self.assertEqual(lines[0], P.canonical_json(ev))

    def test_conformance_meta_must_match_path(self):
        act = {"type": "open_pr", "title": "Add tests", "class": "bugfix",
               "body": "Adds a case.", "files": ["conformance/math/add.test"]}
        bad = self.session("bad", "tester", [act], files={"conformance/math/add.test": conf("math/sub")})
        _, rep, _ = self.run_pub([bad])
        self.assertIn("does not match", rep["refused"][0]["reason"])
        good = self.session("ok", "tester", [act], files={"conformance/math/add.test": conf("math/add")})
        _, rep, _ = self.run_pub([good])
        self.assertEqual(len(rep["published"]), 1)

    def test_fixture_outcomes(self):
        cases = {
            "designer-open-rfc": (1, 0), "implementer-open-pr": (1, 0),
            "implementer-bad-paths": (0, 1), "reviewer-wrong-role": (0, 1),
            "failed-session": (0, 1), "tester-bad-schema": (0, 1), "tester-bad-conformance": (0, 1),
        }
        for name, (pubn, refn) in cases.items():
            with self.subTest(name=name):
                _, rep, _ = self.run_pub([FIX / name])
                self.assertEqual((len(rep["published"]), len(rep["refused"])), (pubn, refn))

    def test_main_entry_point(self):
        out = self.tmp / "main-out"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            rc = P.main(["--session-dirs", str(FIX / "implementer-open-pr"), "--out", str(out),
                         "--root", str(REPO)])
        self.assertEqual(rc, 0)
        rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(len(rep["published"]), 1)


    def test_all_emitted_events_match_audit_schema(self):
        import jsonschema
        schema = json.loads((REPO / "tools" / "schemas" / "events.schema.json").read_text(encoding="utf-8"))
        validator = jsonschema.Draft202012Validator(schema)
        sessions = [
            self.session("d1", "designer-min", [
                {"type": "open_rfc", "title": "Card syntax", "slug": "card-syntax", "class": "language",
                 "file": "drafts/card.md"},
                {"type": "comment", "target": {"rfc": "0007"}, "body": "On the pipes RFC."},
                {"type": "comment", "target": {"issue": 5}, "body": "Noted."},
            ], files={"drafts/card.md": "# Card\n"}),
            self.session("v1", "designer-prag", [
                {"type": "vote", "rfc": "0007", "vote": "approve", "rationale": "Sound."},
            ]),
            self.session("i1", "impl-1", [
                {"type": "open_pr", "title": "Parser fix", "class": "language", "body": "Fixes.",
                 "files": ["stdlib/strings.glyph"], "rfc": "0007"},
                {"type": "update_pr", "pr": 1007, "body": "More.", "files": ["stdlib/strings.glyph"]},
                {"type": "open_issue", "title": "Flaky test", "body": "It flakes.", "labels": ["bug"]},
                {"type": "close_issue", "issue": 5, "reason": "Done."},
            ], files=STRINGS),
            self.session("r1", "reviewer", [
                {"type": "review", "pr": 1007, "verdict": "approve", "body": "LGTM."},
            ]),
            self.session("s1", "scribe", [
                {"type": "digest", "title": "Week 46", "body": "Things happened."},
            ]),
        ]
        pub, rep, out = self.run_pub(sessions, state=voting_state())
        self.assertEqual(rep["refused"], [])
        reviews = [x for x in pub.dry_log if x.get("gh", [])[:2] == ["pr", "review"]]
        self.assertEqual([x["gh"][3] for x in reviews], ["--comment"])  # own-PR approve is refused by GitHub
        self.assertIn("**Verdict: Approve**", reviews[0]["stdin"])
        events = [json.loads(x) for x in (out / "events.jsonl").read_text(encoding="utf-8").splitlines()]
        types = {e["type"] for e in events}
        self.assertTrue({"rfc_opened", "comment_posted", "vote_cast", "pr_opened", "pr_updated",
                         "review_posted", "issue_opened", "issue_closed", "digest_published"} <= types, types)
        for e in events:
            with self.subTest(type=e["type"]):
                validator.validate({**e, "seq": 1, "prev_hash": "0" * 64})

    def test_bad_agent_bytes_never_abort_the_batch(self):
        bad_mem = self.session("badmem", "designer-min", [COMMENT], memory="placeholder")
        (bad_mem / "MEMORY.md").write_bytes(b"\xff\xfe not utf8")
        list_meta = self.session("listmeta", "designer-min", [COMMENT])
        (list_meta / "session.json").write_text("[1, 2]", encoding="utf-8")
        unhashable = self.session("unhash", "designer-min", [COMMENT])
        (unhashable / "session.json").write_text(json.dumps({"agent": ["x"], "session": "s", "ended": TS}),
                                                 encoding="utf-8")
        surrogate = self.session("surr", "reviewer",
                                 '{"actions": [{"type": "comment", "target": {"pr": 3}, "body": "bad \\ud800 body"}]}')
        good = self.session("good", "reviewer", [COMMENT])
        _, rep, out = self.run_pub([bad_mem, list_meta, unhashable, surrogate, good])
        self.assertEqual([p["session"] for p in rep["published"]],
                         [SESSION_ID.format("designer-min"), SESSION_ID.format("reviewer")])
        self.assertTrue(any(r["reason"].startswith("internal error") for r in rep["refused"]) or
                        any("UTF-8" in r["reason"] for r in rep["refused"]))
        self.assertTrue((out / "events.jsonl").exists())
        self.assertGreaterEqual(len(rep["refused"]), 4)

    def test_main_writes_output_even_when_a_session_crashes(self):
        out = self.tmp / "crash-out"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            P.main(["--session-dirs", str(self.tmp / "missing-dir"), str(FIX / "implementer-open-pr"),
                    "--out", str(out), "--root", str(self.root)])
        self.assertTrue((out / "report.json").exists())
        self.assertTrue((out / "events.jsonl").exists())


def _write_session(base, name, agent, actions, files=None, session_id=SESSION_ID):
    sdir = base / "sessions" / name
    sdir.mkdir(parents=True)
    meta = {"agent": agent, "session": session_id.format(agent), "phase": "work",
            "outcome": "ok", "usage": {}, "started": TS, "ended": TS}
    (sdir / "session.json").write_text(json.dumps(meta), encoding="utf-8")
    (sdir / "actions.json").write_text(json.dumps({"actions": actions}), encoding="utf-8")
    (sdir / "MEMORY.md").write_text("Short notes.\n", encoding="utf-8")
    for rel, data in (files or {}).items():
        p = sdir / "files" / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(data, encoding="utf-8")
    return sdir


def _posts(pub, verb):
    return [e for e in pub.dry_log if e.get("gh", [None, None])[:2] == verb]


class PolicyAndIdemTests(unittest.TestCase):
    setUp = PublisherTests.setUp
    session = PublisherTests.session
    run_pub = PublisherTests.run_pub

    def sess(self, name, agent, actions, files=None):
        # unique session id per test session, so idem keys never collide across them
        return _write_session(self.tmp, name, agent, actions, files, session_id='2026-11-19/c014/' + name + '/{}')

    def test_user_may_open_docs_pr_under_examples_only(self):
        ok = self.sess("u-ok", "user-1", [{"type": "open_pr", "title": "Fix example", "class": "docs",
                                               "body": "Typo.", "files": ["examples/hello.glyph"]}],
                          files={"examples/hello.glyph": "fn main() {}\n"})
        bad_class = self.sess("u-class", "user-1", [{"type": "open_pr", "title": "Lib", "class": "stdlib",
                                                         "body": "x", "files": ["examples/a.glyph"]}],
                                 files={"examples/a.glyph": "x\n"})
        bad_path = self.sess("u-path", "user-1", [{"type": "open_pr", "title": "Lib", "class": "docs",
                                                       "body": "x", "files": ["stdlib/x.glyph"]}],
                                files={"stdlib/x.glyph": "x\n"})
        _, rep, _ = self.run_pub([ok, bad_class, bad_path])
        self.assertEqual([p["action"] for p in rep["published"]], ["open_pr"])
        reasons = [r["reason"] for r in rep["refused"]]
        self.assertTrue(any("docs PRs" in r for r in reasons))
        self.assertTrue(any("may not write stdlib/x.glyph" in r for r in reasons))

    def test_designer_has_no_spec_write_and_scribe_keeps_changelog(self):
        self.assertFalse(any(rx.fullmatch("spec/card.md") for rx in P.WRITE["designer"]["open_rfc"]))
        self.assertFalse(any(rx.fullmatch("spec/card.md") for rx in P.WRITE["designer"]["revise_rfc"]))
        ok = self.sess("scribe", "scribe", [{"type": "open_pr", "title": "Changelog", "class": "docs",
                                                 "body": "Notes.", "files": ["spec/CHANGELOG.md"]}],
                          files={"spec/CHANGELOG.md": "- item\n"})
        spec = self.sess("scribe-spec", "scribe", [{"type": "open_pr", "title": "Card", "class": "docs",
                                                        "body": "x", "files": ["spec/card.md"]}],
                            files={"spec/card.md": "x\n"})
        _, rep, _ = self.run_pub([ok, spec])
        self.assertEqual(len(rep["published"]), 1)
        self.assertTrue(any("may not write spec/card.md" in r["reason"] for r in rep["refused"]))

    def test_changed_line_cap_is_400(self):
        at_cap = self.sess("cap-ok", "impl-1", [dict(OPEN_PR, files=["stdlib/a.glyph"])],
                              files={"stdlib/a.glyph": "x\n" * 400})
        over = self.sess("cap-over", "impl-1", [dict(OPEN_PR, title="Other", files=["stdlib/b.glyph"])],
                            files={"stdlib/b.glyph": "x\n" * 401})
        _, rep, _ = self.run_pub([at_cap, over])
        self.assertEqual(len(rep["published"]), 1)
        self.assertTrue(any("over the 400 limit" in r["reason"] for r in rep["refused"]))

    def test_changed_lines_count_removals_against_base(self):
        base = b"a\nb\nc\n"
        self.assertEqual(P.changed_lines(base, b"a\nb\nc\n"), 0)
        self.assertEqual(P.changed_lines(base, b"a\nX\nc\nd\n"), 3)  # -b +X +d
        self.assertEqual(P.changed_lines(base, b""), 3)

    def test_rerun_does_not_repost_comments_or_reopen_prs(self):
        pub = P.Publisher(root=self.root, base="main", dry=True, repo="local/dryrun")
        with contextlib.redirect_stderr(io.StringIO()):
            s = self.sess("c1", "reviewer", [COMMENT])
            pub.process_session(s)
            pub.process_session(s)
            pr = self.sess("pr1", "impl-1", [OPEN_PR], files=STRINGS)
            pub.process_session(pr)
            pub.process_session(pr)
        self.assertEqual(len(_posts(pub, ["pr", "comment"])), 1)
        self.assertEqual(len(_posts(pub, ["pr", "create"])), 1)
        self.assertEqual(len([r for r in pub.published if r["action"] == "open_pr"]), 2)

    def test_second_open_pr_on_same_branch_becomes_update(self):
        pub = P.Publisher(root=self.root, base="main", dry=True, repo="local/dryrun")
        first = self.sess("p1", "impl-1", [OPEN_PR], files=STRINGS)
        second = _write_session(self.tmp, "p2", "impl-1", [dict(OPEN_PR, body="More.")], files=STRINGS,
                                session_id="2026-11-19/c015/work/{}")
        with contextlib.redirect_stderr(io.StringIO()):
            pub.process_session(first)
            pub.process_session(second)
        self.assertEqual(len(_posts(pub, ["pr", "create"])), 1)
        comments = _posts(pub, ["pr", "comment"])
        self.assertEqual(len(comments), 1)
        self.assertIn("<!-- glyph:idem", comments[0]["stdin"])

    def test_open_rfc_rerun_reuses_its_number(self):
        pub = P.Publisher(root=self.root, base="main", dry=True, repo="local/dryrun")
        rfc = self.sess("rfc1", "designer-min",
                           [{"type": "open_rfc", "file": "draft.md", "slug": "pipes", "title": "Pipes",
                             "class": "language"}], files={"draft.md": "# Pipes\n"})
        with contextlib.redirect_stderr(io.StringIO()):
            pub.process_session(rfc)
            pub.process_session(rfc)
        self.assertEqual([r["result"]["rfc"] for r in pub.published], ["0001", "0001"])
        self.assertEqual(len(_posts(pub, ["pr", "create"])), 1)
        self.assertEqual(pub.hwm, 1)


class RealGitTests(unittest.TestCase):
    """GLYPH_DRY=1 for gh only, GLYPH_GIT_REAL=1: branches really pushed to a temp bare origin."""

    def git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="pub-git-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        ident = {"GIT_AUTHOR_NAME": "publisher test", "GIT_AUTHOR_EMAIL": "test@example.invalid",
                 "GIT_COMMITTER_NAME": "publisher test", "GIT_COMMITTER_EMAIL": "test@example.invalid",
                 "GLYPH_GIT_REAL": "1"}
        patcher = mock.patch.dict(os.environ, ident)
        patcher.start()
        self.addCleanup(patcher.stop)
        seed = self.tmp / "seed"
        seed.mkdir()
        shutil.copytree(REPO / "governance", seed / "governance")
        self.git(seed, "init", "-q", "-b", "main")
        self.git(seed, "add", "-A")
        self.git(seed, "commit", "-q", "-m", "seed")
        self.bare = self.tmp / "origin.git"
        subprocess.run(["git", "clone", "-q", "--bare", str(seed), str(self.bare)], check=True)
        self.root = self.tmp / "root"
        subprocess.run(["git", "clone", "-q", str(self.bare), str(self.root)], check=True)

    def bare_refs(self):
        out = self.git(self.bare, "for-each-ref", "--format=%(refname)", "refs/heads")
        return out.splitlines()

    def test_new_pr_replaces_a_dead_branch_of_the_same_name(self):
        seed = self.tmp / "seed"  # a merged PR left agent/stdlib-add-strings behind with other history
        self.git(seed, "checkout", "-q", "-b", "agent/stdlib-add-strings")
        (seed / "old.txt").write_text("old\n")
        self.git(seed, "add", "-A")
        self.git(seed, "commit", "-q", "-m", "old PR")
        self.git(seed, "push", "-q", str(self.bare), "agent/stdlib-add-strings")
        pr = _write_session(self.tmp, "pr", "impl-1", [OPEN_PR], files=STRINGS)
        out = self.tmp / "out"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            P.main(["--session-dirs", str(pr), "--out", str(out), "--root", str(self.root)])
        rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(rep["refused"], [])
        self.assertEqual(self.git(self.bare, "log", "-1", "--format=%an", "refs/heads/agent/stdlib-add-strings"),
                         "impl-1")

    def test_branches_push_to_origin_and_only_agent_branches(self):
        main_before = self.git(self.bare, "rev-parse", "refs/heads/main")
        draft = b"# Pipes\n\nA pipe operator.\n"
        rfc = _write_session(self.tmp, "rfc", "designer-min",
                             [{"type": "open_rfc", "file": "draft.md", "slug": "pipes", "title": "Pipes",
                               "class": "language"}], files={"draft.md": draft.decode()})
        pr = _write_session(self.tmp, "pr", "impl-1", [OPEN_PR], files=STRINGS,
                            session_id="2026-11-19/c014/work/{}")
        out = self.tmp / "out"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            P.main(["--session-dirs", str(rfc), str(pr), "--out", str(out), "--root", str(self.root)])
        rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(rep["refused"], [])
        self.assertEqual(self.bare_refs(), sorted(["refs/heads/main", "refs/heads/agent/rfc-0001",
                                                   "refs/heads/agent/stdlib-add-strings"]))
        self.assertEqual(self.git(self.bare, "rev-parse", "refs/heads/main"), main_before)
        self.assertEqual(self.git(self.bare, "show", "refs/heads/agent/rfc-0001:rfcs/0001-pipes.md"),
                         draft.decode().rstrip("\n"))
        self.assertEqual(self.git(self.bare, "show", "refs/heads/agent/stdlib-add-strings:stdlib/strings.glyph"),
                         STRINGS["stdlib/strings.glyph"].rstrip("\n"))
        self.assertEqual(self.git(self.bare, "log", "-1", "--format=%an|%cn", "refs/heads/agent/rfc-0001"),
                         "designer-min|glyph-publisher")
        self.assertEqual(self.git(self.bare, "log", "-1", "--format=%an", "refs/heads/agent/stdlib-add-strings"),
                         "impl-1")

    def test_real_mode_never_pushes_outside_agent(self):
        pub = P.Publisher(root=self.root, base="main", dry=True, repo="local/dryrun", git_real=True)
        with self.assertRaises(P.PublishError):
            pub._commit("main", "main", [("stdlib/x.glyph", b"x\n")], "bad", "impl-1")
        self.assertEqual(self.bare_refs(), ["refs/heads/main"])


if __name__ == "__main__":
    unittest.main()


class ScriptedPlaysPublish(unittest.TestCase):
    """Every scripted implement play must pass the publisher, or the dry run stalls on Actions."""
    setUp = PublisherTests.setUp
    run_pub = PublisherTests.run_pub

    def test_toy_plan_and_subtasks_are_not_refused(self):
        from tools.scripted import plays
        state = {"rfcs": {"0001": {"number": "0001", "slug": "toy-print", "author": "designer-min",
                                   "status": "implementing", "votes": {}}}}
        heads = [{"phase": "implement", "kind": "plan", "agent": "impl-1", "rfc": "0001"}] + [
            {"phase": "implement", "kind": "subtask", "agent": "impl-1", "rfc": "0001", "subtask": k}
            for k in plays.SUBTASK_PATHS]
        for h in heads:
            with self.subTest(kind=h["kind"], subtask=h.get("subtask")):
                actions, files = plays.respond(h)
                sdir = _write_session(Path(tempfile.mkdtemp(dir=self.tmp)), "s", "impl-1", actions, files)
                _, rep, _ = self.run_pub([sdir], state=state)
                self.assertEqual(rep["refused"], [])
