"""Scripted M1 agent: answers one assignment from the state in its header. Deterministic, no network.

    python -m tools.scripted.agent <agent-id> <assignment-file> <outdir>

The plays live in tools/scripted/plays.py and read tools/scripted/fixtures. SCRIPTED_ATTACK selects
a bad-agent attack instead (tools/scripted/bad_agent.py).
"""
import json
import os
import sys
from pathlib import Path


def read_assignment(assignment: Path) -> tuple[dict, str]:
    head, _, body = assignment.read_text(encoding="utf-8").partition("-->")
    return json.loads(head.removeprefix("<!-- assignment ").strip()), body


def write_out(outdir: Path, actions: list, files: dict) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "actions.json").write_text(json.dumps({"actions": actions}, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    for rel, text in sorted(files.items()):
        target = outdir / "files" / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")


def main(argv) -> int:
    agent, assignment, outdir = argv
    attack = os.environ.get("SCRIPTED_ATTACK")
    if attack:
        from tools.scripted import bad_agent
        actions, files = bad_agent.attack(attack, agent)
    else:
        from tools.scripted import plays
        header, body = read_assignment(Path(assignment))
        actions, files = plays.respond(header, body)
    write_out(Path(outdir), actions, files)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
