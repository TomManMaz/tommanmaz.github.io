#!/usr/bin/env python3
"""
Validate a community-submitted BDSP solution and, if it is feasible AND strictly
better than the current best known solution (BKS), patch the website data in
place so the instance is listed with the new BKS.

This is the CI-side counterpart to ``build_instance_data.py``. The full build
script depends on data that lives only on the maintainer's machine (the
instance-generator package and the JAIR experiment results), so it cannot run in
GitHub Actions. This script instead performs a *surgical* update of a single
instance using only files that are committed to the repository:

    * the instance definition  -> downloads/instances/<name>.json
    * the bundled validator     -> bdsp-validator/
    * the existing data         -> data/instances.json (+ data/instances.js)

It never trusts a user-claimed objective: feasibility and the objective are
recomputed from the submitted assignment matrix. A submission is accepted only
when the validator confirms that every leg is covered exactly once, every
employee satisfies the hard constraints, and the recomputed objective is
strictly lower than the stored BKS.

Usage
-----
    # Dry run (validate + report only, no files changed):
    python scripts/apply_submission.py --solution submissions/realistic_10_1.csv

    # Apply (writes data/instances.json, data/instances.js and sols/<name>.csv
    # when the submission is accepted):
    python scripts/apply_submission.py \
        --solution submissions/realistic_10_1.csv \
        --author octocat --apply --result-json result.json

Exit codes: 0 = valid (accepted or no-improvement), 1 = invalid solution,
2 = error (unknown instance / unreadable file). The full result is always
printed to stdout as JSON and, optionally, written to ``--result-json``.

Requires: sortedcontainers (the only dependency of bdsp-validator).
"""

import argparse
import datetime
import json
import logging
import shutil
import sys
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR_DIR = REPO_ROOT / "bdsp-validator"
DOWNLOADS_INSTANCES_DIR = REPO_ROOT / "downloads" / "instances"
SOLUTIONS_DIR = REPO_ROOT / "sols"
INSTANCES_JSON = REPO_ROOT / "data" / "instances.json"
INSTANCES_JS = REPO_ROOT / "data" / "instances.js"

# ---------------------------------------------------------------------------
# Import the bundled validator. validator.py only defines its module-level
# ``logger`` inside its ``__main__`` block, so we provide one before importing
# the Validator class (otherwise Validator.report() raises NameError).
# ---------------------------------------------------------------------------
sys.path.insert(0, str(VALIDATOR_DIR))
import validator as _validator_module  # noqa: E402

if not hasattr(_validator_module, "logger"):
    _validator_module.logger = logging.getLogger("bdsp-validator")

from validator import Validator  # noqa: E402
from data.instance import Instance as ValidatorInstance  # noqa: E402


class SubmissionError(Exception):
    """Raised for unrecoverable problems (unknown instance, missing files)."""


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
def _resolve_instance_name(solution_path: Path, explicit: str | None) -> str:
    """The instance name is the explicit value or the solution file stem."""
    return explicit if explicit else solution_path.stem


def _instance_json_path(instance_name: str) -> Path:
    return DOWNLOADS_INSTANCES_DIR / f"{instance_name}.json"


def _compute_gap_and_status(bks: float, lower_bound):
    """Mirror build_instance_data.py: gap = (bks - lb) / bks * 100."""
    if bks is not None and lower_bound is not None and bks > 0:
        gap_pct = round((bks - lower_bound) / bks * 100, 2)
    else:
        gap_pct = None
    status = "optimal" if gap_pct is not None and gap_pct == 0.0 else "open"
    return gap_pct, status


def _validate(instance_name: str, solution_path: Path):
    """Run the bundled validator. Returns (is_valid, objective, breakdown, errors)."""
    inst_file = _instance_json_path(instance_name)
    if not inst_file.exists():
        raise SubmissionError(
            f"No instance definition found for '{instance_name}' "
            f"(expected {inst_file.relative_to(REPO_ROOT)})."
        )

    v_instance = ValidatorInstance.from_json(str(inst_file))
    v_instance.name = instance_name
    # Solution.from_file calls path.open(), so pass a Path, not a str.
    validator = Validator(v_instance, Path(solution_path))
    is_valid = validator.validate()

    objective = int(round(validator.solution.value))
    breakdown = {
        "total_objective": objective,
        "feasible": bool(validator.solution.feasible),
        "num_employees": len(validator.solution.employees),
        "employees": [
            {
                "employee": r["employee"],
                "feasible": bool(r["feasible"]),
                "objective": int(round(r["objective"])),
                "work_time_paid": int(round(r["work_time_paid"])),
                "total_time": int(round(r["total_time"])),
                "ride": int(round(r["ride"])),
                "vehicle_changes": int(round(r["vehicle_changes"])),
                "split_shifts": int(round(r["split_shifts"])),
                "drive_time": int(round(r["drive_time"])),
                "num_legs": int(r["num_legs"]),
            }
            for r in validator.get_breakdown()
        ],
    }
    return is_valid, objective, breakdown, list(validator.errors)


def process_submission(
    solution_path: Path,
    instance_name: str | None = None,
    author: str = "anonymous",
    date: str | None = None,
    apply: bool = False,
) -> dict:
    """Validate one submission and (optionally) apply it. Returns a result dict."""
    date = date or datetime.date.today().isoformat()
    instance_name = _resolve_instance_name(solution_path, instance_name)

    result = {
        "instance": instance_name,
        "author": author,
        "solution_file": solution_path.name,
        "status": "error",
        "valid": False,
        "objective": None,
        "previous_bks": None,
        "new_bks": None,
        "gap_pct": None,
        "status_label": None,
        "improved": False,
        "applied": False,
        "errors": [],
        "message": "",
    }

    if not solution_path.exists():
        result["errors"] = [f"Solution file not found: {solution_path}"]
        result["message"] = result["errors"][0]
        return result

    # Locate the instance entry in the committed data.
    if not INSTANCES_JSON.exists():
        raise SubmissionError(f"{INSTANCES_JSON} not found.")
    with open(INSTANCES_JSON, encoding="utf-8") as f:
        instances = json.load(f)
    index = next((i for i, e in enumerate(instances) if e.get("name") == instance_name), None)
    if index is None:
        result["errors"] = [f"Unknown instance '{instance_name}'."]
        result["message"] = result["errors"][0]
        return result

    entry = instances[index]
    prev_bks = entry.get("bks")
    result["previous_bks"] = prev_bks
    result["new_bks"] = prev_bks

    # Validate (recomputes feasibility + objective from the matrix).
    try:
        is_valid, objective, breakdown, errors = _validate(instance_name, solution_path)
    except SubmissionError:
        raise
    except Exception as exc:  # malformed CSV, wrong width, etc.
        result["errors"] = [f"Could not parse/evaluate the solution: {exc}"]
        result["status"] = "invalid"
        result["message"] = result["errors"][0]
        return result

    result["objective"] = objective
    result["errors"] = errors

    if not is_valid:
        result["status"] = "invalid"
        result["message"] = "Solution is infeasible or does not cover all legs exactly once."
        return result

    result["valid"] = True

    # Improvement check: strictly better than the stored BKS.
    improved = prev_bks is None or objective < prev_bks
    if not improved:
        result["status"] = "valid_no_improvement"
        result["message"] = (
            f"Feasible, objective {objective} but not better than the current BKS {prev_bks}."
        )
        return result

    # Accepted.
    gap_pct, status_label = _compute_gap_and_status(objective, entry.get("lower_bound"))
    result["status"] = "accepted"
    result["improved"] = True
    result["new_bks"] = objective
    result["gap_pct"] = gap_pct
    result["status_label"] = status_label
    delta = "" if prev_bks is None else f" (improved by {prev_bks - objective} over {prev_bks})"
    result["message"] = f"New best known solution for {instance_name}: {objective}{delta}."

    if apply:
        # 1. Patch the instance entry in place.
        entry["bks"] = objective
        entry["best_algorithm"] = author
        entry["bks_source"] = "community"
        entry["submitted_by"] = author
        entry["submitted_at"] = date
        entry["gap_pct"] = gap_pct
        entry["status"] = status_label
        entry["solution_breakdown"] = breakdown
        instances[index] = entry

        # 2. Save the accepted solution as the canonical best solution
        #    (skip the copy when the submission already is that file).
        SOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)
        dest = SOLUTIONS_DIR / f"{instance_name}.csv"
        if Path(solution_path).resolve() != dest.resolve():
            shutil.copyfile(solution_path, dest)

        # 3. Rewrite both data files (same serialization as build_instance_data.py).
        with open(INSTANCES_JSON, "w", encoding="utf-8") as f:
            json.dump(instances, f, indent=2)
        with open(INSTANCES_JS, "w", encoding="utf-8") as f:
            f.write("window.BDSP_INSTANCES = ")
            json.dump(instances, f, indent=2)
            f.write(";\n")

        # 4. Record acceptance in the durable ledger so a future full rebuild
        #    (build_instance_data.py) keeps this community BKS instead of
        #    regressing it to the best algorithmic value.
        ledger_file = REPO_ROOT / "submissions" / "accepted.json"
        ledger_file.parent.mkdir(parents=True, exist_ok=True)
        ledger = {}
        if ledger_file.exists():
            try:
                ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
            except Exception:
                ledger = {}
        ledger[instance_name] = {"author": author, "date": date, "objective": objective}
        ledger_file.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        result["applied"] = True

    return result


def _exit_code(status: str) -> int:
    return {"accepted": 0, "valid_no_improvement": 0, "invalid": 1}.get(status, 2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and apply a BDSP solution submission.")
    parser.add_argument("--solution", "-s", required=True, help="Path to the submitted solution CSV.")
    parser.add_argument("--instance", "-i", default=None,
                        help="Instance name (default: inferred from the solution filename).")
    parser.add_argument("--author", "-a", default="anonymous", help="Submitter handle, for attribution.")
    parser.add_argument("--date", default=None, help="Submission date YYYY-MM-DD (default: today).")
    parser.add_argument("--apply", action="store_true",
                        help="Write changes when accepted (default: dry run).")
    parser.add_argument("--result-json", default=None, help="Also write the result dict to this path.")
    args = parser.parse_args()

    try:
        result = process_submission(
            solution_path=Path(args.solution),
            instance_name=args.instance,
            author=args.author,
            date=args.date,
            apply=args.apply,
        )
    except SubmissionError as exc:
        result = {"status": "error", "valid": False, "errors": [str(exc)], "message": str(exc),
                  "instance": args.instance, "author": args.author}
    except Exception as exc:  # pragma: no cover - defensive
        result = {"status": "error", "valid": False,
                  "errors": [f"{exc}", traceback.format_exc()], "message": str(exc)}

    text = json.dumps(result, indent=2)
    print(text)
    if args.result_json:
        Path(args.result_json).write_text(text + "\n", encoding="utf-8")

    return _exit_code(result.get("status", "error"))


if __name__ == "__main__":
    sys.exit(main())
