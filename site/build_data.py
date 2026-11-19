#!/usr/bin/env python3
"""Build site/public/data/*.json from repo state.

Usage: python3 site/build_data.py [--root DIR] [--out DIR]

Read-only with respect to the repo (git is only queried). Deterministic: no
wall-clock time, sorted keys. An empty repo yields empty-but-valid JSON.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import yaml

PAGE = 1000
GENESIS = "0" * 64
DONE = {"accepted", "implementing", "implemented"}
DECIDED = DONE | {"rejected"}
EVENT_STATUS = {"rfc_opened": "discussion", "rfc_withdrawn": "withdrawn",
                "rfc_lapsed": "lapsed", "rfc_superseded": "superseded"}
FITNESS_W = {"pass@1": 0.35, "pass@3": 0.15, "repair": 0.15, "read": 0.15,
             "edit@1": 0.10, "token_efficiency": 0.10}
MAX_TEXT = 1_000_000  # bytes per text file copied into the data


# ---- helpers ---------------------------------------------------------------

def canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()
    return o


def put(out: Path, rel: str, obj) -> None:
    p = out / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(canon(clean(obj)))


def git(root: Path, *args: str) -> str:
    """Run a read-only git command; empty string on any failure (no repo, no tags, missing path)."""
    try:
        r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return ""
    return r.stdout.decode("utf-8", "replace") if r.returncode == 0 else ""


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def load_json(p: Path, default=None):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def norm_id(x) -> str | None:
    if x is None:
        return None
    s = str(x).strip()
    return s.zfill(4) if s.isdigit() else s


def front(text: str):
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            try:
                meta = yaml.safe_load(text[4:end]) or {}
            except yaml.YAMLError:
                meta = {}
            return (meta if isinstance(meta, dict) else {}), text[end + 4:].lstrip("\n")
    return {}, text


def fitness(m: dict):
    if not isinstance(m, dict):
        return None
    if isinstance(m.get("fitness"), (int, float)):
        return m["fitness"]
    if all(isinstance(m.get(k), (int, float)) for k in FITNESS_W):
        return round(sum(w * m[k] for k, w in FITNESS_W.items()) * 100, 3)
    return None


def semver_key(v: str):
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.+-]", v))


def blocks(text: str, rel: str):
    """Split markdown into paragraph blocks on blank lines; fenced code stays whole."""
    out, buf, start, fence = [], [], None, False
    for i, line in enumerate(text.split("\n"), 1):
        if line.lstrip().startswith("```"):
            fence = not fence
        if not fence and not line.strip():
            if buf:
                out.append({"id": f"{rel}:{start}", "file": rel, "line": start, "md": "\n".join(buf)})
                buf, start = [], None
            continue
        if not buf:
            start = i
        buf.append(line)
    if buf:
        out.append({"id": f"{rel}:{start}", "file": rel, "line": start, "md": "\n".join(buf)})
    return out


def load_events(root: Path):
    evs = []
    for line in read(root / "audit" / "events.jsonl").splitlines():
        if line.strip():
            try:
                evs.append(json.loads(line))
            except ValueError:
                evs.append({"type": "corrupt_line", "data": {"raw": line[:200]}})
    return evs


def verify_chain(events):
    prev = GENESIS
    for i, e in enumerate(events):
        body = {k: v for k, v in e.items() if k != "hash"}
        h = hashlib.sha256(canon(body)).hexdigest()
        if e.get("seq") != i + 1 or e.get("prev_hash") != prev or e.get("hash") != h:
            return {"ok": False, "first_bad": e.get("seq", i + 1), "count": len(events), "head": None}
        prev = h
    return {"ok": True, "first_bad": None, "count": len(events), "head": prev if events else None}


def repo_slug(root: Path) -> str:
    s = os.environ.get("GITHUB_REPOSITORY", "")
    if not s:
        m = re.search(r"github\.com[:/]([^/\s]+/[^/\s]+?)(?:\.git)?$",
                      git(root, "remote", "get-url", "origin").strip())
        s = m.group(1) if m else ""
    return s if re.fullmatch(r"[\w.-]+/[\w.-]+", s) else ""


def transcript_for(session: str, slug: str):
    parts = session.split("/")
    if len(parts) < 3:
        return None
    path = f"{parts[0]}/{parts[-2]}/{parts[-1]}.jsonl.gz"
    return {"session": session, "phase": parts[-2], "agent": parts[-1], "path": path,
            "url": f"https://github.com/{slug}/blob/audit-transcripts/{path}" if slug else None}


# ---- sections --------------------------------------------------------------

def build_audit(out, events, slug):
    chain = verify_chain(events)
    pages = (len(events) + PAGE - 1) // PAGE
    put(out, "audit.json", {"chain": chain, "total": len(events), "page_size": PAGE, "pages": pages, "repo": slug,
                            "types": sorted({e.get("type", "") for e in events})})
    for k in range(pages):
        put(out, f"audit/{k}.json", {"page": k, "events": events[k * PAGE:(k + 1) * PAGE]})
    return chain


def build_roles(roster):
    return {a.get("id"): a.get("role") for a in roster if isinstance(a, dict)}


def build_rfcs(root, out, events, roles, slug):
    decisions = {}
    for p in sorted((root / "audit" / "decisions").glob("*.md")):
        decisions[norm_id(p.stem.split("-")[0].split(".")[0])] = read(p)
    rfc_files = {}
    for p in sorted((root / "rfcs").glob("*.md")):
        m = re.match(r"^(\d{4})-([^/]+)\.md$", p.name)
        if m:
            rfc_files[m.group(1)] = (p, m.group(2))
    numbers = set(rfc_files)
    for e in events:
        if e.get("type", "").startswith("rfc_") or e.get("type") == "vote_cast":
            n = norm_id((e.get("subject") or {}).get("rfc"))
            if n:
                numbers.add(n)

    rows = []
    for n in sorted(numbers):
        meta, body, slug_s = {}, "", None
        if n in rfc_files:
            p, slug_s = rfc_files[n]
            meta, body = front(read(p))
        status = meta.get("status") or "discussion"
        mine = []
        for e in events:
            if norm_id((e.get("subject") or {}).get("rfc")) != n and norm_id((e.get("data") or {}).get("rfc")) != n:
                continue
            mine.append(e)
            t = e.get("type")
            if t == "rfc_status":
                status = (e.get("data") or {}).get("to", status)
            elif t == "rfc_decided":
                status = (e.get("data") or {}).get("status") or (e.get("data") or {}).get("to") or status
            elif t in EVENT_STATUS:
                status = EVENT_STATUS[t]
        votes = [{"agent": e.get("actor"), "role": roles.get(e.get("actor")), "vote": (e.get("data") or {}).get("vote"),
                  "rationale": (e.get("data") or {}).get("rationale"), "ts": e.get("ts"), "seq": e.get("seq")}
                 for e in mine if e.get("type") == "vote_cast"]
        comments = [{"agent": e.get("actor"), "role": roles.get(e.get("actor")), "body": (e.get("data") or {}).get("body", ""),
                     "ts": e.get("ts"), "session": e.get("session")}
                    for e in mine if e.get("type") == "comment_posted"]
        prs = [{"number": (e.get("data") or {}).get("pr") or (e.get("subject") or {}).get("pr"),
                "title": (e.get("data") or {}).get("title"), "url": None}
               for e in mine if e.get("type") == "pr_opened"]
        for pr in prs:
            if slug and pr["number"] is not None:
                pr["url"] = f"https://github.com/{slug}/pull/{pr['number']}"
        benches = [(e.get("data") or {}) for e in mine if e.get("type") == "bench_run"]
        tally = {"approve": 0, "reject": 0, "abstain": 0}
        for v in votes:
            if v["vote"] in tally:
                tally[v["vote"]] += 1
        author = meta.get("author") or next((e.get("actor") for e in mine if e.get("type") == "rfc_opened"), None)
        detail = {"number": n, "title": meta.get("title") or slug_s or n, "slug": slug_s, "status": status,
                  "class": meta.get("class"), "author": author, "author_role": roles.get(author),
                  "hypothesis": meta.get("hypothesis"), "outcome": benches[-1] if benches else None,
                  "tally": tally, "votes": votes, "comments": comments, "prs": prs,
                  "decision": decisions.get(n), "text": body,
                  "events": [{"seq": e.get("seq"), "ts": e.get("ts"), "type": e.get("type"), "actor": e.get("actor")}
                             for e in mine]}
        put(out, f"rfc/{int(n) if n.isdigit() else n}.json", detail)
        rows.append({"number": n, "title": detail["title"], "slug": slug_s, "status": status,
                     "class": meta.get("class"), "author": author, "tally": tally,
                     "pr_count": len(prs), "comment_count": len(comments)})
    board = {}
    for r in rows:
        board.setdefault(r["status"], []).append(r["number"])
    put(out, "rfcs.json", {"items": rows, "board": board, "statuses": sorted(board)})
    return rows


def build_agents(root, out, events, roster, rfcs):
    roles = build_roles(roster)
    ids = sorted({a.get("id") for a in roster if isinstance(a, dict) and a.get("id")}
                 | {p.parent.name for p in (root / "agents").glob("*/MEMORY.md")})
    votes = {}
    authored = {}
    for e in events:
        d = e.get("data") or {}
        if e.get("type") == "vote_cast":
            n = norm_id((e.get("subject") or {}).get("rfc"))
            votes.setdefault(e.get("actor"), []).append({"rfc": n, "vote": d.get("vote")})
        if e.get("type") == "rfc_opened":
            authored.setdefault(e.get("actor"), set()).add(norm_id((e.get("subject") or {}).get("rfc")))
    status = {r["number"]: r["status"] for r in rfcs}
    for r in rfcs:
        if r["author"] and r["number"] not in authored.get(r["author"], set()):
            authored.setdefault(r["author"], set()).add(r["number"])
    agents = []
    for a in roster:
        if not isinstance(a, dict) or not a.get("id"):
            continue
        aid = a["id"]
        mine = authored.get(aid, set())
        decided = [n for n in mine if status.get(n) in DECIDED]
        accepted = [n for n in decided if status.get(n) in DONE]
        cast = votes.get(aid, [])
        agents.append({"id": aid, "role": a.get("role"), "model": a.get("model"), "effort": a.get("effort"),
                       "votes_enabled": a.get("votes"), "persona": a.get("persona"),
                       "rfcs_authored": sorted(mine), "acceptance_rate": (len(accepted) / len(decided)) if decided else None,
                       "votes": cast,
                       "vote_counts": {k: sum(1 for v in cast if v["vote"] == k) for k in ("approve", "reject", "abstain")},
                       "memory": read(root / "agents" / aid / "MEMORY.md") or None})
    rates = []
    for a in ids:
        row = []
        for b in ids:
            va = {v["rfc"]: v["vote"] for v in votes.get(a, []) if v["vote"] in ("approve", "reject")}
            vb = {v["rfc"]: v["vote"] for v in votes.get(b, []) if v["vote"] in ("approve", "reject")}
            shared = [k for k in va if k in vb]
            row.append(round(sum(va[k] == vb[k] for k in shared) / len(shared), 3) if shared else None)
        rates.append(row)
    put(out, "agents.json", {"agents": agents, "matrix": {"ids": ids, "agreement": rates},
                             "architect_ids": sorted(k for k, v in roles.items() if v and "architect" in str(v))})


def build_bench(root, out, events):
    series = []
    for e in events:
        if e.get("type") != "bench_run":
            continue
        d = e.get("data") or {}
        dev = d.get("dev") or d.get("metrics") or {}
        held = d.get("heldout") or d.get("held_out") or {}
        series.append({"seq": e.get("seq"), "date": (e.get("ts") or "")[:10], "scope": d.get("scope"),
                       "dev": dev, "heldout": held, "dev_fitness": fitness(dev), "heldout_fitness": fitness(held)})
    baseline_files = []
    reference = None
    for p in sorted((root / "bench" / "baselines").glob("*")):
        if p.is_file():
            baseline_files.append(p.name)
            j = load_json(p) or {}
            reference = fitness(j.get("metrics", j)) or reference
    for s in series:
        if s["scope"] == "baseline" and s["dev_fitness"] is not None:
            reference = s["dev_fitness"]
    latest = [s for s in series if s["scope"] != "baseline"]
    diags = (latest[-1]["dev"].get("diagnostics") if latest and isinstance(latest[-1]["dev"], dict) else None) or []
    dates = []
    for d in sorted((root / "audit" / "bench").glob("*")):
        if d.is_dir():
            dates.append(d.name)
            files = []
            for f in sorted(d.rglob("*")):
                if f.is_file():
                    size = f.stat().st_size
                    files.append({"name": f.relative_to(d).as_posix(), "size": size,
                                  "text": read(f)[:MAX_TEXT] if size <= MAX_TEXT else None})
            put(out, f"bench/{d.name}.json", {"date": d.name, "files": files})
    put(out, "bench.json", {"series": series, "reference_fitness": reference, "baseline_files": baseline_files,
                            "dates": dates, "diagnostics": diags,
                            "overfit_warnings": [{"ts": e.get("ts"), "data": e.get("data")}
                                                 for e in events if e.get("type") == "overfit_warning"]})
    return series, reference


def build_digests(root, out):
    items = []
    for p in sorted((root / "audit" / "daily").glob("*.md"), reverse=True):
        body = read(p)
        m = re.search(r"^# (.+)$", body, re.M)
        items.append({"date": p.stem, "title": m.group(1) if m else p.stem, "body": body[:MAX_TEXT]})
    put(out, "digests.json", {"items": items})
    return items


def build_bootstrap(root, out, events):
    active = read(root / "compiler" / "ACTIVE").strip() or None
    binaries = []
    for f in sorted((root / "compiler" / "bootstrap").glob("*")) if (root / "compiler" / "bootstrap").is_dir() else []:
        if f.is_file():
            binaries.append({"path": f.relative_to(root).as_posix(), "size": f.stat().st_size,
                             "sha256": hashlib.sha256(f.read_bytes()).hexdigest()})
    fixed = [{"ts": e.get("ts"), "seq": e.get("seq"), **(e.get("data") or {})}
             for e in events if e.get("type") == "fixed_point_passed"]
    cut = [{"ts": e.get("ts"), "seq": e.get("seq"), **(e.get("data") or {})} for e in events if e.get("type") == "cutover"]
    rel = [{"ts": e.get("ts"), "seq": e.get("seq"), **(e.get("data") or {})} for e in events if e.get("type") == "release"]
    stage0 = "frozen" if active == "self" else ("active" if (root / "compiler" / "stage0").is_dir() else "absent")
    stage1 = "done" if fixed else ("in progress" if (root / "compiler" / "self").is_dir() else "pending")
    stages = [
        {"stage": 0, "name": "TypeScript compiler", "emits": "Wasm", "status": stage0},
        {"stage": 1, "name": "Self-hosted port (stage 0 builds it)", "emits": "Wasm", "status": stage1},
        {"stage": 2, "name": "Fixed point (compiles itself)", "emits": "Wasm",
         "status": "proven" if fixed else "pending"},
        {"stage": 3, "name": "Native x86-64 backend", "emits": "x86-64 ELF",
         "status": "pending"},
    ]
    put(out, "bootstrap.json", {"active": active, "stages": stages, "fixed_point": fixed, "cutover": cut,
                                "release": rel, "binaries": binaries})


def build_spec(root, out, events, slug, roles):
    spec = root / "spec"
    version = read(spec / "VERSION").strip() or None
    paragraphs = []
    for p in sorted(spec.rglob("*.md")) if spec.is_dir() else []:
        paragraphs += blocks(read(p), p.relative_to(root).as_posix())
    errors = load_json(spec / "errors.json")
    put(out, "spec.json", {"version": version, "files": sorted({b["file"] for b in paragraphs}),
                           "paragraphs": paragraphs, "errors": errors})
    why = {}
    info_cache = {}
    for rel in sorted({b["file"] for b in paragraphs}):
        lines = {}
        cur = None
        for ln in git(root, "blame", "--porcelain", "--", rel).split("\n"):
            m = re.match(r"^([0-9a-f]{40}) \d+ (\d+)", ln)
            if m:
                cur = m.group(1)
                lines[int(m.group(2))] = None if set(cur) == {"0"} else cur
        for b in (x for x in paragraphs if x["file"] == rel):
            sha = lines.get(b["line"])
            why[b["id"]] = why_entry(root, b, sha, events, slug, roles, info_cache)
    put(out, "why.json", why)
    return version


def why_entry(root, b, sha, events, slug, roles, cache):
    info = None
    if sha:
        if sha not in cache:
            raw = git(root, "log", "-1", "--format=%s%x00%b", sha)
            subject, _, body = raw.partition("\x00")
            trailers = {}
            for ln in body.splitlines():
                m = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", ln)
                if m:
                    trailers[m.group(1).lower()] = m.group(2).strip()
            cache[sha] = {"subject": subject.strip(), "trailers": trailers}
        info = cache[sha]
    trailers = (info or {}).get("trailers", {})
    rfc = norm_id(trailers.get("rfc"))
    merged = [(e.get("data") or {}) for e in events if e.get("type") == "merged"
              and sha and str((e.get("data") or {}).get("commit", "")).startswith(sha[:12])]
    bench = None
    if merged:
        bench = {k: merged[-1][k] for k in ("fitness_before", "fitness_after") if k in merged[-1]} or None
    votes = []
    if rfc:
        votes = [{"agent": e.get("actor"), "role": roles.get(e.get("actor")), "vote": (e.get("data") or {}).get("vote"),
                  "rationale": (e.get("data") or {}).get("rationale")}
                 for e in events if e.get("type") == "vote_cast" and norm_id((e.get("subject") or {}).get("rfc")) == rfc]
    sessions = [s.strip() for s in trailers.get("sessions", "").split(",") if s.strip()]
    transcripts = [t for t in (transcript_for(s, slug) for s in sessions) if t]
    return {"id": b["id"], "file": b["file"], "line": b["line"], "commit": sha,
            "subject": (info or {}).get("subject"), "trailers": trailers, "rfc": rfc,
            "votes": votes, "bench": bench, "transcripts": transcripts}


def snapshot_files(root: Path, ref: str | None):
    def show(path):
        if ref is None:
            return read(root / path)
        return git(root, "show", f"{ref}:{path}")

    def listed(prefix):
        if ref is None:
            base = root / prefix
            return sorted(p.relative_to(root).as_posix() for p in base.rglob("*") if p.is_file()) if base.is_dir() else []
        return sorted(x for x in git(root, "ls-tree", "-r", "--name-only", ref, "--", prefix).splitlines() if x)

    gram = next((p for p in listed("spec") if re.search(r"/grammar\.[^/]+$", p)), None)
    snap = {"core": show("spec/core.md"), "card": show("spec/card.md"),
            "grammar": show(gram) if gram else "", "grammar_path": gram, "examples": {}}
    for p in listed("examples"):
        txt = show(p)
        if txt and len(txt) <= 65536:
            snap["examples"][p] = txt
    return snap


def build_history(root, out, spec_version):
    tags = sorted((t for t in git(root, "tag", "--list", "spec-v*").split() if re.fullmatch(r"spec-v[\w.+-]+", t)),
                  key=lambda t: semver_key(t[len("spec-v"):]))
    index = []
    for t in tags:
        ver = t[len("spec-v"):]
        commit = git(root, "rev-list", "-n1", t).strip()
        date = git(root, "log", "-1", "--format=%cI", commit).strip() if commit else ""
        snap = snapshot_files(root, t)
        index.append({"version": ver, "tag": t, "commit": commit or None, "date": date or None})
        put(out, f"history/{ver}.json", {"version": ver, "tag": t, **snap})
    if spec_version and spec_version not in {i["version"] for i in index}:
        snap = snapshot_files(root, None)
        index.append({"version": spec_version, "tag": None, "commit": None, "date": None, "working_tree": True})
        put(out, f"history/{spec_version}.json", {"version": spec_version, "tag": None, **snap})
    index.sort(key=lambda i: semver_key(i["version"]))
    put(out, "history/index.json", {"items": index})


def build_home(out, events, chain, rfcs, series, reference, digests, bootstrap_stages, spec_version, root):
    decisions = []
    for p in sorted((root / "audit" / "decisions").glob("*.md"), reverse=True)[:5]:
        body = read(p)
        m = re.search(r"^# (.+)$", body, re.M)
        decisions.append({"file": p.name, "title": m.group(1) if m else p.stem, "excerpt": body[:400]})
    put(out, "home.json", {
        "spec_version": spec_version,
        "active": read(root / "compiler" / "ACTIVE").strip() or None,
        "chain": chain,
        "counts": {"events": len(events), "rfcs": len(rfcs),
                   "agents": len({e.get("actor") for e in events if e.get("actor")})},
        "fitness": [{"date": s["date"], "dev": s["dev_fitness"], "heldout": s["heldout_fitness"]}
                    for s in series if s["scope"] != "baseline"],
        "reference_fitness": reference,
        "stages": bootstrap_stages,
        "decisions": decisions,
        "digest": digests[0] if digests else None,
        "recent_rfcs": rfcs[-5:],
    })


def build(root: Path, out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    events = load_events(root)
    slug = repo_slug(root)
    chain = build_audit(out, events, slug)
    roster_doc = yaml.safe_load(read(root / "governance" / "roster.yml")) or {}
    roster = roster_doc.get("agents", []) if isinstance(roster_doc, dict) else []
    roles = build_roles(roster)
    rfcs = build_rfcs(root, out, events, roles, slug)
    build_agents(root, out, events, roster, rfcs)
    series, reference = build_bench(root, out, events)
    digests = build_digests(root, out)
    build_bootstrap(root, out, events)
    spec_version = build_spec(root, out, events, slug, roles)
    build_history(root, out, spec_version)
    stages = load_json(out / "bootstrap.json", {}).get("stages", [])
    build_home(out, events, chain, rfcs, series, reference, digests, stages, spec_version, root)


def main() -> None:
    here = Path(__file__).resolve()
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(here.parents[1]))
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = Path(a.root).resolve()
    out = Path(a.out).resolve() if a.out else root / "site" / "public" / "data"
    build(root, out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
