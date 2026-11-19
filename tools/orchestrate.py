"""Deterministic orchestrator: decides one phase's assignments from repo state.

    python -m tools.orchestrate --phase P --out DIR

Env: RUN_DATE (YYYY-MM-DD, default today UTC), CYCLE (1-6), BASE_BRANCH (main).
Writes DIR/assignments.json and DIR/<agent>.md. Same inputs give identical bytes.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
from pathlib import Path

import yaml

PHASES = ("architect", "design", "vote", "implement", "review", "use", "scribe", "architect-weekly")
ARCH_PHASES = {"architect", "scribe", "architect-weekly"}  # session ids use cycle c0
USER_ROLE = "user"  # users vote from the RFC's Summary and Examples only (see _vote_block)
USER_SECTIONS = ("summary", "examples")
DIFF_CAP = 60000
RFC_CAP = 30000

FOUNDING = (
    {"slug": "name", "title": "The language name", "class": "language"},
    {"slug": "lexical-syntax", "title": "Lexical structure and core syntax", "class": "language"},
    {"slug": "kernel", "title": "Kernel: integers, booleans, bindings, functions, conditionals, loops, text output", "class": "language"},
    {"slug": "diagnostic-style", "title": "Diagnostic style", "class": "language"},
)
TOY = {"slug": "toy-print", "title": "Toy print", "class": "language"}

# Self-hosting readiness checklist (spec section 9). An item is done when an implemented RFC
# title or slug matches its pattern. Keyword matching is a deliberate shortcut.
CHECKLIST = (
    ("integers-booleans-bytes", r"\b(kernel|integer|bool|byte)"),
    ("text", r"\b(text|string)"),
    ("arrays-buffers", r"\b(array|buffer)"),
    ("records-variants", r"\b(record|variant|union|match)"),
    ("functions-failure", r"\b(function|recursion|failure)"),
    ("modules", r"\bmodule"),
    ("maps", r"\b(map|assoc)"),
    ("file-args-exit", r"\b(file|argument|exit)"),
)

CLI_DOC = """\
glyphc check <file> [--json]        Parse and check. Diagnostics to stdout. Exit 0 clean, 1 on errors.
glyphc build <file> -o <out.wasm>   Check, then emit a WebAssembly module.
glyphc run <file> [args]            Build and run the program.
glyphc fmt <file> [--check]         Canonical formatting.
glyphc explain <code>               Print the diagnostic catalogue entry.
glyphc --version                    Compiler and spec version.
"""

SUBTASK_RE = re.compile(r"^- \[( |x|X)\] (?:\d+\.\s*)?(.+)$", re.M)


def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def milestone_no(rules: dict) -> int:
    return int(re.sub(r"\D", "", str(rules.get("milestone", "M0"))) or 0)


def by_num(keys):
    return sorted(keys, key=lambda k: int(k))


def parse_plan(text: str) -> list[tuple[int, bool, str]]:
    return [(i + 1, m.group(1).strip().lower() == "x", m.group(2).strip()) for i, m in enumerate(SUBTASK_RE.finditer(text))]


def next_subtask(text: str) -> tuple[int, str] | None:
    for idx, done, text_ in parse_plan(text):
        if not done:
            return idx, text_
    return None


def escalation_items(state: dict, rules: dict) -> list[dict]:
    limit = int(rules.get("escalation_failures", 3))
    found: dict[tuple[str, int], dict] = {}
    for e in state.get("escalations", []) or []:
        found[(str(e.get("rfc")), int(e.get("subtask") or 0))] = {
            "rfc": str(e.get("rfc")), "subtask": int(e.get("subtask") or 0), "notes": str(e.get("notes", "")),
        }
    prs = state.get("prs", {})
    for pn in by_num(prs):
        p = prs[pn]
        for k in by_num(p.get("subtask_failures", {}) or {}):
            count = int(p["subtask_failures"][k])
            if count >= limit:
                key = (str(p.get("rfc")), int(k))
                found.setdefault(key, {"rfc": key[0], "subtask": key[1], "notes": f"{count} failed sessions"})
    return [found[k] for k in sorted(found, key=lambda k: (int(k[0] or 0), k[1]))]


def focus_for(state: dict, index: int) -> str:
    done = [r for r in state.get("rfcs", {}).values() if r.get("status") == "implemented"]
    missing = [name for name, pat in CHECKLIST
               if not any(re.search(pat, f"{r.get('title', '')} {r.get('slug', '')}", re.I) for r in done)]
    if missing:
        item = missing[index % len(missing)]
        return f"Readiness checklist (spec section 9): propose an RFC for the item `{item}`. Items still open: {', '.join(missing)}."
    return "Every readiness item has an implemented RFC. Propose from the benchmark findings and user issues below."


class Repo:
    """Read-only view of the repo at BASE. Tests substitute an in-memory fake."""

    def __init__(self, root: Path, base: str):
        self.root, self.base = Path(root), base

    def read(self, rel: str) -> str | None:
        p = self.root / rel
        return p.read_text(encoding="utf-8") if p.is_file() else None

    def read_ref(self, branch: str, rel: str) -> str | None:
        """File text on a branch, for RFCs and plans not yet merged. None when absent."""
        for ref in (f"origin/{branch}", branch):
            r = subprocess.run(["git", "-C", str(self.root), "show", f"{ref}:{rel}"],
                               capture_output=True, text=True, timeout=120)
            if r.returncode == 0:
                return r.stdout
        return None

    def list(self, rel: str) -> list[str]:
        base = self.root / rel
        if not base.is_dir():
            return []
        out = []
        for dp, dns, fns in os.walk(base):
            dns.sort()
            out += [str((Path(dp) / f).relative_to(self.root)) for f in fns]
        return sorted(out)

    def diff(self, branch: str) -> str | None:
        for ref in (f"origin/{branch}", branch):
            try:
                r = subprocess.run(["git", "-C", str(self.root), "diff", f"{self.base}...{ref}"],
                                   capture_output=True, text=True, timeout=120)
            except (OSError, subprocess.SubprocessError):
                return None
            if r.returncode == 0:
                return r.stdout[:DIFF_CAP]
        return None


def rfc_path(num: str, rfc: dict) -> str:
    return f"rfcs/{num}-{rfc['slug']}.md"


def _rfc_raw(repo, num: str, rfc: dict) -> str | None:
    text = repo.read(rfc_path(num, rfc))
    if text is None and rfc.get("branch"):
        text = repo.read_ref(rfc["branch"], rfc_path(num, rfc))
    return text


def rfc_text(repo, num: str, rfc: dict) -> str:
    text = _rfc_raw(repo, num, rfc)
    if text is None:
        return f"(RFC {num} is not on {repo.base} yet; branch {rfc.get('branch')})"
    return text[:RFC_CAP]


def user_sections(text: str) -> str:
    """Only the `## Summary` and `## Examples` sections of an RFC. Text before the first heading is dropped."""
    out, keep = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            keep = line[3:].strip().lower() in USER_SECTIONS
        if keep:
            out.append(line)
    return "\n".join(out)


def rfc_block(repo, num: str, rfc: dict) -> str:
    return (f"### RFC {num}: {rfc.get('title')} (slug {rfc.get('slug')}, class {rfc.get('class')}, "
            f"status {rfc.get('status')})\n\n{rfc_text(repo, num, rfc)}\n")


def findings_text(repo) -> str:
    runs = [p for p in repo.list("audit/bench") if p.endswith("/findings.md")]
    if not runs:
        return "(no benchmark findings yet)"
    return repo.read(runs[-1])[:8000]


def overfit_note(repo) -> str:
    """Only when the audit log holds an overfit_warning: tells designers to favour general changes."""
    for line in (repo.read("audit/events.jsonl") or "").splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict) and e.get("type") == "overfit_warning":
            return ("\n\nWARNING: dev fitness has exceeded held-out fitness by more than the limit for "
                    "several nights. Prefer changes that generalise, not ones tuned to the dev tasks.")
    return ""


def roadmap_top(repo) -> str:
    text = repo.read("architecture/ROADMAP.md")
    return "\n".join(text.splitlines()[:40]) if text else "(no roadmap yet)"


def issues_text(state: dict) -> str:
    rows = [f"- #{n} {i.get('title')}" for n, i in sorted(state.get("issues", {}).items(), key=lambda kv: int(kv[0]))
            if i.get("status") == "open"]
    return "\n".join(rows[:20]) or "(no open issues)"


class Asg:
    def __init__(self, agent: str, phase: str, kind: str, body: str, **header):
        self.agent, self.phase, self.body = agent, phase, body
        self.header = {"agent": agent, "phase": phase, "kind": kind}
        self.header.update({k: v for k, v in header.items() if v is not None})

    @property
    def kind(self):
        return self.header["kind"]


def _roles(roster, role):
    return [a["id"] for a in roster if a.get("role") == role]


def _voters(roster):
    return [a["id"] for a in roster if a.get("votes")]


def _vote_block(repo, n: str, r: dict, user: bool) -> str:
    if not user:
        return rfc_block(repo, n, r)
    # A user judges from the title and the Summary and Examples; the design body stays with designers.
    text = user_sections(_rfc_raw(repo, n, r) or "")[:RFC_CAP].strip()
    return f"### RFC {n}: {r.get('title')} (class {r.get('class')})\n\n{text}\n"


def _open_pr(prs, n: str, *, subtask: bool) -> str | None:
    """Open PR for RFC n: the plan PR (subtask False) or the implementation PR that subtasks accumulate into."""
    for pn in by_num(prs):
        p = prs[pn]
        if str(p.get("rfc")) == n and p.get("status") == "open" and (p.get("subtask") is not None) == subtask:
            return pn
    return None


def plan_design(ctx) -> list[Asg]:
    st, rules, repo, live = ctx.state, ctx.rules, ctx.repo, ctx.live
    rfcs = st.get("rfcs", {})
    designers = _roles(ctx.roster, "designer")
    open_ = [n for n in by_num(rfcs) if rfcs[n]["status"] in ("discussion", "voting")]
    slugs = {r["slug"] for r in rfcs.values()}
    per_designer = {d: sum(1 for n in open_ if rfcs[n]["author"] == d) for d in designers}
    slots = int(rules.get("max_open_rfcs", 5)) - len(open_)
    cap_each = int(rules.get("max_open_rfcs_per_designer", 2))
    out: dict[str, Asg] = {}
    opened: dict[str, list] = {}  # designer -> [(spec, why)]; one assignment can carry two opens

    def can(d):  # capacity left for this designer
        return slots > 0 and per_designer[d] < cap_each

    def free(d):  # no assignment yet this phase
        return d not in out and d not in opened

    def open_rfc(d, spec, why):
        nonlocal slots
        slots -= 1
        per_designer[d] += 1
        opened.setdefault(d, []).append((spec, why))

    for e in ctx.escalations:  # escalated subtasks go back to the RFC's designer
        r = rfcs.get(e["rfc"])
        if r and r["author"] in designers and r["author"] not in out and r["status"] in ("accepted", "implementing"):
            out[r["author"]] = Asg(r["author"], "design", "revise", (
                f"Implementers could not build subtask {e['subtask']} of RFC {e['rfc']} as specified.\n"
                f"Failure notes: {e['notes']}\n\nRevise the RFC so it is implementable, then return `revise_rfc`.\n\n"
                + rfc_block(repo, e["rfc"], r)), rfc=e["rfc"], subtask=e["subtask"])

    if live:
        for k, spec in enumerate(FOUNDING):
            if spec["slug"] in slugs:
                continue
            for j in range(len(designers)):  # round robin from the founding index
                d = designers[(k + j) % len(designers)]
                if can(d) and d not in out:
                    open_rfc(d, spec, "Founding RFC: assigned by the orchestrator. Keep it to the minimum the kernel needs.")
                    break
    elif TOY["slug"] not in slugs and designers and can(designers[0]) and free(designers[0]):
        open_rfc(designers[0], TOY, "Milestone M1 dry run: write the smallest RFC that a scripted toy language can implement.")

    for d, items in opened.items():
        body = "\n\n---\n\n".join(
            f"Open a new RFC: title `{s['title']}`, slug `{s['slug']}`, class `{s['class']}`.\n"
            f"Write `rfcs/draft-{s['slug']}.md` with every required template section, then return "
            f"`open_rfc` with `file` set to that path.\n\n{why}\n" for s, why in items)
        out[d] = Asg(d, "design", "open", body, slugs=[s["slug"] for s, _ in items])

    any_open = any(rfcs[n]["status"] in ("discussion", "voting") for n in rfcs) or bool(opened)
    if live and not any_open:
        for i, d in enumerate(designers):
            if free(d) and can(d):
                out[d] = Asg(d, "design", "propose", (
                    f"No RFC is open. {focus_for(st, i)}\n\n"
                    f"## Benchmark findings\n{findings_text(repo)}{overfit_note(repo)}\n\n## Open user issues\n{issues_text(st)}\n\n"
                    f"## Roadmap (top)\n{roadmap_top(repo)}\n\n"
                    "Propose one RFC grounded in a finding or issue. Cite it in the Motivation section."))

    discussion = [n for n in open_ if rfcs[n]["status"] == "discussion"]
    for i, d in enumerate(designers):
        if not free(d):
            continue
        cands = [n for n in discussion if rfcs[n]["author"] != d]
        if cands:
            n = cands[i % len(cands)]
            out[d] = Asg(d, "design", "comment", (
                f"Comment on an open RFC. Give one concrete comment through `comment` with target `{{\"rfc\": \"{n}\"}}`. "
                "Say what you would cut before adding anything.\n\n" + rfc_block(repo, n, rfcs[n])), rfc=n)
    return [out[d] for d in designers if d in out]


def plan_vote(ctx) -> list[Asg]:
    rfcs = ctx.state.get("rfcs", {})
    voting = [n for n in by_num(rfcs) if rfcs[n]["status"] == "voting"]
    users = set(_roles(ctx.roster, USER_ROLE))
    out = []
    for a in _voters(ctx.roster):
        pending = [n for n in voting if rfcs[n]["author"] != a and a not in rfcs[n].get("votes", {})]
        if pending:
            body = "Cast one vote per RFC with `vote` (approve, reject or abstain) and a rationale.\n\n" + "\n".join(
                _vote_block(ctx.repo, n, rfcs[n], a in users) for n in pending)
            out.append(Asg(a, "vote", "vote", body, rfc=pending[0], rfcs=pending))
    return out


def _latest_check(events, pr: str, sha):
    found = None
    for ev in events:
        if ev.get("type") == "check_run" and str((ev.get("subject") or {}).get("pr")) == pr \
                and (ev.get("data") or {}).get("sha") == sha:
            found = ev
    return found


def plan_implement(ctx) -> list[Asg]:
    rfcs, rules, repo = ctx.state.get("rfcs", {}), ctx.rules, ctx.repo
    prs = ctx.state.get("prs", {})
    limit = int(rules.get("escalation_failures", 3))
    escalated = {(e["rfc"], e["subtask"]) for e in ctx.escalations}
    items = []
    for n in by_num(rfcs):
        r = rfcs[n]
        if r["status"] not in ("accepted", "implementing"):
            continue
        if _open_pr(prs, n, subtask=False):  # the plan PR is still under review
            continue
        impl_pr = _open_pr(prs, n, subtask=True)
        path = f"rfcs/{n}.plan.md"
        plan = (repo.read_ref(prs[impl_pr]["branch"], path) if impl_pr else None) or repo.read(path)
        if plan is None:
            items.append(dict(rfc=n, kind="plan", r=r))
            continue
        nxt = next_subtask(plan)
        if nxt is None:
            continue
        idx, text = nxt
        pr = int(impl_pr) if impl_pr else None
        fails = (prs[impl_pr].get("subtask_failures") or {}) if impl_pr else {}
        if int(fails.get(str(idx), 0)) >= limit or (n, idx) in escalated:
            continue
        items.append(dict(rfc=n, kind="subtask", r=r, plan=plan, subtask=idx, text=text, pr=pr))
    impls = _roles(ctx.roster, "implementer")
    testers = _roles(ctx.roster, "tester")
    out = []
    for agent, item in zip(impls, items[:int(rules.get("max_implementing", 3))]):
        n, r = item["rfc"], item["r"]
        head = rfc_block(repo, n, r)
        if item["kind"] == "plan":
            body = (f"Write the plan for RFC {n} to `rfcs/{n}.plan.md`: an ordered list of subtasks, each line "
                    "`- [ ] <k>. <text>`, each expected to change under 400 lines. Open one PR with `open_pr` "
                    f"(rfc `{n}`, class `{r['class']}`, files `[\"rfcs/{n}.plan.md\"]`). Do not write code in this session.\n\n{head}")
            out.append(Asg(agent, "implement", "plan", body, rfc=n))
        else:
            pr_branch = prs.get(str(item["pr"]), {}).get("branch") if item["pr"] else None
            diff = repo.diff(pr_branch) if pr_branch else None
            how = (f"Update PR {item['pr']} with `update_pr`." if item["pr"]
                   else f"No PR yet: open one with `open_pr` (rfc `{n}`, subtask `{item['subtask']}`).")
            body = (f"Implement subtask {item['subtask']} of RFC {n}: {item['text']}\n"
                    f"{how} In `files`, include the code, spec, grammar, conformance tests and examples this subtask needs, "
                    f"and tick its line in `rfcs/{n}.plan.md` (`- [x]`). Keep the change under 400 changed lines.\n\n"
                    f"## Plan\n{item['plan']}\n\n{head}\n## Current PR diff\n{diff or '(no diff yet)'}\n")
            out.append(Asg(agent, "implement", "subtask", body, rfc=n, subtask=item["subtask"], pr=item["pr"]))
            if testers and not any(a.kind == "tests" for a in out):  # one tester session per phase
                out.append(Asg(testers[0], "implement", "tests", (
                    f"Write the conformance cases for subtask {item['subtask']} of RFC {n}: {item['text']}\n"
                    f"Post one `comment` on the RFC (target `{{\"rfc\": \"{n}\"}}`) listing each case as input, "
                    "expected output and expected exit code. Do not write code.\n\n"
                    f"## Plan\n{item['plan']}\n\n{head}"), rfc=n, subtask=item["subtask"]))
    return out


def plan_review(ctx) -> list[Asg]:
    prs, rules, repo = ctx.state.get("prs", {}), ctx.rules, ctx.repo
    reviewers = _roles(ctx.roster, "reviewer")
    if not reviewers:
        return []
    rev = reviewers[0]
    ready = []
    for n in by_num(prs):
        p = prs[n]
        if p.get("status") != "open" or any(r.get("agent") == rev and r.get("sha") == p.get("head_sha")
                                            for r in p.get("reviews", [])):
            continue
        check = _latest_check(ctx.events, n, p.get("head_sha"))
        rules_ok = check and check["data"].get("rules") and all(  # 14 is the review itself
            v.get("ok") for k, v in check["data"]["rules"].items() if k != "14")
        if rules_ok:
            ready.append(n)
    ready = ready[:int(rules.get("max_gated_prs_per_cycle", 2))]
    if not ready:
        return []
    parts = []
    for n in ready:
        p = prs[n]
        parts.append(f"### PR {n} (branch {p.get('branch')}, class {p.get('class')}, rfc {p.get('rfc') or '-'})\n\n"
                     f"```diff\n{repo.diff(p.get('branch')) or '(diff unavailable)'}\n```\n")
    body = "Review each PR below with one `review` action (approve or request_changes). Correctness and scope only.\n\n" + "\n".join(parts)
    return [Asg(rev, "review", "review", body, prs=[int(x) for x in ready])]


def plan_use(ctx) -> list[Asg]:
    card = ctx.repo.read("spec/card.md")
    if card is None:
        return []
    out = []
    for u in _roles(ctx.roster, "user"):
        out.append(Asg(u, "use", "use", (
            "Write three small programs that solve everyday tasks, using only the spec card and CLI below. "
            "Run each with `bin/glyphc check` and `bin/glyphc run`. For each confusion or failure, file one issue "
            "with `open_issue` (title, body with the program and the message you got, labels []). "
            "Do not guess at undocumented syntax; report it instead.\n\n"
            f"## Spec card\n{card}\n\n## CLI\n{CLI_DOC}")))
    return out


def plan_scribe(ctx) -> list[Asg]:
    scribes = _roles(ctx.roster, "scribe")
    if not scribes:
        return []
    recent = ctx.events[-60:]
    lines = [f"- {e.get('seq')} {e.get('ts')} {e.get('type')} {e.get('actor')} {canon(e.get('subject'))}" for e in recent]
    body = ("Write tonight's digest with one `digest` action: plain language, what was proposed, voted, "
            "implemented, merged, refused or failed. Quote no agent text longer than one sentence.\n\n"
            "## Recent events\n" + ("\n".join(lines) or "(none)"))
    return [Asg(scribes[0], "scribe", "digest", body)]


def plan_architect(ctx) -> list[Asg]:
    arch = _roles(ctx.roster, "architect")
    if not arch:
        return []
    rfcs, repo = ctx.state.get("rfcs", {}), ctx.repo
    open_ = [n for n in by_num(rfcs) if rfcs[n]["status"] in ("discussion", "voting")][:5]
    spec = "\n".join(f"### {p}\n{repo.read(p) or ''}" for p in repo.list("spec/core"))
    body = ("Post one coherence comment on each open RFC below (overlaps, conflicts with accepted RFCs or the "
            "constitution, simpler alternatives). File contradictions between spec sections as `open_issue`. "
            "You may open a PR that only touches `architecture/` to update ROADMAP.md.\n\n"
            + "".join(rfc_block(repo, n, rfcs[n]) for n in open_)
            + f"\n## Spec core\n{spec[:40000]}\n\n## Findings\n{findings_text(repo)}\n\n## Roadmap\n{roadmap_top(repo)}\n")
    return [Asg(arch[0], "architect", "architect", body, rfcs=open_)]


def plan_architect_weekly(ctx) -> list[Asg]:
    arch = _roles(ctx.roster, "architect-weekly")
    esc = ctx.escalations[:int(ctx.rules.get("weekly_architect_max_escalations", 3))]
    sunday = datetime.date.fromisoformat(ctx.run_date).weekday() == 6
    if not arch or not (esc or sunday):
        return []
    rfcs, repo = ctx.state.get("rfcs", {}), ctx.repo
    parts = []
    if sunday:
        parts.append(f"Write the weekly whole-language audit to `architecture/reviews/{ctx.run_date}.md` "
                     "(what to simplify or remove, where structure is decaying, whether the roadmap order is right) "
                     "through one `open_pr` touching only `architecture/`.")
    for e in esc:
        r = rfcs.get(e["rfc"], {})
        parts.append(f"Escalation: RFC {e['rfc']} subtask {e['subtask']}. Failure notes: {e['notes']}. "
                     "Take it: implement the subtask on the RFC branch through the same gate, or comment why it cannot be built.\n\n"
                     + rfc_block(repo, e["rfc"], r))
    return [Asg(arch[0], "architect-weekly", "weekly", "\n\n".join(parts), rfcs=[e["rfc"] for e in esc])]


PLANNERS = {
    "design": plan_design, "vote": plan_vote, "implement": plan_implement, "review": plan_review,
    "use": plan_use, "scribe": plan_scribe, "architect": plan_architect, "architect-weekly": plan_architect_weekly,
}


class Ctx:
    def __init__(self, phase, state, rules, roster, repo, run_date, events):
        self.phase, self.state, self.rules, self.roster = phase, state, rules, roster
        self.repo, self.run_date, self.events = repo, run_date, list(events)
        self.live = milestone_no(rules) >= 2
        self.escalations = escalation_items(state, rules)


def plan(phase, *, state, rules, roster, repo, run_date, events=()) -> list[Asg]:
    """Pure decision function. Same inputs, same output."""
    if phase not in PHASES:
        raise ValueError(f"unknown phase {phase!r}")
    if milestone_no(rules) == 0:  # M0: no agents run
        return []
    ctx = Ctx(phase, state, rules, roster, repo, run_date, events)
    return PLANNERS[phase](ctx)


def write(outdir: Path, asgs: list[Asg], run_date: str, cycle: int) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    entries = []
    for a in asgs:
        c = 0 if a.phase in ARCH_PHASES else cycle
        session = f"{run_date}/c{c}/{a.phase}/{a.agent}"
        text = f"<!-- assignment {canon(a.header)} -->\n\n{a.body}\n"
        (outdir / f"{a.agent}.md").write_text(text, encoding="utf-8")
        entries.append({"agent": a.agent, "session": session, "phase": a.phase, "file": f"{a.agent}.md"})
    (outdir / "assignments.json").write_text(
        json.dumps(entries, sort_keys=True, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--phase", required=True, choices=PHASES)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = ap.parse_args(argv)
    from tools.lib.audit import load_events  # lazy: tests never touch tools/lib
    from tools.lib.rules import load_rules
    from tools.lib.state import load_state

    root = args.root
    roster = yaml.safe_load((root / "governance" / "roster.yml").read_text(encoding="utf-8"))["agents"]
    run_date = os.environ.get("RUN_DATE") or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    cycle = int(os.environ.get("CYCLE") or 1)
    base = os.environ.get("BASE_BRANCH") or "main"
    asgs = plan(args.phase, state=load_state(root), rules=load_rules(root), roster=roster,
                repo=Repo(root, base), run_date=run_date, events=load_events(root))
    write(args.out, asgs, run_date, cycle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
