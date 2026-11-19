"""Replays the audit log into the state shape of CONTRACTS.md. Pure function of events."""
from tools.lib import audit

VOTES = ("approve", "reject", "abstain")


def rfc_key(n) -> str:
    return f"{int(n):04d}"


def empty_state() -> dict:
    return {
        "rfcs": {}, "prs": {}, "issues": {}, "cycles": [], "escalations": [],
        "spec_version": "0.0.0", "head_hash": audit.GENESIS,
    }


def cycles_since(st, rec) -> int:
    return len(st["cycles"]) - rec["status_cycle"]


def nights_since(st, rec) -> int:
    return len({c.split("/")[0] for c in st["cycles"][rec["status_cycle"]:]})


def _set_status(st, rec, status, ts):
    rec["status"] = status
    rec["status_cycle"] = len(st["cycles"])
    rec["status_date"] = ts[:10]


def apply_event(st: dict, ev: dict) -> dict:
    """Apply one event to `st` in place and return it. Mutates existing records, never replaces them."""
    t = ev["type"]
    subj = ev.get("subject") or {}
    data = ev.get("data") or {}
    actor = ev.get("actor")
    ts = ev.get("ts", "")
    rk = rfc_key(subj["rfc"]) if "rfc" in subj else None
    pk = str(subj["pr"]) if "pr" in subj else None
    rec = st["rfcs"].get(rk) if rk else None
    pr = st["prs"].get(pk) if pk else None

    if t == "rfc_opened":
        st["rfcs"][rk] = {
            "number": rk, "title": data.get("title"), "slug": data.get("slug"),
            "author": data.get("author"), "class": data.get("class"), "status": "discussion",
            "pr": data.get("pr"), "branch": data.get("branch"),
            "status_cycle": len(st["cycles"]), "status_date": ts[:10],
            "votes": {}, "accepted_super": False,
            "breaking": bool(data.get("breaking", False)),
            "alters_tests": bool(data.get("alters_tests", False)),
        }
    elif t == "rfc_status" and rec is not None:
        _set_status(st, rec, data["to"], ts)
    elif t == "vote_cast" and rec is not None:
        if rec["status"] == "voting" and data.get("vote") in VOTES and actor:
            rec["votes"][actor] = {"vote": data["vote"], "rationale": data.get("rationale", "")}
    elif t == "rfc_decided" and rec is not None:
        _set_status(st, rec, data["outcome"], ts)
        rec["accepted_super"] = bool(data.get("accepted_super", False))
    elif t in ("rfc_withdrawn", "rfc_lapsed", "rfc_superseded") and rec is not None:
        _set_status(st, rec, {"rfc_withdrawn": "withdrawn", "rfc_lapsed": "lapsed",
                              "rfc_superseded": "superseded"}[t], ts)
    elif t == "pr_opened" and pk is not None:
        st["prs"][pk] = {
            "number": int(pk), "branch": data.get("branch"), "class": data.get("class"),
            "rfc": rfc_key(data["rfc"]) if data.get("rfc") else None, "author": data.get("author"),
            "status": "open", "head_sha": data.get("head_sha"), "reviews": [],
            "subtask_failures": {}, "subtask": data.get("subtask"),
        }
    elif t == "pr_updated" and pr is not None:
        if data.get("head_sha"):
            pr["head_sha"] = data["head_sha"]
    elif t == "review_posted" and pr is not None:
        pr["reviews"].append({"agent": actor, "verdict": data.get("verdict"), "sha": data.get("sha")})
    elif t == "gate_blocked" and pr is not None and data.get("subtask") is not None:
        key = str(data["subtask"])
        pr["subtask_failures"][key] = pr["subtask_failures"].get(key, 0) + 1
    elif t == "merged" and pr is not None:
        pr["status"] = "merged"
        if data.get("spec_after"):
            st["spec_version"] = data["spec_after"]
        if data.get("rfc_implemented") and pr.get("rfc") in st["rfcs"]:
            _set_status(st, st["rfcs"][pr["rfc"]], "implemented", ts)
    elif t == "issue_opened" and "issue" in subj:
        st["issues"][str(subj["issue"])] = {
            "number": subj["issue"], "title": data.get("title"),
            "author": data.get("author"), "status": "open",
        }
    elif t == "issue_closed" and "issue" in subj:
        iss = st["issues"].get(str(subj["issue"]))
        if iss is not None:
            iss["status"] = "closed"
    elif t == "cycle_started":
        st["cycles"].append(data["cycle"])
    elif t == "escalation":
        st["escalations"].append({"seq": ev.get("seq"), "subject": subj, "data": data})

    st["head_hash"] = ev.get("hash", st["head_hash"])
    return st


def replay(events) -> dict:
    st = empty_state()
    for ev in events:
        apply_event(st, ev)
    return st


def load_state(root) -> dict:
    return replay(audit.load_events(root))
