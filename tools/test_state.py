"""Pure replay: RFC lifecycle, vote recording rules, PR and subtask bookkeeping, cycle counters."""
import unittest

from tools.lib import state as S


def ev(type, subject=None, data=None, actor=None, ts="2026-11-19T10:00:00Z", hash="h"):
    return {"type": type, "subject": subject or {}, "data": data or {}, "actor": actor,
            "ts": ts, "hash": hash}


OPENED = ev("rfc_opened", {"rfc": "7"}, {"title": "Tuples", "slug": "tuples",
                                         "author": "designer-min", "class": "language",
                                         "pr": 40, "branch": "agent/rfc-0007"}, "designer-min")


class ReplayTests(unittest.TestCase):
    def test_rfc_opens_in_discussion_with_numbers_padded(self):
        st = S.replay([OPENED])
        rec = st["rfcs"]["0007"]
        self.assertEqual(rec["status"], "discussion")
        self.assertEqual(rec["number"], "0007")
        self.assertEqual(rec["votes"], {})

    def test_votes_only_count_while_voting(self):
        early = ev("vote_cast", {"rfc": "7"}, {"vote": "approve"}, "user-1")
        st = S.replay([OPENED, early])
        self.assertEqual(st["rfcs"]["0007"]["votes"], {})

    def test_last_vote_per_agent_wins(self):
        events = [OPENED, ev("rfc_status", {"rfc": "7"}, {"rfc": "7", "to": "voting"}),
                  ev("vote_cast", {"rfc": "7"}, {"vote": "reject", "rationale": "no"}, "user-1"),
                  ev("vote_cast", {"rfc": "7"}, {"vote": "approve", "rationale": "yes"}, "user-1")]
        st = S.replay(events)
        self.assertEqual(st["rfcs"]["0007"]["votes"]["user-1"]["vote"], "approve")

    def test_decided_sets_outcome_and_super_flag(self):
        events = [OPENED, ev("rfc_status", {"rfc": "7"}, {"to": "voting"}),
                  ev("rfc_decided", {"rfc": "7"}, {"outcome": "accepted", "accepted_super": True})]
        rec = S.replay(events)["rfcs"]["0007"]
        self.assertEqual(rec["status"], "accepted")
        self.assertTrue(rec["accepted_super"])

    def test_merged_with_rfc_implemented_marks_rfc_and_bumps_spec(self):
        pr = ev("pr_opened", {"pr": 40}, {"branch": "agent/impl-0007", "class": "language",
                                          "rfc": "0007", "author": "impl-1", "head_sha": "a"},
                "impl-1")
        st = S.replay([OPENED, pr, ev("merged", {"pr": 40},
                                      {"spec_after": "0.2.0", "rfc_implemented": True})])
        self.assertEqual(st["prs"]["40"]["status"], "merged")
        self.assertEqual(st["spec_version"], "0.2.0")
        self.assertEqual(st["rfcs"]["0007"]["status"], "implemented")

    def test_merged_with_rfcs_implemented_marks_each_rfc(self):
        other = ev("rfc_opened", {"rfc": "11"}, {"title": "Name", "slug": "name", "author": "designer-min",
                                                 "class": "language"}, "designer-min")
        pr = ev("pr_opened", {"pr": 41}, {"branch": "agent/impl-0007", "class": "language",
                                          "rfc": "0007", "author": "impl-1", "head_sha": "a"}, "impl-1")
        st = S.replay([OPENED, other, pr, ev("merged", {"pr": 41}, {"spec_after": "0.1.0",
                                                                    "rfcs_implemented": ["0007", "0011"]})])
        self.assertEqual(st["rfcs"]["0007"]["status"], "implemented")
        self.assertEqual(st["rfcs"]["0011"]["status"], "implemented")

    def test_gate_blocked_counts_subtask_failures(self):
        pr = ev("pr_opened", {"pr": 9}, {"branch": "b", "class": "language", "rfc": "0007",
                                         "author": "impl-1", "head_sha": "a", "subtask": 2}, "impl-1")
        blocked = ev("gate_blocked", {"pr": 9}, {"subtask": 2, "rule": 5}, "mergebot")
        st = S.replay([pr, blocked, blocked])
        self.assertEqual(st["prs"]["9"]["subtask_failures"], {"2": 2})

    def test_head_hash_tracks_last_event(self):
        st = S.replay([OPENED, ev("issue_opened", {"issue": 3}, {"title": "x"}, "user-1", hash="zz")])
        self.assertEqual(st["head_hash"], "zz")
        self.assertEqual(st["issues"]["3"]["status"], "open")

    def test_cycles_and_nights_since_status_change(self):
        st = S.empty_state()
        st["cycles"] = ["2026-11-19/c1", "2026-11-19/c2", "2026-11-20/c1"]
        rec = {"status_cycle": 1}
        self.assertEqual(S.cycles_since(st, rec), 2)
        self.assertEqual(S.nights_since(st, rec), 2)
        self.assertEqual(S.nights_since(st, {"status_cycle": 3}), 0)


class NoopAndCloseTests(unittest.TestCase):
    def test_subtask_noops_count_per_rfc_and_subtask(self):
        noop = ev("subtask_noop", {"rfc": "7"}, {"rfc": "0007", "subtask": 2, "pr": 30}, "impl-1")
        self.assertEqual(S.replay([noop, noop])["noops"], {"0007:2": 2})

    def test_refused_noops_do_not_count_unless_for_size_and_an_update_clears_the_pr(self):
        opened = ev("pr_opened", {"pr": 30}, {"branch": "b", "class": "language", "rfc": "0007",
                                              "author": "impl-1", "head_sha": "a"}, "impl-1")
        noop = ev("subtask_noop", {"rfc": "7"}, {"rfc": "0007", "subtask": 2, "pr": 30}, "impl-1")
        refused = ev("subtask_noop", {"rfc": "7"}, {"rfc": "0007", "subtask": 2, "pr": 30, "refused": ["x"]}, "impl-1")
        self.assertEqual(S.replay([opened, noop, refused])["noops"], {"0007:2": 1})
        big = ev("subtask_noop", {"rfc": "7"}, {"rfc": "0007", "subtask": 2, "pr": 30,
                 "refused": ["900 changed lines against main, over the 400 limit"]}, "impl-1")
        self.assertEqual(S.replay([opened, big, big])["noops"], {"0007:2": 2})
        updated = ev("pr_updated", {"pr": 30}, {"head_sha": "b"}, "impl-1")
        self.assertEqual(S.replay([opened, noop, updated])["noops"], {})
        other = ev("pr_updated", {"pr": 30}, {"head_sha": "c", "subtask": 3}, "impl-1")
        self.assertEqual(S.replay([opened, noop, other])["noops"], {"0007:2": 1})

    def test_pr_closed_marks_the_pr_closed(self):
        pr = ev("pr_opened", {"pr": 9}, {"branch": "b", "class": "language", "rfc": "0007",
                                         "author": "impl-1", "head_sha": "a"}, "impl-1")
        st = S.replay([pr, ev("pr_closed", {"pr": 9}, {"reason": "refused"}, "mergebot")])
        self.assertEqual(st["prs"]["9"]["status"], "closed")

    def test_head_checked_needs_same_pr_and_sha(self):
        events = [ev("check_run", {"pr": 9}, {"sha": "abc"})]
        self.assertTrue(S.head_checked(events, 9, "abc"))
        self.assertFalse(S.head_checked(events, 9, "def"))
        self.assertFalse(S.head_checked(events, 10, "abc"))


if __name__ == "__main__":
    unittest.main()
