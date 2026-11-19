"""Thin wrapper over the gh CLI. With GLYPH_DRY=1 it prints the command and calls nothing."""
import os
import subprocess
import sys


def dry() -> bool:
    return os.environ.get("GLYPH_DRY") == "1"


def run(args, cwd=None, check=True, input_text=None) -> str:
    if dry():
        print("DRY gh " + " ".join(args), file=sys.stderr)
        return ""
    res = subprocess.run(["gh", *args], cwd=cwd, capture_output=True, text=True, input=input_text)
    if check and res.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def pr_close(number: int, comment: str, cwd=None):
    run(["pr", "close", str(number), "--comment", comment], cwd=cwd)


def pr_merged(number: int, sha: str, cwd=None):
    """Record a squash merge that was made locally, so GitHub marks the PR closed."""
    pr_close(number, f"Merged to base as {sha} by the merge bot.", cwd=cwd)
