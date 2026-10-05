#!/usr/bin/env python3
"""Fold externally computed lower bounds into the website data (max wins).

``bounds/lower_bounds.json`` is the durable ledger of lower bounds that do not
come from the original experiment pipeline, keyed by instance name::

    {"realistic_70_31": {"lower_bound": 96270, "method": "LB_flow", "date": "2026-10-06"}}

For every instance the published ``lower_bound`` becomes the **maximum** of the
bound already in ``data/instances.json`` and the ledger's bound; the entry also
records where that winning bound comes from (``lower_bound_method``), and
``gap_pct`` / ``status`` are recomputed with the same formula as
build_instance_data.py and apply_submission.py.

A bound above the BKS is impossible for a valid bound and a correct BKS, so it
aborts the run instead of being published.

Idempotent: rerunning it changes nothing. build_instance_data.py calls
``fold_lower_bound`` too, so a full rebuild keeps these bounds.

Usage (from the repository root):
    python scripts/apply_lower_bounds.py           # apply
    python scripts/apply_lower_bounds.py --check   # report only, write nothing
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LEDGER = REPO_ROOT / "bounds" / "lower_bounds.json"
INSTANCES_JSON = REPO_ROOT / "data" / "instances.json"
INSTANCES_JS = REPO_ROOT / "data" / "instances.js"

# How the bounds in data/instances.json were obtained before any ledger entry.
DEFAULT_METHOD = "Branch-and-Price"


def load_ledger(path: Path = LEDGER) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))  # corrupt ledger -> abort


def fold_lower_bound(entry: dict, ledger: dict) -> bool:
    """Apply max(current, ledger) to one instance entry in place.

    Returns True when the entry changed. Raises ValueError if the resulting
    bound exceeds the BKS.
    """
    before = (entry.get("lower_bound"), entry.get("lower_bound_method"),
              entry.get("gap_pct"), entry.get("status"))

    current = entry.get("lower_bound")
    if current is not None and not entry.get("lower_bound_method"):
        entry["lower_bound_method"] = DEFAULT_METHOD

    rec = ledger.get(entry["name"])
    if rec is not None and (current is None or rec["lower_bound"] > current):
        entry["lower_bound"] = rec["lower_bound"]
        entry["lower_bound_method"] = rec["method"]

    lb, bks = entry.get("lower_bound"), entry.get("bks")
    if lb is not None and bks is not None and lb > bks + 1e-6:
        raise ValueError(f"{entry['name']}: lower bound {lb} exceeds BKS {bks}")
    if lb is not None and bks is not None and bks > 0:
        entry["gap_pct"] = round((bks - lb) / bks * 100, 2)
    else:
        entry["gap_pct"] = None
    entry["status"] = "optimal" if entry["gap_pct"] == 0.0 else "open"

    return before != (entry.get("lower_bound"), entry.get("lower_bound_method"),
                      entry.get("gap_pct"), entry.get("status"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report only, write nothing")
    args = parser.parse_args()

    ledger = load_ledger()
    instances = json.loads(INSTANCES_JSON.read_text(encoding="utf-8"))
    names = {e["name"] for e in instances}
    unknown = sorted(set(ledger) - names)
    if unknown:
        print(f"Ledger names not in the collection: {', '.join(unknown)}", file=sys.stderr)
        return 2

    changed = []
    for entry in instances:
        old_lb, old_gap = entry.get("lower_bound"), entry.get("gap_pct")
        try:
            if fold_lower_bound(entry, ledger) and entry.get("lower_bound") != old_lb:
                changed.append((entry["name"], old_lb, entry["lower_bound"], old_gap, entry["gap_pct"]))
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    for name, old_lb, new_lb, old_gap, new_gap in changed:
        print(f"{name:<20} LB {old_lb if old_lb is not None else '-':>12} -> {new_lb:>10}   "
              f"gap {old_gap if old_gap is not None else '-':>6} -> {new_gap}%")
    print(f"{len(changed)} lower bound(s) improved"
          + (" (check only, nothing written)" if args.check else ""))

    if not args.check:
        # Same serialization as build_instance_data.py / apply_submission.py.
        with open(INSTANCES_JSON, "w", encoding="utf-8", newline="\n") as f:
            json.dump(instances, f, indent=2)
            f.write("\n")
        with open(INSTANCES_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write("window.BDSP_INSTANCES = ")
            json.dump(instances, f, indent=2)
            f.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
