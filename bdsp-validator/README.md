# BDSP Validator

A Python tool for validating solutions to the **Bus Driver Scheduling Problem (BDSP)**.

Given an instance (JSON) and a solution (CSV binary assignment matrix), the validator:
1. Checks **feasibility** — all legs assigned exactly once, employee constraints satisfied
2. Computes the **objective value** with a per-employee breakdown

## Installation

```bash
pip install sortedcontainers
```

## Usage

### Validate a single solution

```bash
python validator.py -m file -j path/to/instance.json -i path/to/solution.csv
```

### Validate and save objective breakdown

```bash
python validator.py -m file -j path/to/instance.json -i path/to/solution.csv -o breakdown.csv
```

### Batch validate a folder of solutions

Requires an `instances/` directory containing the instance JSON files.

```bash
python validator.py -m folder -i path/to/solutions/ -o report.csv
```

## Input Format

### Instance (JSON)

Each instance JSON file contains:
- `legs`: array of bus legs with `tour`, `start`, `end`, `startPos`, `endPos`
- `distances`: position-to-position travel time matrix
- `extra`: per-position `startWork` and `endWork` times

### Solution (CSV)

A binary matrix with *n* rows (employees) and *l* columns (legs, ordered by start time).
Entry *(i, j) = 1* means leg *j* is assigned to employee *i*.

## Objective Function

The objective for each employee (shift) is:

```
Obj = 2 * W' + T + ride + 30 * changes + 180 * splits
```

Where:
- **W'** = max(work_time, 390) — paid working time (minimum 6.5 hours)
- **T** = total shift time (end - start, including breaks)
- **ride** = passive ride time (travel between positions without driving a bus)
- **changes** = number of vehicle (tour) changes
- **splits** = number of split shifts (breaks >= 180 minutes)

### Hard Constraints (penalty = 1000x violation)

- Maximum driving time: 9 hours (540 min)
- Maximum working time: 10 hours (600 min)
- Maximum total time: 14 hours (840 min)
- Driving rest rules (breaks every 4 hours of driving)
- Rest break rules (45 min break required after 6 hours of work)

## Output

### Single file mode (`-o`)

CSV with columns: Employee, Feasible, Objective, W', T, ride, tour (changes), split, bus_penalty, drive_penalty, rest_penalty, work_time, unpaid, upmax, drive_time, legs

### Folder mode (`-o`)

CSV report with columns: filename, Instances, objective, feasible, errors

## Project Structure

```
bdsp-validator/
├── validator.py          # Main validator script
├── data/
│   ├── instance.py       # Instance class (loads from JSON or CSV)
│   ├── solution.py       # Solution class (loads binary matrix)
│   ├── employee.py       # Employee class with objective evaluation
│   └── busleg.py         # Bus leg data class
└── utils/
    └── logging.py        # Logger configuration
```
