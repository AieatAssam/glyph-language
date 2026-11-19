"""Hash chain: canonical encoding, idempotent append, schema validation, tamper detection."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.lib import audit


class AuditChainTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="glyph-audit-"))
        self.addCleanup(shutil.rmtree, self.root, True)

    def _append(self, idem=None, data=None):
        return audit.append_event(self.root, type="session_started", actor="tester",
                                  session="2026-11-19/c1/impl/tester", subject={},
                                  data=data or {"n": 1}, ts="2026-11-19T10:00:00Z", idem=idem)

    def test_canonical_json_is_sorted_compact_and_utf8(self):
        got = audit.canonical_json({"b": 1, "a": "é"})
        self.assertEqual(got, '{"a":"é","b":1}'.encode("utf-8"))

    def test_genesis_and_chain_links(self):
        first = self._append()
        second = self._append(data={"n": 2})
        self.assertEqual(first["seq"], 1)
        self.assertEqual(first["prev_hash"], audit.GENESIS)
        self.assertEqual(second["seq"], 2)
        self.assertEqual(second["prev_hash"], first["hash"])
        self.assertEqual(audit.head_hash(self.root), second["hash"])

    def test_idem_makes_append_idempotent(self):
        self.assertIsNotNone(self._append(idem="k1"))
        self.assertIsNone(self._append(idem="k1"))
        self.assertEqual(len(audit.load_events(self.root)), 1)

    def test_schema_rejects_unknown_event_type(self):
        with self.assertRaises(Exception):
            audit.append_event(self.root, type="not_a_type", actor="x", session="s", subject={},
                               data={}, ts="2026-11-19T10:00:00Z")

    def test_verify_passes_on_clean_chain(self):
        self._append()
        self._append(data={"n": 2})
        self.assertEqual(audit.verify_chain(self.root), (True, None))

    def test_verify_detects_edit_at_exact_seq(self):
        self._append()
        self._append(data={"n": 2})
        self._append(data={"n": 3})
        log = self.root / "audit" / "events.jsonl"
        lines = log.read_text(encoding="utf-8").splitlines()
        edited = json.loads(lines[1])
        edited["data"]["n"] = 999
        lines[1] = json.dumps(edited, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        log.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.assertEqual(audit.verify_chain(self.root), (False, 2))

    def test_verify_detects_deleted_line(self):
        self._append()
        self._append(data={"n": 2})
        self._append(data={"n": 3})
        log = self.root / "audit" / "events.jsonl"
        lines = log.read_text(encoding="utf-8").splitlines()
        log.write_text("\n".join([lines[0], lines[2]]) + "\n", encoding="utf-8")
        ok, bad = audit.verify_chain(self.root)
        self.assertFalse(ok)
        self.assertEqual(bad, 2)

    def test_empty_log_is_valid(self):
        self.assertEqual(audit.verify_chain(self.root), (True, None))
        self.assertEqual(audit.head_hash(self.root), audit.GENESIS)


if __name__ == "__main__":
    unittest.main()
