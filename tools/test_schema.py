"""Schema coverage: every event type the code emits is listed in events.schema.json.

Run from the repository root: python3 -m unittest tools.test_schema
"""
import json
import re
import unittest
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "tools" / "schemas" / "events.schema.json").read_text(encoding="utf-8"))
# Literal event types at the emit sites: mergebot `_emit(root, "type", ...)`,
# publisher `self._event(ses, i, "type", ...)`.
EMIT_SITES = {
    "tools/mergebot.py": re.compile(r'_emit\(\s*root,\s*"([a-z_]+)"'),
    "tools/publisher.py": re.compile(r'_event\(\s*ses,\s*i,\s*"([a-z_]+)"'),
}
ENVELOPE = {"seq": 1, "ts": "2026-11-19T00:00:00Z", "actor": "mergebot", "session": "",
            "prev_hash": "0" * 64, "idem": "x"}


class SchemaCoverageTests(unittest.TestCase):
    def test_emitted_types_are_in_schema(self):
        allowed = set(SCHEMA["properties"]["type"]["enum"])
        emitted = {}
        for rel, pattern in EMIT_SITES.items():
            text = (ROOT / rel).read_text(encoding="utf-8")
            for kind in pattern.findall(text):
                emitted.setdefault(kind, rel)
        self.assertTrue(emitted, "no emit sites found; the patterns are stale")
        missing = {k: rel for k, rel in emitted.items() if k not in allowed}
        self.assertFalse(missing, f"event types emitted but not in the schema: {missing}")

    def test_schema_accepts_new_event_types(self):
        validator = jsonschema.Draft202012Validator(SCHEMA)
        samples = [
            {"type": "cycle_started", "subject": {}, "data": {"cycle": "1"}},
            {"type": "release", "subject": {}, "data": {"artifact": "compiler/bootstrap/glyphc.wasm",
                                                        "sha256": "0" * 64, "bytes": 1}},
        ]
        for sample in samples:
            event = {**ENVELOPE, **sample}
            with self.subTest(type=sample["type"]):
                validator.validate(event)


if __name__ == "__main__":
    unittest.main()
