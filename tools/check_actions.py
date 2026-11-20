"""Validate an agent's actions file: python3 -m tools.check_actions [out/actions.json]. Exit 1 on error."""
import json
import sys
from pathlib import Path

import jsonschema

schema = json.loads((Path(__file__).parent / "schemas/actions.schema.json").read_text(encoding="utf-8"))
path = Path(sys.argv[1] if len(sys.argv) > 1 else "out/actions.json")
try:
    jsonschema.validate(json.loads(path.read_text(encoding="utf-8")), schema)
except (OSError, ValueError, jsonschema.ValidationError) as exc:
    sys.exit(f"{path}: {exc}")
print(f"{path}: ok")
