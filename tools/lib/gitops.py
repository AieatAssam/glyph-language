"""git helpers used by the merge bot. Remote operations are skipped when GLYPH_DRY=1."""
import re
import os
import subprocess
import time
from pathlib import Path

from tools.lib import gh


BOT_ENV = {"GIT_AUTHOR_NAME": "glyph-mergebot", "GIT_AUTHOR_EMAIL": "glyph-mergebot@users.noreply.github.com",
           "GIT_COMMITTER_NAME": "glyph-mergebot", "GIT_COMMITTER_EMAIL": "glyph-mergebot@users.noreply.github.com"}


def git_env() -> dict:
    """Process env with a bot identity filled in where none is configured (fresh CI runners)."""
    return {**BOT_ENV, **os.environ}


def git(root, *args, check=True, input_text=None) -> str:
    res = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True,
                         input=input_text, env=git_env())
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def base_branch() -> str:
    return os.environ.get("BASE_BRANCH", "main")


def current_branch(root) -> str:
    return git(root, "rev-parse", "--abbrev-ref", "HEAD").strip()


def commit_all(root, message: str, paths=None) -> str:
    """Stage `paths` (or everything) and commit. Returns the new sha, or '' when nothing changed."""
    targets = [p for p in (paths or ["."]) if (Path(root) / p).exists()]
    if not targets:
        return ""
    git(root, "add", "--", *targets)
    if not git(root, "diff", "--cached", "--name-only").strip():
        return ""
    git(root, "commit", "-m", message, "--no-verify")
    return git(root, "rev-parse", "HEAD").strip()


def remote_sync(root, push: bool = True, retries: int = 3):
    """pull --rebase then push, with retries. A no-op in dry mode."""
    if gh.dry():
        return
    for attempt in range(retries):
        git(root, "pull", "--rebase", "origin", base_branch())
        if not push:
            return
        res = subprocess.run(["git", "-C", str(root), "push", "origin", f"HEAD:{base_branch()}"],
                             capture_output=True, text=True)
        if res.returncode == 0:
            return
        time.sleep(2 ** attempt)
    raise RuntimeError("push to base failed after retries")


def branch_ref(root, branch: str):
    """Ref to read an agent branch from: the local branch, else origin/<branch>."""
    for ref in (f"refs/heads/{branch}", f"refs/remotes/origin/{branch}"):
        if subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", "-q", ref],
                          capture_output=True).returncode == 0:
            return ref
    return None


def changed_files(root, base_sha: str, head_sha: str) -> list:
    # Three dots: the PR's own changes since its merge base, not base commits the PR lacks.
    out = git(root, "diff", "--name-only", f"{base_sha}...{head_sha}")
    return [f for f in out.splitlines() if f]


def removed_test_lines(root, base_sha: str, head_sha: str, retired=()) -> bool:
    """True when an existing conformance test line was removed or changed.

    A test whose `rfc:` meta line (as on the base) names an RFC in `retired` does not count: the
    RFC it tested is superseded, so the test describes a language that no longer exists.
    """
    out = git(root, "diff", "-U0", f"{base_sha}...{head_sha}", "--", "conformance/")
    retired = {str(n).zfill(4) for n in retired}
    path, exempt = None, {}
    for line in out.splitlines():
        if line.startswith("diff --git "):
            path = None
        elif line.startswith("--- "):
            path = line[6:] if line.startswith("--- a/") else None
        elif line.startswith("-") and not line.startswith("---"):
            if path is None:
                return True
            if path not in exempt:
                exempt[path] = _test_rfc(root, base_sha, head_sha, path) in retired
            if not exempt[path]:
                return True
    return False


def _test_rfc(root, base_sha, head_sha, path):
    try:
        base = git(root, "merge-base", base_sha, head_sha).strip()
        text = git(root, "show", f"{base}:{path}")
    except Exception:
        return None
    m = re.search(r"^rfc:\s*(\d+)\s*$", text, re.M)
    return m.group(1).zfill(4) if m else None
