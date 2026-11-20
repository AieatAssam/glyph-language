"""End-to-end two-night run via tools/e2e_night.py. Slow (minutes), so it runs only with GLYPH_E2E=1."""
import os
import unittest

from tools import e2e_night


@unittest.skipUnless(os.environ.get("GLYPH_E2E") == "1", "set GLYPH_E2E=1 to run the two-night harness")
class TwoNightRun(unittest.TestCase):
    def test_two_nights_pass_all_assertions(self):
        report = e2e_night.run_e2e()
        self.assertIsNone(report["aborted"], report.get("aborted"))
        failed = [(name, detail) for name, passed, detail in e2e_night.checks(report) if not passed]
        self.assertEqual(failed, [])


if __name__ == "__main__":
    unittest.main()
