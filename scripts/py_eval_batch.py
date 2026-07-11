#!/usr/bin/env python3
"""Batch reference evaluator over the bundled bdsp-validator.

Used by scripts/parity_test.js and scripts/fuzz_parity.js to compare the
JavaScript validator core (js/bdsp_validator_core.js) against the Python
reference implementation. A single process evaluates many
(instance, solution) pairs so interpreter start-up is paid once.

Usage:
    python scripts/py_eval_batch.py <manifest.jsonl> <out.jsonl>

Each manifest line:
    {"id": "...", "instance": "<path to instance .json>",
     "solution": "<path to solution .csv>"}

Each output line (same order as the manifest):
    {"id": "...", "total": <number>, "feasible": <bool>, "covered": <bool>,
     "unassigned": <int>, "duplicates": <int>, "num_employees": <int>,
     "employees": [{...}]}

Values are emitted raw (ints, or floats that JSON-normalize to the same
number in JS); the Node side compares with strict numeric equality.

Requires: sortedcontainers (pip install sortedcontainers).
"""

import json
import logging
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR_DIR = REPO_ROOT / "bdsp-validator"

# validator.py only defines its module-level ``logger`` inside its
# ``__main__`` block; provide one before anything imports it (same
# pattern as scripts/apply_submission.py).
sys.path.insert(0, str(VALIDATOR_DIR))
import validator as _validator_module  # noqa: E402

if not hasattr(_validator_module, "logger"):
    _validator_module.logger = logging.getLogger("bdsp-validator")

from data.instance import Instance  # noqa: E402
from data.solution import Solution  # noqa: E402


def employee_record(e) -> dict:
    s = e.state
    return {
        "name": e.name,
        "feasible": bool(s.feasible),
        # State.evaluate() returns hard + soft; Employee.objective stores it.
        "total_cost": e.objective,
        # Soft part only (what the JS core calls state.objective).
        "objective": s.objective,
        "work_time_paid": s.actual_work_time,
        "total_time": s.total_time,
        "ride": s.ride,
        "vehicle_changes": s.change,
        "split_shifts": s.split,
        "drive_time": s.drive_time,
        "bus_penalty": s.bus_penalty,
        "drive_penalty": s.drive_penalty,
        "rest_penalty": s.rest_penalty,
        "work_time": s.work_time,
        "unpaid": s.unpaid,
        "upmax": s.upmax,
        "num_legs": len(e.legs),
    }


def evaluate_pair(instance, solution_path: Path) -> dict:
    solution = Solution.from_file(instance, solution_path)
    solution.evaluate()

    counts = Counter()
    for employee in solution.employees:
        for leg in employee.legs:
            counts[leg.id] += 1
    unassigned = sum(1 for leg in instance.legs if counts[leg.id] == 0)
    duplicates = sum(1 for leg in instance.legs if counts[leg.id] > 1)

    return {
        "total": solution.value,
        "feasible": bool(solution.feasible),
        "covered": unassigned == 0 and duplicates == 0,
        "unassigned": unassigned,
        "duplicates": duplicates,
        "num_employees": len(solution.employees),
        "employees": [employee_record(e) for e in solution.employees],
    }


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    manifest_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    instances = {}  # instance path -> Instance (fuzzing reuses instances)

    with manifest_path.open("r", encoding="utf-8") as manifest, \
            out_path.open("w", encoding="utf-8") as out:
        for line in manifest:
            line = line.strip()
            if not line:
                continue
            job = json.loads(line)
            inst_path = job["instance"]
            if inst_path not in instances:
                instance = Instance.from_json(str(inst_path))
                # from_json derives the name by splitting on '/', which is
                # wrong for Windows paths; the name is cosmetic, fix it anyway.
                instance.name = Path(inst_path).stem
                instances[inst_path] = instance
            result = {"id": job["id"]}
            result.update(evaluate_pair(instances[inst_path], Path(job["solution"])))
            out.write(json.dumps(result) + "\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
