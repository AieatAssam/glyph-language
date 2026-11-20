import unittest

from tools.lib import rfc as F


class Lapse(unittest.TestCase):
    def test_only_non_founding_rfcs_lapse(self):
        st = {"cycles": [f"2026-11-{d:02d}/c1" for d in range(1, 11)]}
        rules = {"implementing_max_nights": 7}
        for slug, lapses in (("kernel-v8", False), ("diagnostic-style", False), ("name", False),
                             ("lexical-syntax-v3", False), ("byte-type", True)):
            with self.subTest(slug=slug):
                rec = {"slug": slug, "status": "implementing", "status_cycle": 0}
                self.assertEqual(F.implementing_lapsed(st, rec, rules), lapses)


if __name__ == "__main__":
    unittest.main()
