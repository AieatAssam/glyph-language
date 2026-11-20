import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class CheckActions(unittest.TestCase):
    def run_on(self, doc):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "actions.json")
            p.write_text(json.dumps(doc))
            return subprocess.run([sys.executable, "-m", "tools.check_actions", str(p)], cwd=ROOT,
                                  capture_output=True, text=True)

    def test_prompt_example_is_valid(self):
        text = (ROOT / "agents/prompts/base.md").read_text()
        example = json.loads(re.search(r"```json\n(.*?)```", text, re.S).group(1))
        r = self.run_on(example)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_digest_without_title_fails(self):
        r = self.run_on({"actions": [{"type": "digest", "body": "x"}]})
        self.assertNotEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
