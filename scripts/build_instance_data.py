#!/usr/bin/env python3
"""
Build data/instances.json for the BDSP website.

Reads from four sources:
1. Instance JSON files → features (via instance-generator's Instance class)
2. Algorithm results from final_FINAL/ → per-algorithm stats (JAIR)
3. BKS CSV files → old algorithm results + lower bounds (realistic only)
4. metadata_paper.csv → PATAT 2024 instances (284 total, 12 source types)

Usage:
    python scripts/build_instance_data.py

Requires: numpy, pandas, sortedcontainers
Also requires the instance-generator package to be importable (add to sys.path).
"""

import csv
import json
import sys
from pathlib import Path

import numpy as np

# Add instance-generator to path so we can import Instance and get_features
INSTANCE_GENERATOR_DIR = Path.home() / "instance-generator"
sys.path.insert(0, str(INSTANCE_GENERATOR_DIR))

from classes.instance import Instance

# Add bdsp-validator to path for solution validation
VALIDATOR_DIR = Path(__file__).resolve().parent.parent / "bdsp-validator"
sys.path.insert(0, str(VALIDATOR_DIR))

from data.instance import Instance as ValidatorInstance
from data.solution import Solution as ValidatorSolution

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTANCE_JSON_DIR = Path.home() / "busdriverschedulingproblem" / "files" / "instances" / "json"
RESULTS_DIR = Path.home() / "laboratorio" / "bdsp" / "data" / "jair" / "final_FINAL"
BKS_CSV_1 = REPO_ROOT / "BKS_realistic_1.csv"
BKS_CSV_2 = REPO_ROOT / "BKS_realistic_2.csv"
PATAT_CSV = REPO_ROOT / "metadata_paper.csv"
SOLUTIONS_DIR = REPO_ROOT / "sols"
DOWNLOADS_INSTANCES_DIR = REPO_ROOT / "downloads" / "instances"
OUTPUT_FILE = REPO_ROOT / "data" / "instances.json"

# Instance sizes (for reference)
REALISTIC_INSTANCES = [
    f"realistic_{size}_{i}"
    for size in [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250]
    for i in range(
        {10: 1, 20: 6, 30: 11, 40: 16, 50: 21, 60: 26, 70: 31, 80: 36, 90: 41, 100: 46, 150: 51, 200: 56, 250: 61}[size],
        {10: 1, 20: 6, 30: 11, 40: 16, 50: 21, 60: 26, 70: 31, 80: 36, 90: 41, 100: 46, 150: 51, 200: 56, 250: 61}[size] + 5,
    )
]


# ---------------------------------------------------------------------------
# Feature extraction (mirrors pipeline.py get_features)
# ---------------------------------------------------------------------------

def get_features(instance: Instance) -> dict:
    """Extract all features from a BDSP instance."""
    features = {
        "n_tours": instance.n_tours,
        "n_legs": instance.n_legs,
        "n_position_used": instance.n_position_used,
        "drive_min": float(instance.drive_min),
        "drive_max": float(instance.drive_max),
        "drive_mean": float(instance.drive_mean),
        "drive_median": float(instance.drive_median),
        "drive_std": float(instance.drive_std),
        "drive_first_quantile": float(instance.drive_first_quantile),
        "drive_third_quartile": float(instance.drive_third_quartile),
        "diff_min": float(instance.diff_min),
        "diff_max": float(instance.diff_max),
        "diff_mean": float(instance.diff_mean),
        "diff_median": float(instance.diff_median),
        "diff_std": float(instance.diff_std),
        "diff_first_quantile": float(instance.diff_first_quantile),
        "diff_third_quartile": float(instance.diff_third_quartile),
        "max_active_buses": instance.max_active_buses,
        "average_distance": float(instance.average_distance),
        "huge": float(instance.huge),
        "large": float(instance.large),
        "medium": float(instance.medium),
        "small": float(instance.small),
        "tiny": float(instance.tiny),
    }

    def add_stats(prefix, values):
        if not values:
            for suffix in ["max", "min", "mean", "median", "std", "q1", "q3"]:
                features[f"{prefix}_{suffix}"] = 0
            return
        features[f"{prefix}_max"] = float(max(values))
        features[f"{prefix}_min"] = float(min(values))
        features[f"{prefix}_mean"] = float(np.mean(values))
        features[f"{prefix}_median"] = float(np.median(values))
        features[f"{prefix}_std"] = float(np.std(values))
        features[f"{prefix}_q1"] = float(np.percentile(values, 25))
        features[f"{prefix}_q3"] = float(np.percentile(values, 75))

    add_stats("num_legs_per_tour", instance.num_legs_per_tour)
    add_stats("total_time_per_tour", instance.total_time_per_tour)
    add_stats("number_breaks_per_tour", instance.number_breaks_per_tour)
    add_stats("number_proper_breaks_per_tour", instance.number_of_proper_breaks_per_tour)
    add_stats("proportion_large_legs_per_tour", instance.proportion_of_large_legs_per_tour)

    return features


# ---------------------------------------------------------------------------
# Read BKS CSVs (old algorithms)
# ---------------------------------------------------------------------------

def read_bks_csvs() -> dict:
    """Read BKS_realistic_1.csv and BKS_realistic_2.csv.

    Returns dict keyed by instance name with tours, legs, old algorithm values, bound.
    Note: CSV uses +AF8- encoding for underscores.

    BKS_realistic_1.csv columns: Instances,tours,legs,BP,SA,HC,TS,CMSA,LNS,bound
    BKS_realistic_2.csv columns: Instances,n+AF8-tours,n+AF8-legs,SA,HC,TS,CMSA,LNS (no BP, no bound)
    """
    data = {}
    for csv_path in [BKS_CSV_1, BKS_CSV_2]:
        if not csv_path.exists():
            print(f"WARNING: {csv_path} not found, skipping")
            continue
        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            # Normalize field names: +AF8- → _
            norm_fields = {fn: fn.replace("+AF8-", "_") for fn in fieldnames}

            for row in reader:
                # Decode +AF8- to underscore in instance name
                name = row["Instances"].replace("+AF8-", "_")

                # Find tours/legs columns (may be "tours" or "n_tours")
                tours_val = None
                legs_val = None
                for orig, norm in norm_fields.items():
                    if norm in ("tours", "n_tours") and row[orig]:
                        tours_val = int(float(row[orig]))
                    if norm in ("legs", "n_legs") and row[orig]:
                        legs_val = int(float(row[orig]))

                bound = None
                if "bound" in row and row["bound"]:
                    bound = float(row["bound"])

                data[name] = {
                    "tours": tours_val or 0,
                    "legs": legs_val or 0,
                    "old_algorithms": {},
                    "bound": bound,
                }
                for algo in ["BP", "SA", "HC", "TS", "CMSA", "LNS"]:
                    if algo in row and row[algo]:
                        data[name]["old_algorithms"][algo] = float(row[algo])
    return data


# ---------------------------------------------------------------------------
# Read PATAT metadata CSV (284 instances, 12 source types)
# ---------------------------------------------------------------------------

# Mapping from CSV feature column names to our internal feature keys
PATAT_FEATURE_MAP = {
    "feature_n_tours": "n_tours",
    "feature_n_legs": "n_legs",
    "feature_n_position_used": "n_position_used",
    "feature_drive_min": "drive_min",
    "feature_drive_max": "drive_max",
    "feature_drive_mean": "drive_mean",
    "feature_drive_median": "drive_median",
    "feature_drive_std": "drive_std",
    "feature_drive_first_quantile": "drive_first_quantile",
    "feature_drive_third_quartile": "drive_third_quartile",
    "feature_diff_min": "diff_min",
    "feature_diff_max": "diff_max",
    "feature_diff_mean": "diff_mean",
    "feature_diff_median": "diff_median",
    "feature_diff_std": "diff_std",
    "feature_diff_first_quantile": "diff_first_quantile",
    "feature_diff_third_quartile": "diff_third_quartile",
    "feature_max_active_buses": "max_active_buses",
    "feature_average_distance": "average_distance",
    "feature_huge": "huge",
    "feature_large": "large",
    "feature_medium": "medium",
    "feature_small": "small",
    "feature_tiny": "tiny",
    "feature_max_num_legs_per_tour": "num_legs_per_tour_max",
    "feature_min_num_legs_per_tour": "num_legs_per_tour_min",
    "feature_mean_num_legs_per_tour": "num_legs_per_tour_mean",
    "feature_median_num_legs_per_tour": "num_legs_per_tour_median",
    "feature_std_num_legs_per_tour": "num_legs_per_tour_std",
    "feature_1st_quantile_num_legs_per_tour": "num_legs_per_tour_q1",
    "feature_3rd_quantile_num_legs_per_tour": "num_legs_per_tour_q3",
    "feature_max_total_time_per_tour": "total_time_per_tour_max",
    "feature_min_total_time_per_tour": "total_time_per_tour_min",
    "feature_mean_total_time_per_tour": "total_time_per_tour_mean",
    "feature_median_total_time_per_tour": "total_time_per_tour_median",
    "feature_std_total_time_per_tour": "total_time_per_tour_std",
    "feature_1st_quantile_total_time_per_tour": "total_time_per_tour_q1",
    "feature_3rd_quantile_total_time_per_tour": "total_time_per_tour_q3",
    "feature_max_number_breaks_per_tour": "number_breaks_per_tour_max",
    "feature_min_number_breaks_per_tour": "number_breaks_per_tour_min",
    "feature_mean_number_breaks_per_tour": "number_breaks_per_tour_mean",
    "feature_median_number_breaks_per_tour": "number_breaks_per_tour_median",
    "feature_std_number_breaks_per_tour": "number_breaks_per_tour_std",
    "feature_1st_quantile_number_breaks_per_tour": "number_breaks_per_tour_q1",
    "feature_3rd_quantile_number_breaks_per_tour": "number_breaks_per_tour_q3",
    "feature_max_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_max",
    "feature_min_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_min",
    "feature_mean_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_mean",
    "feature_median_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_median",
    "feature_std_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_std",
    "feature_1st_quantile_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_q1",
    "feature_3rd_quantile_number_of_proper_breaks_per_tour": "number_proper_breaks_per_tour_q3",
    "feature_max_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_max",
    "feature_min_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_min",
    "feature_mean_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_mean",
    "feature_median_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_median",
    "feature_std_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_std",
    "feature_1st_quantile_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_q1",
    "feature_3rd_quantile_proportion_of_large_legs_per_tour": "proportion_large_legs_per_tour_q3",
}


def read_patat_csv() -> dict:
    """Read metadata_paper.csv (PATAT 2024 instances).

    Returns dict keyed by instance name with source, features, and algo results.
    """
    data = {}
    if not PATAT_CSV.exists():
        print(f"WARNING: {PATAT_CSV} not found, skipping PATAT instances")
        return data

    with open(PATAT_CSV, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["Instances"]
            source = row["Source"]

            # Extract features
            features = {}
            for csv_col, feat_key in PATAT_FEATURE_MAP.items():
                if csv_col in row and row[csv_col]:
                    val = float(row[csv_col])
                    # Integer features
                    if feat_key in ("n_tours", "n_legs", "n_position_used", "max_active_buses"):
                        val = int(val)
                    features[feat_key] = val

            # Extract algorithm results (CMSA, LNS from PATAT)
            patat_algorithms = {}
            for algo in ["CMSA", "LNS"]:
                col = f"algo_{algo}"
                if col in row and row[col]:
                    patat_algorithms[algo] = float(row[col])

            data[name] = {
                "source": source,
                "features": features,
                "patat_algorithms": patat_algorithms,
            }

    return data


# ---------------------------------------------------------------------------
# Read algorithm results from final_FINAL
# ---------------------------------------------------------------------------

def read_algorithm_results(instance_name: str) -> dict:
    """Read all algorithm results for an instance from final_FINAL/.

    Returns dict keyed by algorithm name (without 'algo_' prefix) with stats.
    """
    instance_dir = RESULTS_DIR / instance_name
    if not instance_dir.exists():
        print(f"WARNING: {instance_dir} not found")
        return {}

    algorithms = {}
    for algo_dir in sorted(instance_dir.iterdir()):
        if not algo_dir.is_dir() or not algo_dir.name.startswith("algo_"):
            continue

        algo_name = algo_dir.name.replace("algo_", "", 1)
        best_values = []
        times_to_best = []
        initial_values = []

        for seed_dir in algo_dir.iterdir():
            if not seed_dir.is_dir():
                continue
            summary_file = seed_dir / "summary.csv"
            if not summary_file.exists():
                continue
            try:
                with open(summary_file, "r") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        bv = float(row["best_value"])
                        best_values.append(bv)
                        if "time_last_improvement" in row and row["time_last_improvement"]:
                            times_to_best.append(float(row["time_last_improvement"]))
                        if "initial_value" in row and row["initial_value"]:
                            initial_values.append(float(row["initial_value"]))
            except Exception as e:
                print(f"WARNING: Error reading {summary_file}: {e}")

        if not best_values:
            continue

        algorithms[algo_name] = {
            "best_value": float(min(best_values)),
            "mean_value": round(float(np.mean(best_values)), 2),
            "std_value": round(float(np.std(best_values)), 2),
            "median_value": round(float(np.median(best_values)), 2),
            "worst_value": float(max(best_values)),
            "runs": len(best_values),
        }
        if times_to_best:
            algorithms[algo_name]["best_time"] = round(float(min(times_to_best)), 2)
            algorithms[algo_name]["mean_time"] = round(float(np.mean(times_to_best)), 2)

    return algorithms


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def get_json_path(instance_name: str) -> Path:
    """Get the JSON file path for an instance, handling the extreme_ prefix."""
    if instance_name.startswith("realistic_"):
        return INSTANCE_JSON_DIR / f"{instance_name}.json"
    else:
        return INSTANCE_JSON_DIR / f"extreme_{instance_name}.json"


def process_instance(instance_name, bks_data, patat_data):
    """Process a single instance and return its entry dict."""
    print(f"Processing {instance_name}...")

    entry = {"name": instance_name}

    # Parse size and source from name
    parts = instance_name.split("_")
    entry["size"] = int(parts[1])
    entry["source"] = parts[0]  # e.g. "realistic", "breakMax", etc.

    # Override source from PATAT CSV if available (more reliable)
    if instance_name in patat_data:
        entry["source"] = patat_data[instance_name]["source"]

    # Read instance JSON and extract features
    json_path = get_json_path(instance_name)
    if json_path.exists():
        try:
            inst = Instance.from_json(str(json_path))
            entry["features"] = get_features(inst)
            entry["stations"] = len(inst.distance_matrix)
        except Exception as e:
            print(f"  WARNING: Failed to load instance JSON: {e}")
            # Fall back to PATAT CSV features
            if instance_name in patat_data:
                entry["features"] = patat_data[instance_name]["features"]
            else:
                entry["features"] = {}
            entry["stations"] = entry["size"]
    else:
        print(f"  WARNING: {json_path} not found")
        if instance_name in patat_data:
            entry["features"] = patat_data[instance_name]["features"]
        else:
            entry["features"] = {}
        entry["stations"] = entry["size"]

    # Add BKS data (tours, legs, old algorithms, bound) — realistic only
    if instance_name in bks_data:
        bks = bks_data[instance_name]
        entry["tours"] = bks["tours"]
        entry["legs"] = bks["legs"]
        entry["old_algorithms"] = bks["old_algorithms"]
        entry["lower_bound"] = bks["bound"]
    else:
        entry["tours"] = entry["features"].get("n_tours", 0)
        entry["legs"] = entry["features"].get("n_legs", 0)
        entry["old_algorithms"] = {}
        entry["lower_bound"] = None

    # Read new algorithm results from final_FINAL (JAIR experiments)
    entry["algorithms"] = read_algorithm_results(instance_name)

    # Add PATAT algorithm results (CMSA, LNS) as old_algorithms if not already present
    if instance_name in patat_data:
        for algo, val in patat_data[instance_name]["patat_algorithms"].items():
            if algo not in entry["old_algorithms"]:
                entry["old_algorithms"][algo] = val

    # Compute BKS across all algorithms (old + new)
    all_best_values = []
    for algo, val in entry["old_algorithms"].items():
        all_best_values.append((algo, val))
    for algo, stats in entry["algorithms"].items():
        all_best_values.append((algo, stats["best_value"]))

    if all_best_values:
        best_algo, best_val = min(all_best_values, key=lambda x: x[1])
        entry["bks"] = best_val
        entry["best_algorithm"] = best_algo
    else:
        entry["bks"] = None
        entry["best_algorithm"] = None

    # Compute gap
    if entry["bks"] is not None and entry["lower_bound"] is not None and entry["bks"] > 0:
        entry["gap_pct"] = round((entry["bks"] - entry["lower_bound"]) / entry["bks"] * 100, 2)
    else:
        entry["gap_pct"] = None

    # Status
    if entry["gap_pct"] is not None and entry["gap_pct"] == 0.0:
        entry["status"] = "optimal"
    else:
        entry["status"] = "open"

    return entry


# ---------------------------------------------------------------------------
# Solution breakdown via validator
# ---------------------------------------------------------------------------

def compute_solution_breakdown(instance_name: str) -> dict | None:
    """Validate the BKS solution and return per-employee breakdown.

    Uses the bdsp-validator's Instance/Solution classes to load and evaluate.
    Returns None if no solution file exists.
    """
    sol_file = SOLUTIONS_DIR / f"{instance_name}.csv"
    if not sol_file.exists():
        return None

    # The validator needs the instance JSON from downloads/instances/
    inst_file = DOWNLOADS_INSTANCES_DIR / f"{instance_name}.json"
    if not inst_file.exists():
        # Fall back to the main instance JSON dir
        inst_file = get_json_path(instance_name)
    if not inst_file.exists():
        print(f"  WARNING: No instance JSON for validation of {instance_name}")
        return None

    try:
        v_instance = ValidatorInstance.from_json(str(inst_file))
        v_solution = ValidatorSolution.from_file(v_instance, sol_file)
        v_solution.evaluate()

        employees = []
        for e in v_solution.employees:
            employees.append({
                "employee": e.name,
                "feasible": e.state.feasible,
                "objective": int(e.objective),
                "work_time_paid": int(e.state.actual_work_time),
                "total_time": int(e.state.total_time),
                "ride": int(e.state.ride),
                "vehicle_changes": int(e.state.change),
                "split_shifts": int(e.state.split),
                "drive_time": int(e.state.drive_time),
                "num_legs": len(e.legs),
            })

        return {
            "total_objective": int(v_solution.value),
            "feasible": v_solution.feasible,
            "num_employees": len(v_solution.employees),
            "employees": employees,
        }
    except Exception as e:
        print(f"  WARNING: Validator failed for {instance_name}: {e}")
        return None


def build():
    print("Reading BKS CSVs...")
    bks_data = read_bks_csvs()

    print("Reading PATAT CSV...")
    patat_data = read_patat_csv()

    # Collect all unique instance names: REALISTIC_INSTANCES + PATAT CSV
    all_instance_names = list(dict.fromkeys(
        REALISTIC_INSTANCES + list(patat_data.keys())
    ))
    print(f"Total unique instances: {len(all_instance_names)}")

    instances = []
    breakdown_count = 0
    for instance_name in all_instance_names:
        entry = process_instance(instance_name, bks_data, patat_data)

        # Compute solution breakdown for instances with BKS solutions
        breakdown = compute_solution_breakdown(instance_name)
        if breakdown is not None:
            entry["solution_breakdown"] = breakdown
            breakdown_count += 1

        instances.append(entry)

    # Sort by source, then size, then trailing ID
    def sort_key(inst):
        parts = inst["name"].split("_")
        source = inst.get("source", parts[0])
        size = inst["size"]
        trail = int(parts[-1]) if parts[-1].isdigit() else 0
        return (source, size, trail)

    instances.sort(key=sort_key)

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(instances, f, indent=2)

    # Also write instances.js for inline loading (no server needed)
    js_file = OUTPUT_FILE.parent / "instances.js"
    with open(js_file, "w") as f:
        f.write("window.BDSP_INSTANCES = ")
        json.dump(instances, f, indent=2)
        f.write(";\n")

    print(f"\nDone! Wrote {len(instances)} instances to {OUTPUT_FILE} and {js_file}")

    # Summary
    optimal = sum(1 for i in instances if i["status"] == "optimal")
    sources = {}
    for i in instances:
        s = i.get("source", "unknown")
        sources[s] = sources.get(s, 0) + 1
    print(f"  Optimal: {optimal}, Open: {len(instances) - optimal}")
    print(f"  Solution breakdowns: {breakdown_count}")
    print(f"  Sources: {sources}")


if __name__ == "__main__":
    build()
