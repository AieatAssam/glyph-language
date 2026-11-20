"""State-aware scripted plays for the M1 dry run. Pure: respond(header, body) reads fixtures only.

Each play answers one assignment. The orchestrator puts the state it needs into the header
(phase, kind, rfc, rfcs, pr, prs, subtask, slugs), so a play never reads the repo or the event log.
Sources come from tools/scripted/fixtures: the toy language under toy/ mirrors repo paths, and the
implementer copies its files into the PR.
"""
import json
import re
from pathlib import Path

FIX = Path(__file__).resolve().parent / "fixtures"
TOY = FIX / "toy"
TEXT = json.loads((FIX / "text.json").read_text(encoding="utf-8"))
RFCS = json.loads((FIX / "rfc" / "index.json").read_text(encoding="utf-8"))
ISSUES = json.loads((FIX / "use" / "issues.json").read_text(encoding="utf-8"))

# Toy-language paths each subtask of fixtures/plans/<slug>.plan.md creates.
SUBTASK_PATHS = {
    1: ["spec/card.md", "spec/core/01-toy.md", "spec/errors.json", "spec/grammar.peg", "spec/VERSION",
        "conformance/toy/arith-precedence.test", "conformance/toy/arith-division.test",
        "conformance/toy/arith-wrap.test", "conformance/toy/bad-character.test",
        "conformance/toy/divide-by-zero.test", "conformance/toy/blank-lines.test",
        "examples/hello-numbers.toy"],
    2: ["compiler/stage0/src/core.ts", "compiler/stage0/src/browser.ts"],  # each subtask stays under 400 lines
    3: ["compiler/stage0/src/main.ts", "compiler/stage0/src/conformance.test.ts"],
}


def _text(rel: str) -> str:
    return (TOY / rel).read_text(encoding="utf-8")


def _plan(slug: str) -> str:
    return (FIX / "plans" / f"{slug}.plan.md").read_text(encoding="utf-8")


def _ticked(plan: str, upto: int) -> str:
    """Tick every subtask line up to and including `upto`."""
    def tick(m):
        k = int(m.group(1))
        return f"- [x] {k}." if k <= upto else m.group(0)
    return re.sub(r"^- \[ \] (\d+)\.", tick, plan, flags=re.M)


def _open(h, agent):
    acts, files = [], {}
    for slug in h.get("slugs", []):
        rfc = next((e for e in RFCS.values() if e["slug"] == slug), None)
        if rfc is None:
            continue
        path = f"rfcs/draft-{slug}.md"
        files[path] = (FIX / "rfc" / f"{slug}.md").read_text(encoding="utf-8")
        acts.append({"type": "open_rfc", "title": rfc["title"], "slug": slug, "class": rfc["class"], "file": path})
    return acts, files


def _comment(h, agent):
    return [{"type": "comment", "target": {"rfc": h["rfc"]}, "body": TEXT["comments"][agent]}], {}


def _architect(h, agent):
    return [{"type": "comment", "target": {"rfc": n}, "body": TEXT["comments"]["architect"]}
            for n in h.get("rfcs", [])], {}


def _vote(h, agent):
    return [{"type": "vote", "rfc": n, "vote": "approve", "rationale": TEXT["votes"][agent]}
            for n in h.get("rfcs", [])], {}


def _plan_pr(h, agent):
    n = h["rfc"]
    path = f"rfcs/{n}.plan.md"
    action = {"type": "open_pr", "title": f"Plan for RFC {n}: {RFCS[n]['title']}", "class": RFCS[n]["class"],
              "body": f"Ordered subtasks for RFC {n}. Each subtask ships through its own gated PR.",
              "files": [path], "rfc": n}
    return [action], {path: _plan(RFCS[n]["slug"])}


def _subtask(h, agent):
    n, k = h["rfc"], int(h["subtask"])
    path = f"rfcs/{n}.plan.md"
    files = {p: _text(p) for p in SUBTASK_PATHS[k]}
    files[path] = _ticked(_plan(RFCS[n]["slug"]), k)
    if h.get("pr"):
        return [{"type": "update_pr", "pr": int(h["pr"]), "files": sorted(files)}], files
    action = {"type": "open_pr", "title": f"RFC {n}: {RFCS[n]['title']}, subtask {k}", "class": RFCS[n]["class"],
              "body": f"Subtask {k} of RFC {n}, as written in its plan.", "files": sorted(files),
              "rfc": n, "subtask": k}
    return [action], files


def _tests(h, agent):
    return [{"type": "comment", "target": {"rfc": h["rfc"]}, "body": TEXT["comments"]["tester"]}], {}


def _review(h, agent):
    return [{"type": "review", "pr": int(p), "verdict": "approve", "body": TEXT["review"]}
            for p in h.get("prs", [])], {}


def _use(h, agent):
    issue = ISSUES.get(agent)
    if not issue:
        return [], {}
    return [{"type": "open_issue", "title": issue["title"], "body": issue["body"], "labels": []}], {}


def _digest(h, agent):
    return [{"type": "digest", "title": "Tonight", "body": TEXT["digest"]}], {}


PLAYS = {
    ("design", "open"): _open,
    ("design", "comment"): _comment,
    ("architect", "architect"): _architect,
    ("vote", "vote"): _vote,
    ("implement", "plan"): _plan_pr,
    ("implement", "subtask"): _subtask,
    ("implement", "tests"): _tests,
    ("review", "review"): _review,
    ("use", "use"): _use,
    ("scribe", "digest"): _digest,
}


def respond(header: dict, body: str = "") -> tuple[list, dict]:
    """(actions, files) for one assignment. Unplayed phases (for example architect-weekly) do nothing."""
    play = PLAYS.get((header.get("phase"), header.get("kind")))
    return play(header, header["agent"]) if play else ([], {})
