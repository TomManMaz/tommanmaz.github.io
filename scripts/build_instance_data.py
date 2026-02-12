#!/usr/bin/env python3
"""
Build data/instances.json for the BDSP website.

Reads from three sources:
1. Instance JSON files → features (via instance-generator's Instance class)
2. Algorithm results from final_FINAL/ → per-algorithm stats
3. BKS CSV files → old algorithm results + lower bounds

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

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTANCE_JSON_DIR = Path.home() / "busdriverschedulingproblem" / "files" / "instances" / "json"
RESULTS_DIR = Path.home() / "laboratorio" / "bdsp" / "data" / "jair" / "final_FINAL"
BKS_CSV_1 = REPO_ROOT / "BKS_realistic_1.csv"
BKS_CSV_2 = REPO_ROOT / "BKS_realistic_2.csv"
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

def build():
    print("Reading BKS CSVs...")
    bks_data = read_bks_csvs()

    instances = []
    for instance_name in REALISTIC_INSTANCES:
        print(f"Processing {instance_name}...")

        entry = {"name": instance_name}

        # Parse size from name
        parts = instance_name.split("_")
        entry["size"] = int(parts[1])

        # Read instance JSON and extract features
        json_path = INSTANCE_JSON_DIR / f"{instance_name}.json"
        if json_path.exists():
            try:
                inst = Instance.from_json(str(json_path))
                entry["features"] = get_features(inst)
                entry["stations"] = len(inst.distance_matrix)
            except Exception as e:
                print(f"  WARNING: Failed to load instance JSON: {e}")
                entry["features"] = {}
                entry["stations"] = entry["size"]
        else:
            print(f"  WARNING: {json_path} not found")
            entry["features"] = {}
            entry["stations"] = entry["size"]

        # Add BKS data (tours, legs, old algorithms, bound)
        if instance_name in bks_data:
            bks = bks_data[instance_name]
            entry["tours"] = bks["tours"]
            entry["legs"] = bks["legs"]
            entry["old_algorithms"] = bks["old_algorithms"]
            entry["lower_bound"] = bks["bound"]
        else:
            # Fall back to features if available
            entry["tours"] = entry["features"].get("n_tours", 0)
            entry["legs"] = entry["features"].get("n_legs", 0)
            entry["old_algorithms"] = {}
            entry["lower_bound"] = None

        # Read new algorithm results from final_FINAL
        entry["algorithms"] = read_algorithm_results(instance_name)

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

        instances.append(entry)

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
    print(f"  Optimal: {optimal}, Open: {len(instances) - optimal}")


if __name__ == "__main__":
    build()
