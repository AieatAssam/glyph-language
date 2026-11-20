"""Deterministic merge bot. No LLM makes any decision here.

Usage: python -m tools.mergebot <open|ingest|decide|merge|close|close-pr|verify|bootstrap|bench|fixedpoint|cutover> [args]
Root is $GLYPH_ROOT, else the current directory. Timestamps come from $GLYPH_TS or RUN_DATE.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

import yaml

from bench.harness import common as BC, findings, score
from tools.lib import audit, gh, gitops, rfc as F, roster as RO, rules as R
from tools.lib import state as S

OWNER_KINDS = {
    "governance/RULES.md": "rules_changed",
    "governance/roster.yml": "roster_changed",
    "governance/CONSTITUTION.md": "constitution_changed",
}


# ---- time and identity -------------------------------------------------------

def run_date() -> str:
    return os.environ.get("RUN_DATE") or datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def cycle_id() -> str:
    return audit.cycle_id(run_date(), os.environ.get("CYCLE", "1"))


def now_ts() -> str:
    return os.environ.get("GLYPH_TS") or f"{run_date()}T00:00:00Z"


def _emit(root, type, subject, data, idem, actor="mergebot"):
    return audit.append_event(root, type=type, actor=actor, session=f"{cycle_id()}/bot/mergebot",
                              subject=subject, data=data, ts=now_ts(), idem=idem)


# ---- open: owner changes and the cycle marker --------------------------------

def owner_scan(root) -> int:
    """Record protected-path commits made by the owner since the last owner event. Returns count."""
    owner = [e for e in audit.load_events(root) if e["type"] in set(OWNER_KINDS.values())
             | {"protected_path_changed"}]
    since = owner[-1]["data"].get("commit") if owner else None
    rng = f"{since}..HEAD" if since else "HEAD"
    shas = gitops.git(root, "rev-list", "--reverse", rng).split()
    count = 0
    for sha in shas:
        body = gitops.git(root, "show", "-s", "--format=%B", sha)
        if "Bot: mergebot" in body:
            continue
        for n in re.findall(r"^Owner-Supersedes-RFC: (\d{4})\s*$", body, re.M):
            if _emit(root, "rfc_superseded", {"rfc": n}, {"rfc": n, "commit": sha, "reason": "owner"},
                     f"owner:{sha}:supersede:{n}"):
                count += 1
        for path in gitops.git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", sha).split():
            if not R.is_protected(path):
                continue
            kind = OWNER_KINDS.get(path, "protected_path_changed")
            if _emit(root, kind, {}, {"commit": sha, "path": path}, f"owner:{sha}:{path}"):
                count += 1
    return count


def cmd_open(root, night=False) -> dict:
    """Verify the chain and record owner changes. A cycle also records its start.

    Each job checks out base fresh, so the audit commit is pushed here, before the next job runs.
    """
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    out = {"owner_events": owner_scan(root)}
    if not night:
        cycle = cycle_id()
        _emit(root, "cycle_started", {}, {"cycle": cycle}, f"cycle:{cycle}")
        out["cycle"] = cycle
    out["commit"] = gitops.commit_all(root, "Audit: open\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    return out


def cmd_bootstrap(root, wasm) -> dict:
    """Install a built self-compiler as compiler/bootstrap/glyphc.wasm. Copies and hashes it; never runs it."""
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    data = Path(wasm).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    dest = Path(root) / "compiler" / "bootstrap" / "glyphc.wasm"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    _emit(root, "release", {}, {"artifact": "compiler/bootstrap/glyphc.wasm", "sha256": digest,
                                "bytes": len(data)}, f"bootstrap:{digest}")
    sha = gitops.commit_all(root, "Audit: bootstrap compiler\n\nBot: mergebot",
                            paths=["audit", "compiler/bootstrap"])
    gitops.remote_sync(root)
    return {"installed": "compiler/bootstrap/glyphc.wasm", "sha256": digest, "commit": sha}


# ---- ingest: publisher events, sessions, audit commit ------------------------

def _load_pub_lines(path: Path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def cmd_ingest(root, pubdirs) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    thresholds = _rules(root)
    appended = refused = 0
    for pub in map(Path, pubdirs):
        for ev in _load_pub_lines(pub / "events.jsonl"):
            st = S.load_state(root)
            subject = ev.get("subject") or {}
            if ev["type"] == "rfc_opened":
                reason = F.open_refusal(st, ev["actor"], ev["data"].get("slug", ""), thresholds)
                if reason:
                    refused += 1
                    _emit(root, "escalation", subject,
                          {"kind": "open_refused", "reason": reason, "agent": ev["actor"]},
                          f"refuse:{ev.get('idem')}")
                    if ev["data"].get("pr"):
                        gh.pr_close(int(ev["data"]["pr"]), f"Refused: {reason}.", cwd=root)
                    continue
            if audit.append_event(root, type=ev["type"], actor=ev["actor"], session=ev["session"],
                                  subject=subject, data=ev.get("data") or {}, ts=ev["ts"],
                                  idem=ev.get("idem")):
                appended += 1
        for sess in sorted((pub / "sessions").glob("*")) if (pub / "sessions").exists() else []:
            meta = json.loads((sess / "session.json").read_text(encoding="utf-8"))
            tpath = sess / "transcript.jsonl"
            digest = hashlib.sha256(tpath.read_bytes()).hexdigest() if tpath.exists() else None
            kind = "session_ended" if meta["outcome"] == "ok" else "session_failed"
            data = {"outcome": meta["outcome"], "usage": meta.get("usage", {}),
                    "transcript_sha256": digest}
            if audit.append_event(root, type=kind, actor=meta["agent"], session=meta["session"],
                                  subject={}, data=data, ts=meta.get("ended") or now_ts(),
                                  idem=f"session:{meta['session']}"):
                appended += 1
            if tpath.exists():
                dest = Path(root) / "audit" / "transcripts" / f"{meta['session']}.jsonl.gz"
                dest.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(dest, "wb") as f:
                    f.write(tpath.read_bytes())
    sha = gitops.commit_all(root, "Audit: ingest\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    return {"appended": appended, "refused": refused, "commit": sha}


# ---- decide: RFC lifecycle and votes ----------------------------------------

def _rules(root) -> dict:
    return R.load_rules(root)


def _set_status(root, n, to, reason):
    st = S.load_state(root)
    frm = st["rfcs"][n]["status"]
    return _emit(root, "rfc_status", {"rfc": n},
                 {"rfc": n, "from": frm, "to": to, "reason": reason},
                 f"rfc:{n}:{frm}>{to}:{st['head_hash']}")


def _front_matter_file(text: str, status: str, votes: dict) -> str:
    fm, body = {}, text
    if text.startswith("---\n") and "\n---\n" in text[4:]:
        head, body = text[4:].split("\n---\n", 1)
        fm = yaml.safe_load(head) or {}
    fm["status"] = status
    fm["votes"] = {a: v["vote"] for a, v in sorted(votes.items())}
    return "---\n" + yaml.safe_dump(fm, sort_keys=True) + "---\n" + body


def _write_rfc_file(root, n, rec, status, votes, ref):
    slug = rec["slug"]
    src = None
    if ref:
        for cand in (f"rfcs/draft-{slug}.md", f"rfcs/{n}-{slug}.md"):
            try:
                src = gitops.git(root, "show", f"{ref}:{cand}")
                break
            except RuntimeError:
                continue
    if src is None:
        src = f"---\ntitle: {rec.get('title')}\n---\n"
    out = Path(root) / "rfcs" / f"{n}-{slug}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(_front_matter_file(src, status, votes), encoding="utf-8")


def cmd_decide(root) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    rules = _rules(root)
    voters = RO.voters(RO.load_roster(root))
    decided, moved = [], []
    for n in sorted(S.load_state(root)["rfcs"]):
        st = S.load_state(root)
        rec = st["rfcs"][n]
        if rec["status"] == "discussion" and F.discussion_done(st, rec, rules):
            _set_status(root, n, "voting", "discussion window closed")
            moved.append(n)
        elif rec["status"] == "voting" and F.voting_done(st, rec, rules):
            res = F.tally(rec, voters, rules)
            _emit(root, "rfc_decided", {"rfc": n},
                  {"rfc": n, "outcome": res["outcome"], "accepted_super": res["accepted_super"],
                   "reason": res["reason"], "approve": res["approve"], "reject": res["reject"],
                   "abstain": res["abstain"]}, f"decided:{n}")
            ref = gitops.branch_ref(root, f"agent/rfc-{n}")
            _write_rfc_file(root, n, rec, res["outcome"], rec["votes"], ref)
            d = Path(root) / "audit" / "decisions"
            d.mkdir(parents=True, exist_ok=True)
            (d / f"{n}.md").write_text(F.decision_record(n, rec, res, run_date()), encoding="utf-8")
            if rec.get("pr"):
                gh.pr_close(int(rec["pr"]), f"RFC {n} {res['outcome']}: {res['reason']}.", cwd=root)
            decided.append((n, res["outcome"]))
    # Accepted RFCs start implementing while there is room; overdue ones lapse.
    st = S.load_state(root)
    for n in sorted(st["rfcs"]):
        rec = st["rfcs"][n]
        if rec["status"] == "implementing" and F.implementing_lapsed(st, rec, rules):
            _emit(root, "rfc_lapsed", {"rfc": n}, {"rfc": n, "reason": "implementing window expired"},
                  f"lapsed:{n}")
    st = S.load_state(root)
    for n in sorted(st["rfcs"]):
        if st["rfcs"][n]["status"] == "accepted" and F.implementing_count(st) < rules["max_implementing"]:
            _set_status(root, n, "implementing", "capacity available")
            st = S.load_state(root)
    sha = gitops.commit_all(root, "Audit: decide\n\nBot: mergebot", paths=["audit", "rfcs"])
    gitops.remote_sync(root)
    return {"decided": decided, "to_voting": moved, "commit": sha}


# ---- merge: gate rules 1 to 14, one PR per call -----------------------------

def _bump(version: str, minor: bool) -> str:
    major, mi, pa = (int(x) for x in version.split("."))
    return f"{major}.{mi + 1}.0" if minor else f"{major}.{mi}.{pa + 1}"


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _stale(root, check) -> bool:
    """True when base moved, outside audit/, since the check ran."""
    out = gitops.git(root, "diff", "--name-only", f"{check['base_sha']}..HEAD", "--", ".",
                     ":(exclude)audit")
    return bool(out.strip())


def _stability(root) -> dict:
    """Inputs to the stability window in gate rule 2: self-hosting, the last breaking merge, tonight."""
    active_file = Path(root) / "compiler" / "ACTIVE"
    active = active_file.read_text(encoding="utf-8").strip() if active_file.exists() else "stage0"
    breaking = [e["ts"][:10] for e in audit.load_events(root)
                if e["type"] == "merged" and (e.get("data") or {}).get("breaking")]
    return {"self_hosted": active == "self", "last_breaking": max(breaking) if breaking else None,
            "today": run_date()}


def cmd_merge(root, checkdir, benchdir=None) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    rules = _rules(root)
    roster = RO.load_roster(root)
    st = S.load_state(root)
    stab = _stability(root)
    for n in sorted(st["prs"], key=int):
        pr = st["prs"][n]
        if pr["status"] != "open":
            continue
        check = _read_json(Path(checkdir) / f"{n}.json")
        if check is None or check.get("sha") != pr["head_sha"]:
            continue
        if _stale(root, check):
            continue
        rfc = st["rfcs"].get(pr["rfc"]) if pr.get("rfc") else None
        bench = _read_json(Path(benchdir) / f"{n}.json") if benchdir else None
        ctx = {
            "pr": {"class": pr["class"], "role": RO.role_of(roster, pr["author"]),
                   "rfc_present": rfc is not None, "rfc_status": rfc["status"] if rfc else None,
                   "rfc_accepted_super": bool(rfc and rfc.get("accepted_super")),
                   "breaking": bool(rfc and rfc.get("breaking")),
                   "changed_files": gitops.changed_files(root, check["base_sha"], check["sha"]),
                   "head_sha": pr["head_sha"], "reviews": pr["reviews"]},
            "check_rules": {k: v.get("ok") for k, v in check.get("rules", {}).items()},
            "check_details": {k: v.get("detail", "") for k, v in check.get("rules", {}).items()},
            "tests_altered": gitops.removed_test_lines(root, check["base_sha"], check["sha"]),
            "bench": bench,
            "stability": stab,
        }
        results = R.evaluate_gate(ctx, rules)
        _emit(root, "check_run", {"pr": int(n)},
              {"pr": int(n), "sha": check["sha"], "base_sha": check["base_sha"],
               "rules": {str(r["rule"]): {"ok": r["ok"], "detail": r["reason"]} for r in results}},
              f"check:{n}:{check['sha']}:{check['base_sha']}")
        failed = R.first_failure(results)
        if failed:
            # Mid-plan (unticked subtasks on the head) a PR is expected to fail: not a stuck subtask.
            counts = pr.get("subtask") is not None and not _plan_open(root, pr.get("rfc"), check["sha"])
            _emit(root, "gate_blocked", {"pr": int(n)},
                  {"pr": int(n), "rule": failed["rule"], "reason": failed["reason"],
                   "subtask": pr.get("subtask") if counts else None},
                  f"blocked:{n}:{check['sha']}:{failed['rule']}")
            if counts:
                st2 = S.load_state(root)
                count = st2["prs"][n]["subtask_failures"].get(str(pr["subtask"]), 0)
                if count >= rules["escalation_failures"]:
                    _emit(root, "escalation", {"pr": int(n)},
                          {"kind": "subtask_stuck", "rfc": pr.get("rfc"), "subtask": pr["subtask"],
                           "failures": count},
                          f"stuck:{n}:{count}")
            continue
        return _merge_one(root, n, pr, rfc, check, rules)
    # Nothing merged: still publish the check_run and gate_blocked events (review planning reads them).
    sha = gitops.commit_all(root, "Audit: gate\n\nBot: mergebot", paths=["audit"])
    if sha:
        gitops.remote_sync(root)
    return {"merged": None, "commit": sha}


UNTICKED = re.compile(r"^\s*- \[ \]", re.M)
PLAN_FILE_RE = re.compile(r"rfcs/(\d{4})\.plan\.md")


def _plan_open(root, rfc, sha) -> bool:
    """True when rfcs/<rfc>.plan.md at sha still has an unticked subtask."""
    text = gitops.git(root, "show", f"{sha}:rfcs/{rfc}.plan.md", check=False) if rfc else ""
    return bool(UNTICKED.search(text))


def _merge_one(root, n, pr, rfc, check, rules) -> dict:
    sha_head = check["sha"]
    vpath = Path(root) / "spec" / "VERSION"
    current = vpath.read_text(encoding="utf-8").strip() if vpath.exists() else "0.0.0"
    files = gitops.changed_files(root, check["base_sha"], sha_head)
    plan_only = bool(files) and all(R.PLAN_RE.fullmatch(f) for f in files)
    gitops.git(root, "merge", "--squash", sha_head)
    # Implemented once a non-plan PR lands with every subtask of the plan ticked.
    plan = Path(root) / "rfcs" / f"{pr.get('rfc')}.plan.md"
    rfc_implemented = (bool(pr.get("rfc")) and not plan_only and plan.exists()
                       and not UNTICKED.search(plan.read_text(encoding="utf-8")))
    # Several founding RFCs share one PR: every plan it touches that is fully ticked is implemented too.
    touched = {m.group(1) for f in files if (m := PLAN_FILE_RE.fullmatch(f))}
    if pr.get("rfc"):
        touched.add(str(pr["rfc"]))
    rfcs_implemented = [] if plan_only else sorted(
        k for k in touched if (Path(root) / "rfcs" / f"{k}.plan.md").exists()
        and not UNTICKED.search((Path(root) / "rfcs" / f"{k}.plan.md").read_text(encoding="utf-8")))
    new_version = current
    if not plan_only:  # a plan changes no language artefact
        new_version = _bump(current, (rfc_implemented or bool(rfcs_implemented))
                            and pr["class"] in ("language", "stdlib"))
        vpath.parent.mkdir(parents=True, exist_ok=True)
        vpath.write_text(new_version + "\n", encoding="utf-8")
    trailers = ["Bot: mergebot", "Gate: rules 1-14 pass", f"PR: {n}", f"Check-Sha: {sha_head}"]
    if pr.get("rfc"):
        trailers.append(f"RFC: {pr['rfc']}")
    # The agents who wrote the branch sign the merge: PR author as author, the rest as co-authors.
    authors = gitops.git(root, "log", "--format=%an <%ae>", f"{check['base_sha']}..{sha_head}",
                         check=False).splitlines()
    lead = next((a for a in authors if a.startswith(f"{pr['author']} <")), None)
    for a in dict.fromkeys(authors):
        if a != lead and not a.startswith("glyph-"):
            trailers.append(f"Co-authored-by: {a}")
    msg = f"Merge PR #{n} ({pr['class']})\n\n" + "\n".join(trailers)
    gitops.git(root, "add", "-A", "--", ".")
    gitops.git(root, "commit", "-m", msg, "--no-verify", *(["--author", lead] if lead else []))
    merge_sha = gitops.git(root, "rev-parse", "HEAD").strip()
    _emit(root, "merged", {"pr": int(n)},
          {"sha": merge_sha, "class": pr["class"], "spec_after": new_version,
           "rfc_implemented": rfc_implemented, "rfcs_implemented": rfcs_implemented,
           "breaking": bool(rfc and rfc.get("breaking"))},
          f"merged:{n}:{merge_sha}")
    gitops.commit_all(root, "Audit: merged PR\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    if not gh.dry():
        gh.pr_merged(int(n), merge_sha, cwd=root)
    return {"merged": int(n), "sha": merge_sha, "spec_version": new_version}


# ---- close: daily digest, transcripts to orphan branch, tag ------------------

def close_pr(root, n: int, reason: str) -> dict:
    """Close an agent PR on GitHub and record pr_closed. A repeat call for the same PR does nothing."""
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    if any(e.get("idem") == f"close:{n}" for e in audit.load_events(root)):
        return {"pr": n, "closed": False}
    gh.pr_close(int(n), reason, cwd=root)
    _emit(root, "pr_closed", {"pr": int(n)}, {"reason": reason}, f"close:{n}")
    gitops.commit_all(root, f"Audit: close PR {n}\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    return {"pr": n, "closed": True}


def cmd_close(root) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    day = run_date()
    events = [e for e in audit.load_events(root) if e["ts"][:10] == day]
    lines = [f"# Daily record {day}", ""]
    for e in events:
        if e["type"] == "digest_published":
            lines += [f"## {e['data'].get('title', '')}", "", e["data"].get("body", ""), ""]
    daily = Path(root) / "audit" / "daily" / f"{day}.md"
    daily.parent.mkdir(parents=True, exist_ok=True)
    daily.write_text("\n".join(lines), encoding="utf-8")
    release = any(e["type"] == "merged" for e in events)
    # Transcripts go to the orphan branch audit-transcripts, not to base.
    tdir = Path(root) / "audit" / "transcripts"
    files = sorted(p for p in tdir.rglob("*") if p.is_file()) if tdir.exists() else []
    if files:
        _push_transcripts(root, files, day)
        shutil.rmtree(tdir)
    gitops.commit_all(root, f"Audit: close {day}\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)  # tag only what reached the base branch
    tag = f"audit-{day}"
    if gitops.git(root, "tag", "-l", tag).strip() and os.environ.get("GLYPH_RUN"):
        tag = f"audit-{day}-r{os.environ['GLYPH_RUN']}"  # a later run on the same date keeps its own tag
    if not gitops.git(root, "tag", "-l", tag).strip():
        gitops.git(root, "tag", "-a", tag, "-m", f"audit head {S.load_state(root)['head_hash']}")
        if not gh.dry():
            gitops.git(root, "push", "origin", tag)
    return {"daily": str(daily), "tag": tag, "release": release}


def _push_transcripts(root, files, day):
    env_index = Path(root) / ".git" / f"index-transcripts-{day}"
    env = dict(gitops.git_env(), GIT_INDEX_FILE=str(env_index))
    import subprocess

    def g(*args, input_text=None):
        res = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True,
                             env=env, input=input_text)
        if res.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)}: {res.stderr.strip()}")
        return res.stdout.strip()

    try:
        for f in files:
            blob = gitops.git(root, "hash-object", "-w", str(f)).strip()
            rel = f.relative_to(Path(root) / "audit" / "transcripts")
            g("update-index", "--add", "--cacheinfo", f"100644,{blob},{day}/{rel.as_posix()}")
        tree = g("write-tree")
        parent = gitops.git(root, "rev-parse", "-q", "--verify", "refs/heads/audit-transcripts",
                            check=False).strip()
        args = ["commit-tree", tree, "-m", f"Transcripts {day}\n\nBot: mergebot"]
        if parent:
            args += ["-p", parent]
        commit = g(*args)
        g("update-ref", "refs/heads/audit-transcripts", commit)
    finally:
        if env_index.exists():
            env_index.unlink()


# ---- verify ------------------------------------------------------------------

def cmd_verify(root) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        return {"ok": False, "first_bad_seq": bad}
    st = S.load_state(root)
    return {"ok": True, "events": len(audit.load_events(root)), "head_hash": st["head_hash"]}


# ---- bench, fixed point, cutover ---------------------------------------------

CUTOVER_NIGHTS = 3


def overfit_breach(gaps: list, limit: float, nights: int) -> bool:
    """True when the last `nights` nightly gaps (dev minus held-out) all exceed `limit`."""
    recent = gaps[-nights:]
    return len(recent) == nights and all(g > limit for g in recent)


def _bench_gaps(root) -> list:
    rows = [e["data"] for e in audit.load_events(root)
            if e["type"] == "bench_run" and (e.get("data") or {}).get("scope") == "nightly"
            and e["data"].get("heldout_fitness") is not None]
    return [d["dev_fitness"] - d["heldout_fitness"] for d in rows]


def _model_baseline(root):
    model = BC.load_rules()["bench"]["model"]
    return model, _read_json(Path(root) / "bench" / "baselines" / f"{model}.json")


def _bench_gate(root, res: Path) -> dict:
    done = []
    for path in sorted(res.glob("*.json")):
        v = _read_json(path)
        _emit(root, "bench_run", {"pr": v["pr"]},
              {"scope": "gate", "pr": v["pr"], "fitness": v["fitness"], "baseline": v["baseline"],
               "delta": v["delta"], "pass": v["pass"], "attempt": v["attempt"]},
              f"bench:gate:{v['pr']}:{cycle_id()}:{v['attempt']}")
        done.append(v["pr"])
    return {"scope": "gate", "prs": done}


def _bench_baseline(root, res: Path) -> dict:
    model = BC.load_rules()["bench"]["model"]
    data = score.compute(res)
    dest = Path(root) / "bench" / "baselines" / f"{model}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    _emit(root, "bench_run", {}, {"scope": "baseline", "model": model, "fitness": data["fitness"]},
          f"bench:baseline:{run_date()}")
    sha = gitops.commit_all(root, "Audit: bench baseline\n\nBot: mergebot",
                            paths=["audit", "bench/baselines"])
    gitops.remote_sync(root)
    return {"scope": "baseline", "model": model, "fitness": data["fitness"], "commit": sha}


def _bench_nightly(root, res: Path, heldout) -> dict:
    rules = BC.load_rules()["bench"]
    day = run_date()
    _, base = _model_baseline(root)
    dev = score.compute(res, base)
    totals = _read_json(Path(heldout)) if heldout else None
    if heldout and totals is None:
        raise SystemExit(f"held-out totals not readable: {heldout}")
    out = Path(root) / "audit" / "bench" / day
    if (out / "findings.md").exists():
        raise SystemExit(f"{day} already recorded")
    out.mkdir(parents=True, exist_ok=True)
    shutil.copytree(res, out / "dev", dirs_exist_ok=True)
    (out / "dev.json").write_text(json.dumps(dev, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    if totals is not None:  # held-out contributes totals only
        (out / "heldout.json").write_text(json.dumps(totals, sort_keys=True, indent=1) + "\n",
                                          encoding="utf-8")
    findings.write(res, totals, out / "findings.md")
    _emit(root, "bench_run", {}, {"scope": "nightly", "dev_fitness": dev["fitness"],
                                  "heldout_fitness": totals["fitness"] if totals else None},
          f"bench:nightly:{day}")
    warned = False
    if totals is not None:
        gaps = _bench_gaps(root)
        if overfit_breach(gaps, rules["overfit_gap"], rules["overfit_nights"]):
            _emit(root, "overfit_warning", {}, {"gap": gaps[-1], "limit": rules["overfit_gap"],
                                                "nights": rules["overfit_nights"]}, f"overfit:{day}")
            warned = True
    sha = gitops.commit_all(root, "Audit: bench nightly\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    return {"scope": "nightly", "dev_fitness": dev["fitness"],
            "heldout_fitness": totals["fitness"] if totals else None, "overfit_warning": warned,
            "commit": sha}


def cmd_bench(root, resultsdir, scope, heldout=None) -> dict:
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    res = Path(resultsdir)
    if scope == "gate":
        out = _bench_gate(root, res)
        sha = gitops.commit_all(root, "Audit: bench gate\n\nBot: mergebot", paths=["audit"])
        gitops.remote_sync(root)
        return {**out, "commit": sha}
    if scope == "baseline":
        return _bench_baseline(root, res)
    return _bench_nightly(root, res, heldout)


def cmd_fixedpoint(root, check_path) -> dict:
    """Record a passed fixed point (B == C) for the sha the base-check ran on."""
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    check = _read_json(Path(check_path))
    if check is None:
        raise SystemExit(f"no check result at {check_path}")
    fp = (check.get("stats") or {}).get("fixed_point") or {}
    if not fp.get("B") or fp.get("B") != fp.get("C"):
        raise SystemExit("fixed point not reached: B and C must match")
    hashes = {"A": fp.get("A"), "B": fp["B"], "C": fp["C"]}
    _emit(root, "fixed_point_passed", {}, {"sha": check["sha"], "hashes": hashes},
          f"fixedpoint:{run_date()}:{check['sha']}")
    sha = gitops.commit_all(root, "Audit: fixed point\n\nBot: mergebot", paths=["audit"])
    gitops.remote_sync(root)
    return {"sha": check["sha"], "B": fp["B"], "commit": sha}


def _consecutive_fixed_point_nights(root, need: int) -> bool:
    days = sorted({e["ts"][:10] for e in audit.load_events(root) if e["type"] == "fixed_point_passed"})
    last = [datetime.date.fromisoformat(d) for d in days][-need:]
    return len(last) == need and all((b - a).days == 1 for a, b in zip(last, last[1:]))


def cmd_cutover(root, artifacts) -> dict:
    """Switch ACTIVE to self and commit the fixed-point binary. The binary is hashed, never run."""
    ok, bad = audit.verify_chain(root)
    if not ok:
        raise SystemExit(f"audit chain broken at seq {bad}")
    active_file = Path(root) / "compiler" / "ACTIVE"
    active = active_file.read_text(encoding="utf-8").strip() if active_file.exists() else "stage0"
    if active != "stage0":
        return {"skipped": f"ACTIVE is {active!r}, cutover runs once from stage0"}
    if not _consecutive_fixed_point_nights(root, CUTOVER_NIGHTS):
        return {"skipped": f"fewer than {CUTOVER_NIGHTS} consecutive nights with fixed_point_passed"}
    last = [e for e in audit.load_events(root) if e["type"] == "fixed_point_passed"][-1]
    expected = last["data"]["hashes"]["B"]
    data = (Path(artifacts) / "B.wasm").read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected:
        raise SystemExit(f"B.wasm sha256 {digest[:12]} does not match the passed fixed point {expected[:12]}")
    dest = Path(root) / "compiler" / "bootstrap" / "glyphc.wasm"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    active_file.write_text("self\n", encoding="utf-8")
    _emit(root, "cutover", {}, {"artifact": "compiler/bootstrap/glyphc.wasm", "sha256": digest,
                                "bytes": len(data), "active": "self",
                                "fixed_point_sha": last["data"]["sha"]}, f"cutover:{digest}")
    sha = gitops.commit_all(root, "Audit: cutover to self-hosted compiler\n\nBot: mergebot",
                            paths=["audit", "compiler/bootstrap", "compiler/ACTIVE"])
    gitops.remote_sync(root)
    return {"active": "self", "sha256": digest, "commit": sha}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m tools.mergebot")
    sub = p.add_subparsers(dest="cmd", required=True)
    op = sub.add_parser("open")
    op.add_argument("--night", action="store_true", help="nightly: verify and owner-scan only")
    ing = sub.add_parser("ingest")
    ing.add_argument("pubdirs", nargs="+")
    sub.add_parser("decide")
    mg = sub.add_parser("merge")
    mg.add_argument("checkdir")
    mg.add_argument("benchdir", nargs="?")
    sub.add_parser("close")
    cp = sub.add_parser("close-pr")
    cp.add_argument("pr", type=int)
    cp.add_argument("--reason", required=True)
    sub.add_parser("verify")
    bs = sub.add_parser("bootstrap")
    bs.add_argument("wasm")
    bn = sub.add_parser("bench")
    bn.add_argument("resultsdir")
    bn.add_argument("--scope", required=True, choices=["gate", "nightly", "baseline"])
    bn.add_argument("--heldout", help="nightly: held-out totals.json (totals only)")
    fp = sub.add_parser("fixedpoint")
    fp.add_argument("check", help="base-check result.json")
    co = sub.add_parser("cutover")
    co.add_argument("artifacts", help="directory holding B.wasm from the base-check run")
    a = p.parse_args(argv)
    root = Path(os.environ.get("GLYPH_ROOT") or os.getcwd())
    if a.cmd == "open":
        out = cmd_open(root, night=a.night)
    elif a.cmd == "bootstrap":
        out = cmd_bootstrap(root, a.wasm)
    elif a.cmd == "ingest":
        out = cmd_ingest(root, a.pubdirs)
    elif a.cmd == "decide":
        out = cmd_decide(root)
    elif a.cmd == "merge":
        out = cmd_merge(root, a.checkdir, a.benchdir)
    elif a.cmd == "close":
        out = cmd_close(root)
    elif a.cmd == "close-pr":
        out = close_pr(root, a.pr, a.reason)
    elif a.cmd == "bench":
        out = cmd_bench(root, a.resultsdir, a.scope, a.heldout)
    elif a.cmd == "fixedpoint":
        out = cmd_fixedpoint(root, a.check)
    elif a.cmd == "cutover":
        out = cmd_cutover(root, a.artifacts)
    else:
        out = cmd_verify(root)
        print(json.dumps(out, sort_keys=True))
        return 0 if out["ok"] else 1
    print(json.dumps(out, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
