"""The one place where code the candidate controls is started (SPEC section 6 sandbox).

Untrusted code: bin/glyphc, node compiler/..., wasm runs through node or wasmtime, python3 on
generated programs, and the built executables of the native gate. The trusted checker (or bench
execute) runs as root inside the sandbox container and writes the result. The container drops
every capability except SETUID and SETGID, so run() drops the untrusted command to an
unprivileged uid with setpriv. A different uid cannot write the root-owned /out volume or open
the checker's /proc entries.

Inside the sandbox (GLYPH_SANDBOX_DROP=1, set by tools/sandbox/run.sh) run() prefixes the command
with `setpriv` and a `timeout` that runs as the untrusted uid. The untrusted uid must do the
killing, because the capless checker cannot signal it (kill returns EPERM). Outside the sandbox
run() is subprocess.run unchanged, so local development and tests behave as before.
"""
from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ENV = "GLYPH_SANDBOX_DROP"
UNTRUSTED_UID = 65534
DEFAULT_TIMEOUT = 300  # seconds, used when a caller gives none
BACKSTOP = 5           # the checker's own timeout is this much later than the kill


def enabled() -> bool:
    return os.environ.get(ENV) == "1"


def prefix(timeout: float) -> list[str]:
    return ["setpriv", "--reuid=%d" % UNTRUSTED_UID, "--regid=%d" % UNTRUSTED_UID,
            "--clear-groups", "--no-new-privs",
            "timeout", "-s", "KILL", str(int(timeout))]


def harden() -> None:
    """Call once at the start of a trusted entry point. Inside the sandbox, directories and files
    the checker creates must be writable by the untrusted uid, so the umask is cleared."""
    if enabled():
        os.umask(0)


def run(cmd, **kw) -> subprocess.CompletedProcess:
    """subprocess.run for untrusted commands. Same arguments and result as subprocess.run.

    A command killed for running past its timeout raises subprocess.TimeoutExpired, the same as
    subprocess.run does.
    """
    if not enabled():
        return subprocess.run(cmd, **kw)
    limit = kw.pop("timeout", None) or DEFAULT_TIMEOUT
    p = subprocess.run([*prefix(limit), *cmd], timeout=limit + BACKSTOP, **kw)
    if p.returncode == 124:  # GNU timeout's status for "killed at the limit"
        raise subprocess.TimeoutExpired(cmd, limit)
    return p


def mkdtemp(prefix: str = "tmp", dir=None) -> Path:
    """A fresh directory the untrusted side can write into (mode 0777 when sandboxed)."""
    d = Path(tempfile.mkdtemp(prefix=prefix, dir=None if dir is None else str(dir)))
    if enabled():
        os.chmod(d, 0o777)
    return d


@contextlib.contextmanager
def scratch(prefix: str):
    """A scratch directory under TMPDIR (the sandbox's /work). Removed on exit, even when the
    untrusted side left root-unowned subdirectories behind."""
    d = mkdtemp(prefix)
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)
