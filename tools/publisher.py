"""Protected publisher: validates agent session output and applies it through GitHub.

    python -m tools.publisher --session-dirs DIR... --out PUBDIR [--root REPO]

Each session directory is what tools/run_agent.sh leaves behind: session.json
(written by the runner), actions.json, files/, MEMORY.md, transcript.jsonl.

Refusal is layered. A session is refused whole when its outcome is not ok, its
output is malformed, over the byte or action limits, contains a symlink or a
protected path. Otherwise each action is checked alone (schema, role, paths,
conformance meta, changed-line cap) and only the bad ones are refused. Files
are read as bytes, never executed.

Every GitHub post carries `<!-- glyph:idem KEY -->` (KEY = session#action-index,
suffixes for sub-posts). Before posting, the publisher lists the existing
comments, reviews, issues or PRs and skips a post whose marker is already there,
so a rerun does not duplicate anything.

Environment: BASE_BRANCH (default main), GITHUB_REPOSITORY, GH_TOKEN, and
GLYPH_DRY=1, which makes gh calls print instead of run. GLYPH_GIT_REAL=1 keeps
git real under GLYPH_DRY: branch commits are pushed, but only to agent/*.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import jsonschema
import yaml

from tools.lib import gh, gitops

HERE = Path(__file__).resolve().parent
ROLES = ("designer", "implementer", "tester", "reviewer", "user", "scribe",
         "architect", "architect-weekly")

# CONTRACTS.md: which action types each role may post.
ALLOWED = {
    "designer": {"open_rfc", "revise_rfc", "comment", "vote", "withdraw_rfc", "open_issue", "close_issue"},
    "implementer": {"open_pr", "update_pr", "comment", "vote", "open_issue", "close_issue"},
    "tester": {"open_pr", "update_pr", "comment", "vote", "open_issue"},
    "reviewer": {"review", "comment"},
    "user": {"open_issue", "comment", "vote", "open_pr"},
    "scribe": {"digest", "comment", "open_pr"},
    "architect": {"comment", "open_issue", "open_pr"},
    "architect-weekly": {"open_rfc", "revise_rfc", "comment", "open_issue", "open_pr", "update_pr"},
}

# CONTRACTS.md protected paths. Entries ending in "/" match a directory prefix.
PROTECTED = (".github/", "governance/", "agents/prompts/", "tools/", "toolkit/", "bench/",
             "audit/", "site/", "bin/", "compiler/bootstrap/", "compiler/ACTIVE", "docs/",
             "CONTRACTS.md", "README.md", "package.json")

# Writable paths per role and action. docs/CHANGELOG from CONTRACTS is protected
# (docs/ is), so the scribe's changelog is spec/CHANGELOG.md (SPEC section 7).
# Designers write RFC files only; spec/ is not theirs.
RFC = re.compile(r"rfcs/[0-9]{4}-[a-z0-9][a-z0-9-]*\.md")
PLAN = re.compile(r"rfcs/[0-9]{4}\.plan\.md")
SPEC = re.compile(r"spec/.+")
CHANGELOG = re.compile(r"spec/CHANGELOG\.md")
STAGE = re.compile(r"compiler/(stage0|self)/.+")
CONF = re.compile(r"conformance/.+")
STDLIB = re.compile(r"stdlib/.+")
EXAMPLES = re.compile(r"examples/.+")
ARCH = re.compile(r"architecture/.+")
IMPL = [PLAN, SPEC, STAGE, CONF, STDLIB, EXAMPLES]
WRITE = {
    "designer": {"open_rfc": [RFC], "revise_rfc": [RFC]},
    "implementer": {"open_pr": IMPL, "update_pr": IMPL},
    "tester": {"open_pr": [CONF], "update_pr": [CONF]},
    "user": {"open_pr": [EXAMPLES]},  # open_pr is class docs only, checked in _h_open_pr
    "scribe": {"open_pr": [CHANGELOG]},
    "architect": {"open_pr": [ARCH]},
    "architect-weekly": {"open_rfc": [RFC], "revise_rfc": [RFC],
                         "open_pr": IMPL + [ARCH], "update_pr": IMPL + [ARCH]},
}

SCHEMA_DIR = HERE / "schemas"
TS_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T")
_VALIDATORS: dict = {}
ITEM_JQ = '.[] | {number, body: (.body // ""), head: (.head.ref // "")} | tojson'


class PublishError(Exception):
    """A refusal reason. Raised inside one action or one session."""


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _validator(name: str):
    if name not in _VALIDATORS:
        schema = json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))
        _VALIDATORS[name] = jsonschema.Draft202012Validator(schema)
    return _VALIDATORS[name]


def validate_repo_path(p) -> str:
    if not isinstance(p, str) or not p or len(p) > 300:
        raise PublishError(f"bad path {p!r}")
    if p.startswith("/") or "\\" in p or "\0" in p:
        raise PublishError(f"path is not repo-relative: {p}")
    if any(seg in ("", ".", "..", ".git") for seg in p.split("/")):
        raise PublishError(f"path is not normalized: {p}")
    return p


def is_protected(p: str) -> bool:
    for x in PROTECTED:
        if x.endswith("/"):
            if p.startswith(x):
                return True
        elif p == x:
            return True
    return False


def changed_lines(old: bytes, new: bytes) -> int:
    """Added plus removed lines between two versions of a text file (difflib)."""
    a = old.decode("utf-8", "replace").splitlines()
    b = new.decode("utf-8", "replace").splitlines()
    n = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != "equal":
            n += (i2 - i1) + (j2 - j1)
    return n


def check_conformance(path: str, data: bytes) -> str | None:
    """Return a reason if a conformance .test file has a bad --- meta block (SPEC section 7)."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return "conformance file is not UTF-8"
    lines = text.split("\n")
    if lines[0].strip() != "--- meta":
        return "conformance file must start with a --- meta block"
    block = []
    for ln in lines[1:]:
        if ln.startswith("--- "):
            break
        block.append(ln)
    try:
        meta = yaml.safe_load("\n".join(block)) or {}
    except yaml.YAMLError as e:
        return f"meta block is not YAML: {e}"
    if not isinstance(meta, dict):
        return "meta block must be a mapping"
    if isinstance(meta.get("rfc"), int):  # YAML reads 0004 as an int
        meta["rfc"] = f"{meta['rfc']:04d}"
    errs = sorted(_validator("test_meta.schema.json").iter_errors(meta), key=lambda e: list(e.path))
    if errs:
        return f"meta: {errs[0].message}"
    want = path[len("conformance/"):-len(".test")]
    if meta["id"] != want:
        return f"meta id {meta['id']} does not match path {want}"
    return None


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-")


def prefixed(agent: str, session: str, body: str) -> str:
    return f"**[{agent} · {session}]**\n\n{body}"


def marker(key: str) -> str:
    return f"<!-- glyph:idem {key} -->"


def pr_number(url: str) -> int:
    try:
        return int(url.strip().rstrip("/").rsplit("/", 1)[-1])
    except ValueError as e:
        raise PublishError(f"could not read a number from gh output {url!r}") from e


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def load_roster(root: Path) -> dict:
    doc = yaml.safe_load((root / "governance" / "roster.yml").read_text(encoding="utf-8"))
    roster = {}
    for e in doc["agents"]:
        if e["role"] not in ROLES:
            raise RuntimeError(f"roster: {e['id']} has unknown role {e['role']}")
        roster[e["id"]] = e
    return roster


def load_rules(root: Path) -> dict:
    text = (root / "governance" / "RULES.md").read_text(encoding="utf-8")
    m = re.search(r"^```yaml rules\n(.*?)^```\s*$", text, re.S | re.M)
    if not m:
        raise RuntimeError("governance/RULES.md has no ```yaml rules block")
    return yaml.safe_load(m.group(1))


def load_state_or_none(root: Path):
    if not (root / "audit" / "events.jsonl").exists():
        return None
    from tools.lib.state import load_state  # owned by the audit builder
    return load_state(root)


class Session:
    def __init__(self, sdir: Path, agent: str, session: str, role: str, ts: str):
        self.sdir, self.agent, self.session, self.role, self.ts = sdir, agent, session, role, ts


class Publisher:
    def __init__(self, root, base: str, dry: bool, repo: str, git_real: bool = False):
        self.root = Path(root).resolve()
        self.base, self.dry, self.repo = base, dry, repo
        self.git_real = git_real  # real git under dry: pushes still only to agent/*
        self.roster = load_roster(self.root)
        self.rules = load_rules(self.root)
        self.state = load_state_or_none(self.root)
        self.hwm = max((int(k) for k in self.state["rfcs"]), default=0) if self.state else 0
        self.created: set[str] = set()
        self.events: list[dict] = []
        self.published: list[dict] = []
        self.refused: list[dict] = []
        self.sessions_used: dict[str, int] = {}
        self.dry_log: list[dict] = []
        self.dry_items: list[dict] = []  # posts made in dry mode, read back by the idem check
        self._pending_copies: list[tuple] = []
        self.dry_n = 100

    # ----- refusals and events -------------------------------------------
    def _refuse(self, agent, session, action, index, reason):
        self.refused.append({"agent": agent, "session": session, "action": action,
                             "index": index, "reason": reason})

    @staticmethod
    def _key(ses: Session, i: int) -> str:
        return f"{ses.session}#{i}"

    def _event(self, ses: Session, i: int, etype: str, subject: dict, data: dict):
        self.events.append({"idem": self._key(ses, i), "type": etype, "actor": ses.agent,
                            "session": ses.session, "subject": subject, "data": data, "ts": ses.ts})

    # ----- GitHub adapter (gh.py; dry replies come from here) ------------
    def _next_dry(self) -> int:
        self.dry_n += 1
        return self.dry_n

    def _dry_reply(self, args: list[str]) -> str:
        if args[:1] == ["api"]:
            return "\n".join(json.dumps({"number": x["number"], "body": x["body"], "head": x["head"]})
                             for x in self.dry_items)
        if args[:2] == ["pr", "create"]:
            return f"https://github.com/{self.repo}/pull/{self._next_dry()}"
        if args[:2] == ["issue", "create"]:
            return f"https://github.com/{self.repo}/issues/{self._next_dry()}"
        if args[:2] == ["pr", "list"]:
            head = args[args.index("--head") + 1]
            if head.startswith("agent/rfc-"):
                return json.dumps([{"number": 1000 + int(head[-4:])}])
            for x in self.dry_items:
                if x["head"] and x["head"] == head:
                    return json.dumps([{"number": x["number"]}])
            return "[]"
        if args[:2] in (["pr", "view"], ["issue", "view"]):
            if "headRefName" in args:
                return "agent/impl-0007"
            if "headRefOid" in args:
                return "b" * 40
            if "state" in args:
                return "OPEN"
        return ""

    def _dry_record(self, args: list[str], stdin, reply: str):
        if args[:2] in (["pr", "create"], ["issue", "create"]):
            head = args[args.index("--head") + 1] if "--head" in args else ""
            self.dry_items.append({"number": pr_number(reply), "body": stdin or "", "head": head})
        elif args[:2] in (["pr", "comment"], ["issue", "comment"], ["pr", "review"]):
            self.dry_items.append({"number": int(args[2]), "body": stdin or "", "head": ""})

    def _gh(self, args: list[str], stdin: str | None = None) -> str:
        if self.dry:
            self.dry_log.append({"gh": args, "stdin": stdin})
            print("DRY gh " + " ".join(args), file=sys.stderr)
            reply = self._dry_reply(args)
            if args[:1] != ["api"]:
                self._dry_record(args, stdin, reply)
            return reply
        try:
            return gh.run(args, cwd=self.root, check=True, input_text=stdin).strip()
        except RuntimeError as e:
            raise PublishError(f"gh {' '.join(args[:2])} failed: {str(e)[:300]}") from e

    def _list(self, endpoint: str) -> list[dict]:
        out = self._gh(["api", "--paginate", "--jq", ITEM_JQ, endpoint])
        return [json.loads(ln) for ln in out.splitlines() if ln.strip()]

    def _find(self, key: str, endpoint: str):
        """The existing item at endpoint whose body carries this key's idem marker, or None."""
        for item in self._list(endpoint):
            if marker(key) in item["body"]:
                return item
        return None

    def _text(self, ses: Session, key: str, body: str) -> str:
        return prefixed(ses.agent, ses.session, body) + "\n\n" + marker(key)

    def _post_comment(self, ses: Session, key: str, kind: str, num: int, body: str) -> bool:
        """Comment on a PR (kind pr) or issue, unless this key was already posted. True if posted."""
        if self._find(key, f"repos/{self.repo}/issues/{num}/comments"):
            return False
        self._gh([kind, "comment", str(num), "--body-file", "-"], stdin=self._text(ses, key, body))
        return True

    def _git(self, args: list[str], env=None, stdin: bytes | None = None) -> str:
        res = subprocess.run(["git", *args], cwd=self.root, env=env or gitops.git_env(), input=stdin, capture_output=True)
        if res.returncode:
            raise PublishError(f"git {args[0]} failed: {res.stderr.decode(errors='replace').strip()[:300]}")
        return res.stdout.decode().strip()

    def _base_bytes(self, path: str) -> bytes:
        """The file as it is on the base branch; b"" when the base has no such file."""
        if self.git_real:
            self._git(["fetch", "--quiet", "origin", f"refs/heads/{self.base}"])
            ref = "FETCH_HEAD"
        else:
            ref = self.base
        res = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=self.root, capture_output=True)
        return res.stdout if res.returncode == 0 else b""

    def _commit(self, branch: str, base_branch: str, changes, message: str, agent: str) -> str:
        """Commit changes onto branch (parent: base_branch's tip) and push. Returns the sha.

        changes: [(repo path, bytes or None for delete)]. Only agent/* branches are pushed.
        The agent is the commit author; the publisher bot is the committer.
        """
        if not branch.startswith("agent/") or ".." in branch or " " in branch:
            raise PublishError(f"refusing to push to {branch}")
        if self.dry and not self.git_real:
            digest = [[p, None if d is None else hashlib.sha256(d).hexdigest()] for p, d in changes]
            sha = hashlib.sha1(canonical_json([branch, base_branch, digest])).hexdigest()
            self.dry_log.append({"push": f"{sha}:refs/heads/{branch}", "parent": base_branch,
                                 "paths": [p for p, _ in changes]})
            return sha
        tmp = tempfile.mkdtemp(prefix="publisher-index-")
        env = dict(gitops.git_env(), GIT_INDEX_FILE=os.path.join(tmp, "index"))
        try:
            self._git(["fetch", "--quiet", "origin", f"refs/heads/{base_branch}"])
            parent = self._git(["rev-parse", "FETCH_HEAD"])
            self._git(["read-tree", parent], env=env)
            for path, data in changes:
                if data is None:
                    self._git(["update-index", "--force-remove", path], env=env)
                else:
                    blob = self._git(["hash-object", "-w", "--stdin"], env=env, stdin=data)
                    self._git(["update-index", "--add", "--cacheinfo", f"100644,{blob},{path}"], env=env)
            tree = self._git(["write-tree"], env=env)
            who = dict(gitops.git_env(), GIT_AUTHOR_NAME=agent,
                       GIT_AUTHOR_EMAIL=f"{agent}@agents.glyph-language.invalid",
                       GIT_COMMITTER_NAME="glyph-publisher",
                       GIT_COMMITTER_EMAIL="glyph-publisher@users.noreply.github.com")
            sha = self._git(["commit-tree", tree, "-p", parent, "-m", message], env=who)
            self._git(["push", "--quiet", "origin", f"{sha}:refs/heads/{branch}"])
            return sha
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def _pr_for_head(self, head: str, state: str = "all"):
        out = self._gh(["pr", "list", "--head", head, "--state", state, "--json", "number"])
        try:
            items = json.loads(out or "[]")
            return items[0]["number"] if items else None
        except (ValueError, KeyError, TypeError, IndexError) as e:
            raise PublishError(f"unexpected gh pr list output: {out[:120]!r}") from e

    def _rfc_pr(self, rfc: str):
        return self._pr_for_head(f"agent/rfc-{rfc}")

    def _pulls_ep(self) -> str:
        return f"repos/{self.repo}/pulls?state=all&per_page=100"

    def _issues_ep(self) -> str:
        return f"repos/{self.repo}/issues?state=all&per_page=100"

    # ----- state checks --------------------------------------------------
    def _rfc_rec(self, rfc: str) -> dict:
        if self.state is None:
            raise PublishError("no audit state to check RFC " + rfc + " against")
        rec = self.state["rfcs"].get(rfc)
        if rec is None:
            raise PublishError(f"unknown RFC {rfc}")
        return rec

    def _alloc_rfc(self, slug: str) -> str:
        if self.state:
            for rec in self.state["rfcs"].values():
                if rec.get("slug") == slug:
                    raise PublishError(f"slug {slug} is already used by RFC {rec['number']}")
        self.hwm += 1
        return f"{self.hwm:04d}"

    # ----- file checks ---------------------------------------------------
    def _src(self, ses: Session, rel: str) -> bytes:
        validate_repo_path(rel)
        p = ses.sdir / "files" / rel
        if p.is_symlink() or not p.is_file():
            raise PublishError(f"{rel} is not under out/files")
        return p.read_bytes()

    def _check_write(self, ses: Session, action: str, items):
        rules = WRITE.get(ses.role, {}).get(action, [])
        seen = set()
        for p, data in items:
            validate_repo_path(p)
            if p in seen:
                raise PublishError(f"{p} listed twice")
            seen.add(p)
            if is_protected(p):
                raise PublishError(f"{p} is a protected path")
            if not any(rx.fullmatch(p) for rx in rules):
                raise PublishError(f"role {ses.role} may not write {p} in {action}")
            if data is not None and p.startswith("conformance/") and p.endswith(".test"):
                bad = check_conformance(p, data)
                if bad:
                    raise PublishError(f"{p}: {bad}")

    def _items(self, ses: Session, action: str, files, delete) -> list:
        items = [(validate_repo_path(p), self._src(ses, p)) for p in files]
        items += [(validate_repo_path(p), None) for p in delete]
        if not items:
            raise PublishError("no files to change")
        self._check_write(ses, action, items)
        total = sum(changed_lines(self._base_bytes(p), d or b"") for p, d in items)
        limit = self.rules["subtask_max_changed_lines"]
        if total > limit:
            raise PublishError(f"{total} changed lines against {self.base}, over the {limit} limit")
        return items

    # ----- action handlers -----------------------------------------------
    def _h_open_rfc(self, ses, i, a):
        key = self._key(ses, i)
        slug = a["slug"]
        prev = self._find(key, self._pulls_ep())  # rerun: this RFC's PR already exists
        if prev and prev["head"].startswith("agent/rfc-"):
            rfc = prev["head"][-4:]
            self.hwm = max(self.hwm, int(rfc))
            pr, branch, sha = prev["number"], prev["head"], None
            dest = f"rfcs/{rfc}-{slug}.md"
        else:
            data = self._src(ses, a["file"])
            rfc = self._alloc_rfc(slug)
            dest = f"rfcs/{rfc}-{slug}.md"
            self._check_write(ses, "open_rfc", [(dest, data)])
            branch = f"agent/rfc-{rfc}"
            msg = f"RFC {rfc}: {a['title']}\n\nAgent: {ses.agent}\nSession: {ses.session}\n"
            sha = self._commit(branch, self.base, [(dest, data)], msg, ses.agent)
            url = self._gh(["pr", "create", "--base", self.base, "--head", branch,
                            "--title", f"RFC {rfc}: {a['title']}", "--body-file", "-"],
                           stdin=self._text(ses, key, a["title"]))
            pr = pr_number(url)
        self._event(ses, i, "rfc_opened", {"rfc": rfc},
                    {"title": a["title"], "slug": slug, "author": ses.agent, "class": a["class"],
                     "pr": pr, "branch": branch})
        return {"rfc": rfc, "pr": pr, "branch": branch, "path": dest, "sha": sha}

    def _h_revise_rfc(self, ses, i, a):
        key = self._key(ses, i)
        rfc = a["rfc"]
        if ses.role != "architect-weekly":
            rec = self._rfc_rec(rfc)
            if rec["author"] != ses.agent:
                raise PublishError(f"only the author of RFC {rfc} may revise it")
        data = self._src(ses, a["file"])
        dest = a["file"]
        if not re.fullmatch(rf"rfcs/{rfc}-[a-z0-9][a-z0-9-]*\.md", dest):
            raise PublishError(f"{dest} is not the file of RFC {rfc}")
        self._check_write(ses, "revise_rfc", [(dest, data)])
        branch = f"agent/rfc-{rfc}"
        msg = f"RFC {rfc}: revision\n\nAgent: {ses.agent}\nSession: {ses.session}\n"
        sha = self._commit(branch, branch, [(dest, data)], msg, ses.agent)
        pr = self._rfc_pr(rfc)
        if pr:
            self._post_comment(ses, key, "pr", pr, a["note"])
        self._event(ses, i, "rfc_revised", {"rfc": rfc}, {"note": a["note"], "file": dest, "sha": sha})
        return {"rfc": rfc, "branch": branch, "sha": sha}

    def _h_comment(self, ses, i, a):
        key = self._key(ses, i)
        tgt = a["target"]
        if "rfc" in tgt:
            pr = self._rfc_pr(tgt["rfc"])
            if not pr:
                raise PublishError(f"no PR for RFC {tgt['rfc']}")
            self._post_comment(ses, key, "pr", pr, a["body"])
            subject = {"rfc": tgt["rfc"]}
        elif "pr" in tgt:
            self._post_comment(ses, key, "pr", tgt["pr"], a["body"])
            subject = {"pr": tgt["pr"]}
        else:
            self._post_comment(ses, key, "issue", tgt["issue"], a["body"])
            subject = {"issue": tgt["issue"]}
        self._event(ses, i, "comment_posted", subject, {"body": a["body"]})
        return {"target": tgt}

    def _h_vote(self, ses, i, a):
        key = self._key(ses, i)
        if not self.roster[ses.agent].get("votes"):
            raise PublishError(f"{ses.agent} is not a voter in the roster")
        rfc = a["rfc"]
        rec = self._rfc_rec(rfc)
        if rec["author"] == ses.agent:
            raise PublishError("an author may not vote on their own RFC")
        if rec["status"] != "voting":
            raise PublishError(f"RFC {rfc} is {rec['status']}, votes count only in voting")
        pr = self._rfc_pr(rfc)
        if not pr:
            raise PublishError(f"no PR for RFC {rfc}")
        vote_marker = "<!-- glyph:vote " + canonical_json({"rfc": rfc, "vote": a["vote"]}).decode() + " -->"
        self._post_comment(ses, key, "pr", pr, a["rationale"] + "\n\n" + vote_marker)
        self._event(ses, i, "vote_cast", {"rfc": rfc}, {"vote": a["vote"], "rationale": a["rationale"]})
        return {"rfc": rfc, "vote": a["vote"], "pr": pr}

    def _h_withdraw_rfc(self, ses, i, a):
        key = self._key(ses, i)
        rfc = a["rfc"]
        if self._rfc_rec(rfc)["author"] != ses.agent:
            raise PublishError(f"only the author of RFC {rfc} may withdraw it")
        pr = self._rfc_pr(rfc)
        if pr:
            self._post_comment(ses, key, "pr", pr, a["reason"])
            if self._gh(["pr", "view", str(pr), "--json", "state", "--jq", ".state"]) == "OPEN":
                self._gh(["pr", "close", str(pr)])
        self._event(ses, i, "rfc_withdrawn", {"rfc": rfc}, {"reason": a["reason"]})
        return {"rfc": rfc, "pr": pr}

    def _update_branch(self, ses, i, pr: int, branch: str, items, a, body=None):
        key = self._key(ses, i)
        msg = f"PR {pr}: update\n\nAgent: {ses.agent}\nSession: {ses.session}\n"
        sha = self._commit(branch, branch, items, msg, ses.agent)
        if body:
            self._post_comment(ses, key, "pr", pr, body)
        self._event(ses, i, "pr_updated", {"pr": pr},
                    {"head_sha": sha, "subtask": a.get("subtask"),
                     "files": sorted(p for p, d in items if d is not None),
                     "delete": sorted(p for p, d in items if d is None)})
        return {"pr": pr, "branch": branch, "sha": sha}

    def _h_open_pr(self, ses, i, a):
        key = self._key(ses, i)
        if ses.role == "user" and a["class"] != "docs":
            raise PublishError("a user may open only docs PRs")
        prev = self._find(key, self._pulls_ep())  # rerun: this PR already exists
        if prev:
            return {"pr": prev["number"], "branch": prev["head"], "sha": None}
        items = self._items(ses, "open_pr", a["files"], a.get("delete", []))
        rfc = a.get("rfc")
        if rfc:
            branch = f"agent/impl-{rfc}"
        else:
            slug = slugify(a["title"])
            if not slug:
                raise PublishError("title has no usable characters for a branch name")
            branch = f"agent/{a['class']}-{slug}"
        existing = self._pr_for_head(branch, state="open")
        if existing:  # one open PR per branch: accumulate, do not open a second
            return self._update_branch(ses, i, existing, branch, items, a, body=a["body"])
        if branch in self.created:
            raise PublishError(f"branch {branch} was already created in this run")
        msg = f"{a['title']}\n\nAgent: {ses.agent}\nSession: {ses.session}\n"
        sha = self._commit(branch, self.base, items, msg, ses.agent)
        self.created.add(branch)
        url = self._gh(["pr", "create", "--base", self.base, "--head", branch, "--title", a["title"],
                        "--body-file", "-"], stdin=self._text(ses, key, a["body"]))
        pr = pr_number(url)
        self._event(ses, i, "pr_opened", {"pr": pr},
                    {"branch": branch, "class": a["class"], "rfc": rfc, "author": ses.agent,
                     "subtask": a.get("subtask"), "head_sha": sha})
        return {"pr": pr, "branch": branch, "sha": sha}

    def _h_update_pr(self, ses, i, a):
        pr = a["pr"]
        head = self._gh(["pr", "view", str(pr), "--json", "headRefName", "--jq", ".headRefName"])
        if not head.startswith("agent/"):
            raise PublishError(f"PR {pr} head {head} is not an agent/* branch")
        items = self._items(ses, "update_pr", a["files"], a.get("delete", []))
        return self._update_branch(ses, i, pr, head, items, a, body=a.get("body"))

    def _h_review(self, ses, i, a):
        key = self._key(ses, i)
        pr = a["pr"]
        if not self._find(key, f"repos/{self.repo}/pulls/{pr}/reviews"):
            # Every PR is opened by this same token, and GitHub refuses approve/request-changes on
            # your own PR. The verdict lives in the body and in review_posted (what gate rule 14 reads).
            verdict = "Approve" if a["verdict"] == "approve" else "Request changes"
            self._gh(["pr", "review", str(pr), "--comment", "--body-file", "-"],
                     stdin=self._text(ses, key, f"**Verdict: {verdict}**\n\n{a['body']}"))
        sha = self._gh(["pr", "view", str(pr), "--json", "headRefOid", "--jq", ".headRefOid"])
        self._event(ses, i, "review_posted", {"pr": pr}, {"verdict": a["verdict"], "sha": sha})
        return {"pr": pr, "verdict": a["verdict"]}

    def _h_open_issue(self, ses, i, a):
        key = self._key(ses, i)
        prev = self._find(key, self._issues_ep())
        if prev:
            n = prev["number"]
        else:
            args = ["issue", "create", "--title", a["title"], "--body-file", "-"]
            for lab in a["labels"]:
                args += ["--label", lab]
            n = pr_number(self._gh(args, stdin=self._text(ses, key, a["body"])))
        self._event(ses, i, "issue_opened", {"issue": n},
                    {"title": a["title"], "author": ses.agent, "labels": a["labels"]})
        return {"issue": n}

    def _h_close_issue(self, ses, i, a):
        key = self._key(ses, i)
        n = a["issue"]
        self._post_comment(ses, key, "issue", n, a["reason"])
        if self._gh(["issue", "view", str(n), "--json", "state", "--jq", ".state"]) == "OPEN":
            self._gh(["issue", "close", str(n)])
        self._event(ses, i, "issue_closed", {"issue": n}, {"reason": a["reason"]})
        return {"issue": n}

    def _h_digest(self, ses, i, a):
        self._event(ses, i, "digest_published", {}, {"title": a["title"], "body": a["body"]})
        return {"title": a["title"]}

    HANDLERS = {"open_rfc": _h_open_rfc, "revise_rfc": _h_revise_rfc, "comment": _h_comment,
                "vote": _h_vote, "withdraw_rfc": _h_withdraw_rfc, "open_pr": _h_open_pr,
                "update_pr": _h_update_pr, "review": _h_review, "open_issue": _h_open_issue,
                "close_issue": _h_close_issue, "digest": _h_digest}

    # ----- session processing ---------------------------------------------
    def _tree_check(self, sdir: Path):
        total = 0
        for dirpath, dirs, files in os.walk(sdir, followlinks=False):
            for name in dirs + files:
                p = Path(dirpath) / name
                rel = p.relative_to(sdir).as_posix()
                if p.is_symlink():
                    raise PublishError(f"symlink in output: {rel}")
                if name in files:
                    total += p.stat().st_size
        if total > self.rules["max_out_bytes"]:
            raise PublishError(f"output is {total} bytes, over the {self.rules['max_out_bytes']} limit")
        fdir = sdir / "files"
        if fdir.is_dir():
            for dirpath, _, files in os.walk(fdir):
                for name in files:
                    rel = (Path(dirpath) / name).relative_to(fdir).as_posix()
                    validate_repo_path(rel)
                    if is_protected(rel):
                        raise PublishError(f"output touches protected path {rel}")

    def _run(self, ses: Session, meta: dict):
        if meta.get("outcome") != "ok":
            raise PublishError(f"session outcome is {meta.get('outcome')}, no actions applied")
        self._tree_check(ses.sdir)
        try:
            doc = load_json(ses.sdir / "actions.json")
        except (OSError, ValueError) as e:
            raise PublishError(f"actions.json unreadable: {e}") from e
        errs = list(_validator("actions.schema.json").iter_errors(doc))
        top = [e for e in errs if len(e.absolute_path) <= 1]
        if top:
            raise PublishError(f"actions.json invalid: {top[0].message}")
        bad: dict[int, str] = {}
        for e in errs:
            idx = e.absolute_path[1]
            bad.setdefault(idx, e.message)
        acts = doc["actions"]
        if len(acts) > self.rules["max_actions"]:
            raise PublishError(f"{len(acts)} actions, over the {self.rules['max_actions']} limit")
        mem = ses.sdir / "MEMORY.md"
        if mem.is_file() and not mem.is_symlink():
            try:
                approx = len(mem.read_text(encoding="utf-8")) // 4
            except UnicodeDecodeError:
                self._refuse(ses.agent, ses.session, "MEMORY.md", None, "MEMORY.md is not UTF-8")
                approx = 0
            if approx > self.rules["memory_max_tokens"]:
                self._refuse(ses.agent, ses.session, "MEMORY.md", None,
                             f"about {approx} tokens, over the {self.rules['memory_max_tokens']} budget")
        for i, a in enumerate(acts):
            t = a.get("type") if isinstance(a, dict) else None
            if i in bad:
                self._refuse(ses.agent, ses.session, t, i, f"schema: {bad[i]}")
                continue
            if t not in ALLOWED[ses.role]:
                self._refuse(ses.agent, ses.session, t, i, f"role {ses.role} may not post {t}")
                continue
            try:
                canonical_json(a)  # rejects lone surrogates before any side effect
                res = self.HANDLERS[t](self, ses, i, a)
            except PublishError as e:
                self._refuse(ses.agent, ses.session, t, i, str(e))
                continue
            except Exception as e:  # agent-supplied content must never abort the batch
                self._refuse(ses.agent, ses.session, t, i, f"internal error: {type(e).__name__}: {e}")
                continue
            self.published.append({"agent": ses.agent, "session": ses.session, "action": t,
                                   "index": i, "result": res})

    def process_session(self, sdir) -> None:
        sdir = Path(sdir)
        try:
            meta = load_json(sdir / "session.json")
        except (OSError, ValueError) as e:  # includes UnicodeDecodeError
            self._refuse(None, sdir.name, None, None, f"session.json unreadable: {e}")
            return
        if not isinstance(meta, dict):
            self._refuse(None, sdir.name, None, None, "session.json is not an object")
            return
        agent, session = meta.get("agent"), meta.get("session")
        ts = meta.get("ended") or meta.get("started")
        if not isinstance(agent, str) or agent not in self.roster:
            self._refuse(agent if isinstance(agent, str) else None, session if isinstance(session, str) else None,
                         None, None, f"agent {agent!r} is not in the roster")
            self._copy_artifacts(sdir, f"unknown-{sdir.name}")
            return
        ses = Session(sdir, agent, session, self.roster[agent]["role"], ts or "")
        try:
            if not isinstance(ts, str) or not TS_RE.match(ts):
                raise PublishError("session.json has no usable timestamp")
            if not isinstance(session, str) or not session:
                raise PublishError("session.json has no session id")
            self._run(ses, meta)
        except PublishError as e:
            self._refuse(agent, session, None, None, str(e))
        except Exception as e:  # never let one session abort the batch
            self._refuse(agent, session, None, None, f"internal error: {type(e).__name__}: {e}")
        self._copy_artifacts(sdir, agent)

    def _copy_artifacts(self, sdir: Path, agent: str):
        n = self.sessions_used.get(agent, 0)
        self.sessions_used[agent] = n + 1
        self._pending_copies.append((sdir, agent, n))

    def write(self, out: Path):
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        for sdir, agent, n in self._pending_copies:
            name = agent if n == 0 else f"{agent}--{n}"
            dest = out / "sessions" / name
            dest.mkdir(parents=True, exist_ok=True)
            for f in ("session.json", "MEMORY.md", "transcript.jsonl"):
                p = sdir / f
                if p.is_file() and not p.is_symlink():
                    shutil.copyfile(p, dest / f)
        (out / "report.json").write_text(
            json.dumps({"published": self.published, "refused": self.refused},
                       indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
        with (out / "events.jsonl").open("wb") as fh:
            for ev in self.events:
                fh.write(canonical_json(ev) + b"\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m tools.publisher")
    ap.add_argument("--session-dirs", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--root", default=".")
    args = ap.parse_args(argv)
    pub = Publisher(root=args.root, base=os.environ.get("BASE_BRANCH", "main"),
                    dry=os.environ.get("GLYPH_DRY") == "1",
                    repo=os.environ.get("GITHUB_REPOSITORY", "local/dryrun"),
                    git_real=os.environ.get("GLYPH_GIT_REAL") == "1")
    try:
        for d in args.session_dirs:
            pub.process_session(d)
    finally:
        pub.write(Path(args.out))
    print(f"published {len(pub.published)}, refused {len(pub.refused)}, events {len(pub.events)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
