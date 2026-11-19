"""Write the fixed stratified gate subset: 2 dev tasks per category, chosen by sorted id.

python -m bench.harness.subset [--tasks DIR] [--out FILE]
"""
import argparse
from collections import defaultdict
from pathlib import Path

from . import common as C


def pick(tasks: dict[str, dict], per_category: int = 2) -> list[str]:
    by_cat = defaultdict(list)
    for tid in sorted(tasks):
        by_cat[tasks[tid]["category"]].append(tid)
    chosen = []
    for cat in C.CATEGORIES:
        chosen.extend(by_cat[cat][:per_category])
    return sorted(chosen)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", type=Path, default=C.DEV_TASKS)
    ap.add_argument("--out", type=Path, default=C.SUBSET_FILE)
    a = ap.parse_args()
    ids = pick(C.load_tasks(a.tasks))
    a.out.write_text("\n".join(ids) + "\n", encoding="utf-8")
    print(f"wrote {len(ids)} ids to {a.out}")


if __name__ == "__main__":
    main()
