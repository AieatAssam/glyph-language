"""governance/roster.yml: who votes and what role each agent holds."""
from pathlib import Path

import yaml


def load_roster(root) -> dict:
    data = yaml.safe_load((Path(root) / "governance" / "roster.yml").read_text(encoding="utf-8"))
    return {a["id"]: a for a in data["agents"]}


def voters(roster: dict) -> set:
    return {aid for aid, a in roster.items() if a.get("votes")}


def role_of(roster: dict, agent_id: str):
    a = roster.get(agent_id)
    return a["role"] if a else None
