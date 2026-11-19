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


if __name__ == "__main__":
    unittest.main()
