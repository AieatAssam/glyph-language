"""Verify the audit hash chain and replay it. Exit 1 when the chain is broken (spec section 11)."""
import json
import os
import sys
from pathlib import Path

from tools.lib import audit, state


def main(argv=None) -> int:
    root = Path(os.environ.get("GLYPH_ROOT") or os.getcwd())
    ok, bad = audit.verify_chain(root)
    if not ok:
        print(json.dumps({"ok": False, "first_bad_seq": bad}, sort_keys=True))
        return 1
    st = state.load_state(root)
    print(json.dumps({"ok": True, "events": len(audit.load_events(root)),
                      "head_hash": st["head_hash"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
