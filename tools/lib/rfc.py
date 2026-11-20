"""RFC voting, lifecycle timing, cooldown and flow caps (spec section 6, governance/RULES.md).

All functions are pure over the state dict from state.py plus the rules dict.
"""
import re

from tools.lib import state as st_mod


def tally(rec: dict, roster_voters: set, rules: dict) -> dict:
    """Decide an RFC from its recorded votes. Author and non-voters are excluded.

    Returns {"outcome": "accepted"|"rejected", "accepted_super": bool, "counted": {...},
             "ignored": {...}, "reason": str}.
    """
    ignored = {}
    counted = {}
    for agent, v in sorted(rec.get("votes", {}).items()):
        if agent == rec.get("author"):
            ignored[agent] = "author"
        elif agent not in roster_voters:
            ignored[agent] = "not a voter"
        else:
            counted[agent] = v["vote"]
    cast = len(counted)
    approve = sum(1 for v in counted.values() if v == "approve")
    reject = sum(1 for v in counted.values() if v == "reject")
    non_abstain = approve + reject
    need_super = bool(rec.get("breaking") or rec.get("alters_tests"))
    need = rules["supermajority_ratio"] if need_super else rules["accept_ratio"]
    if cast < rules["quorum"]:
        outcome, reason = "rejected", f"no quorum: {cast} cast, {rules['quorum']} required"
    elif non_abstain == 0:
        outcome, reason = "rejected", "only abstentions"
    else:
        ratio = approve / non_abstain
        # Rounded to 4 places so 2/3 (0.6667 in RULES.md) passes; see report notes.
        if round(ratio, 4) >= round(need, 4):
            outcome, reason = "accepted", f"{approve}/{non_abstain} approve, need {need}"
        else:
            outcome, reason = "rejected", f"{approve}/{non_abstain} approve, need {need}"
    return {"outcome": outcome, "accepted_super": outcome == "accepted" and need_super,
            "counted": counted, "ignored": ignored, "reason": reason,
            "approve": approve, "reject": reject, "abstain": cast - non_abstain}


def discussion_done(st: dict, rec: dict, rules: dict) -> bool:
    return (st_mod.cycles_since(st, rec) >= rules["discussion_min_cycles"]
            or st_mod.nights_since(st, rec) >= rules["discussion_max_nights"])


def voting_done(st: dict, rec: dict, rules: dict) -> bool:
    return st_mod.cycles_since(st, rec) >= rules["voting_cycles"]


FOUNDING_SLUGS = ("name", "lexical-syntax", "kernel", "diagnostic-style")  # SPEC M2 founding assignments


def implementing_lapsed(st: dict, rec: dict, rules: dict) -> bool:
    if re.sub(r"-v\d+$", "", rec.get("slug") or "") in FOUNDING_SLUGS:
        return False  # founding RFCs build the first compiler together on one PR: they never lapse
    return st_mod.nights_since(st, rec) >= rules["implementing_max_nights"]


def in_cooldown(st: dict, slug: str, rules: dict) -> bool:
    """A rejected RFC with the same slug cannot return for resubmit_cooldown_nights nights."""
    for rec in st["rfcs"].values():
        if rec.get("slug") == slug and rec["status"] == "rejected":
            if st_mod.nights_since(st, rec) < rules["resubmit_cooldown_nights"]:
                return True
    return False


def open_refusal(st: dict, designer: str, slug: str, rules: dict):
    """Return a refusal reason for a new RFC, or None when it may open."""
    open_rfcs = [r for r in st["rfcs"].values() if r["status"] in ("discussion", "voting")]
    if len(open_rfcs) >= rules["max_open_rfcs"]:
        return f"max_open_rfcs {rules['max_open_rfcs']} reached"
    mine = [r for r in open_rfcs if r.get("author") == designer]
    if len(mine) >= rules["max_open_rfcs_per_designer"]:
        return f"max_open_rfcs_per_designer {rules['max_open_rfcs_per_designer']} reached"
    if in_cooldown(st, slug, rules):
        return "resubmit cooldown in effect"
    return None


def implementing_count(st: dict) -> int:
    return sum(1 for r in st["rfcs"].values() if r["status"] == "implementing")


def decision_record(number: str, rec: dict, result: dict, day: str) -> str:
    """Deterministic markdown for audit/decisions/NNNN.md. No timestamps other than `day`."""
    lines = [f"# RFC {number}: {rec.get('title')}", "",
             f"- decided: {day}", f"- outcome: {result['outcome']}",
             f"- accepted with supermajority: {str(result['accepted_super']).lower()}",
             f"- reason: {result['reason']}",
             f"- approve {result['approve']}, reject {result['reject']}, abstain {result['abstain']}",
             "", "## Votes"]
    for agent in sorted(result["counted"]):
        v = rec["votes"][agent]
        lines.append(f"- {agent}: {v['vote']}. {v.get('rationale', '')}".rstrip())
    if result["ignored"]:
        lines += ["", "## Ignored"]
        for agent in sorted(result["ignored"]):
            lines.append(f"- {agent}: {result['ignored'][agent]}")
    return "\n".join(lines) + "\n"
