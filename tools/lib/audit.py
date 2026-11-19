"""Hash-chained, append-only event log at audit/events.jsonl (CONTRACTS.md, spec section 11)."""
import hashlib
import json
import os
from pathlib import Path

import jsonschema

GENESIS = "0" * 64
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schemas" / "events.schema.json"
_schema = None


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _log(root) -> Path:
    return Path(root) / "audit" / "events.jsonl"


def _digest(entry: dict) -> str:
    return hashlib.sha256(canonical_json(entry)).hexdigest()


def load_events(root) -> list:
    p = _log(root)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def head_hash(root) -> str:
    events = load_events(root)
    return events[-1]["hash"] if events else GENESIS


def append_event(root, *, type, actor, session, subject, data, ts, idem=None):
    """Append one event. Returns the stored entry, or None when `idem` is already present."""
    global _schema
    events = load_events(root)
    if idem is not None and any(e.get("idem") == idem for e in events):
        return None
    if _schema is None:
        _schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    entry = {
        "seq": len(events) + 1,
        "ts": ts,
        "type": type,
        "actor": actor,
        "session": session,
        "subject": dict(subject),
        "data": data,
        "idem": idem,
        "prev_hash": events[-1]["hash"] if events else GENESIS,
    }
    jsonschema.validate(entry, _schema)
    entry["hash"] = _digest(entry)
    p = _log(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "ab") as f:
        f.write(canonical_json(entry) + b"\n")
    return entry


def verify_chain(root):
    """Return (ok, first_bad_seq). Any edit to a line breaks its own hash at that seq."""
    p = _log(root)
    if not p.exists():
        return True, None
    prev = GENESIS
    seq = 0
    for raw in p.read_bytes().splitlines():
        seq += 1
        if not raw.strip():
            return False, seq
        try:
            e = json.loads(raw)
        except ValueError:
            return False, seq
        if not isinstance(e, dict) or e.get("seq") != seq or e.get("prev_hash") != prev:
            return False, seq
        body = {k: v for k, v in e.items() if k != "hash"}
        if e.get("hash") != _digest(body):
            return False, seq
        prev = e["hash"]
    return True, None


def cycle_id(run_date: str, cycle) -> str:
    """Session prefix. GLYPH_RUN (the workflow run id) keeps two runs on one date apart; re-runs keep it."""
    run = os.environ.get("GLYPH_RUN")
    return f"{run_date}/r{run}/c{cycle}" if run else f"{run_date}/c{cycle}"
