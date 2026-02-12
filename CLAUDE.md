# CLAUDE.md — BDSP Instance Collection (MIPLIB-style)

## Goal

Create a MIPLIB-style browsable instance collection for the BDSP section of tommanmaz.github.io. Users should be able to:
1. Browse all 284 instances (65 realistic + 219 synthetic from PATAT 2024) in a filterable/sortable table
2. Click any instance to see a detail page with algorithm solutions, features, and downloads

---

## Architecture Overview

The website is a **static Jekyll site on GitHub Pages** (plain HTML, CSS, JS — no build step). All new pages follow the same pattern: hand-written HTML with the shared navbar, `stylesheet.css`, and dark mode support.

### Current State
- `bdsp.html` — main BDSP page with problem description and interactive collection table
- `bdsp_instance.html` — dynamic instance detail page
- `data/instances.json` + `data/instances.js` — 284 instances (generated)
- `js/bdsp_collection.js` — collection table with sorting, filtering, search
- `js/bdsp_instance.js` — instance detail page rendering
- `BKS_realistic_1.csv` / `BKS_realistic_2.csv` — old algorithm benchmark results (realistic only)
- `metadata_paper.csv` — PATAT 2024 paper metadata (284 instances, 12 source types)
- `sols/` — solution files (binary assignment matrices)
- `downloads/collection.tar.gz` — instance archive (Git LFS, 84.7 MB)
- `scripts/build_instance_data.py` — offline data pipeline

---

## Decisions

- **Custom BDSP features** extracted from instance JSON files using the `Instance` class from `/home/mannelli/instance-generator/`. 42+ features total.
- **Collection replaces the current BKS table** in `bdsp.html`.
- **Downloads**: Both individual instance downloads AND the full archive.
- **Instance detail pages** focus on algorithm solutions — clicking an instance shows all algorithm results.
- **284 instances across 12 source types**: breakMax(20), distanceAvailability(19), distanceVariation(20), gridSpread(20), legMax(20), legMin(20), legPeriodMax(20), legRegularity(20), morningPeak(20), numStations(20), realistic(65), shortLeg(20).

---

## Data Sources (external to repo, on local machine)

### 1. Instance definitions
**Location**: `/home/mannelli/busdriverschedulingproblem/files/instances/json/`
- 285 JSON files total
- Realistic: `realistic_10_1.json` through `realistic_250_65.json` (65 files, no prefix)
- Synthetic: `extreme_<source>_<size>_<id>.json` (220 files, `extreme_` prefix)
- 13 size categories for realistic (10–250), 4 sizes for synthetic (50, 100, 150, 250)

### 2. Algorithm results (JAIR — realistic only)
**Location**: `/home/mannelli/laboratorio/bdsp/data/jair/final_FINAL/`
- 65 subdirectories, one per realistic instance
- 10 LNS algorithm variants
- ~4,850 total runs with summary.csv, trajectory.csv, solution matrix, parameters.json

### 3. Existing website CSV data (realistic only)
- `BKS_realistic_1.csv` — 50 instances, columns: Instances, tours, legs, BP, SA, HC, TS, CMSA, LNS, bound
- `BKS_realistic_2.csv` — 15 instances, columns: Instances, n_tours, n_legs, SA, HC, TS, CMSA, LNS (no BP, no bound)

### 4. PATAT 2024 paper metadata (all 284 instances)
- `metadata_paper.csv` — 284 instances, 12 source types
- Contains: features (42 columns), algo_CMSA and algo_LNS results
- Instance name mapping: CSV uses `breakMax_100_1`, JSON file is `extreme_breakMax_100_1.json`

### 5. Feature extraction module
**Location**: `/home/mannelli/instance-generator/classes/instance.py`
- `Instance.from_json()` loads a BDSP instance from JSON
- `get_features()` extracts 42 features per instance

---

## Phase 1: Data Preparation — DONE

### Build script: `scripts/build_instance_data.py`

**Run command**:
```bash
conda run -n instance python scripts/build_instance_data.py
```

**What it does**:
1. Reads `BKS_realistic_1.csv` and `BKS_realistic_2.csv` for old algorithm results + tours/legs/bound (realistic only)
2. Reads `metadata_paper.csv` for PATAT 2024 features and CMSA/LNS results (all 284 instances)
3. Loads each instance JSON via `Instance.from_json()` and extracts 42 features (falls back to CSV features if JSON loading fails)
4. Scans `final_FINAL/` for JAIR algorithm results (realistic only, ~4850 runs)
5. Merges PATAT CMSA/LNS as old_algorithms for non-realistic instances
6. Computes BKS (best across all old + new algorithms), gap, status (optimal/open)
7. Sorts by source, then size, then trailing ID
8. Outputs `data/instances.json` AND `data/instances.js` (inline JS for file:// compatibility)

**Output**: 284 instances, 9 optimal, 275 open. 12 source types.

**Instance JSON path resolution**:
- Realistic: `/path/to/json/<name>.json`
- Non-realistic: `/path/to/json/extreme_<name>.json`

### 42 BDSP features per instance

Extracted from the Instance class properties:

**Counts (3)**: n_tours, n_legs, n_position_used

**Drive time stats (7)**: drive_min, drive_max, drive_mean, drive_median, drive_std, drive_first_quantile, drive_third_quartile

**Inter-leg gap stats (7)**: diff_min, diff_max, diff_mean, diff_median, diff_std, diff_first_quantile, diff_third_quartile

**Structure (2)**: max_active_buses, average_distance

**Leg size categories (5)**: huge, large, medium, small, tiny (proportions)

**Per-tour statistics (5 metrics x 7 stats = 35)**:
- num_legs_per_tour: max, min, mean, median, std, q1, q3
- total_time_per_tour: max, min, mean, median, std, q1, q3
- number_breaks_per_tour: max, min, mean, median, std, q1, q3
- number_proper_breaks_per_tour: max, min, mean, median, std, q1, q3
- proportion_large_legs_per_tour: max, min, mean, median, std, q1, q3

---

## Phase 2: Collection Page — DONE

### Table columns
| Column | Description |
|--------|-------------|
| Instance | Name (clickable link to detail page) |
| Source | Instance source type (realistic, breakMax, etc.) |
| Status | "optimal" or "open" (color-coded badge) |
| Size | Number of employees/stations |
| Tours | Number of tours |
| Legs | Number of legs |
| BKS | Best known solution cost |
| Lower Bound | LP relaxation lower bound (realistic only) |
| Gap (%) | Optimality gap |
| Best Algorithm | Which algorithm found BKS |

### Interactive features
- **Sorting**: Click column headers to sort ascending/descending
- **Filtering**: Filter by status (optimal/open) via buttons
- **Source filter**: Dropdown to filter by source type (12 options)
- **Search**: Text search box to filter by instance name
- **CSV Export**: Export current filtered/sorted view
- **Dynamic "Last Updated"**: Fetches last commit date from GitHub API
- All done in **vanilla JavaScript** (no frameworks)

### Data loading
- Primary: Inline `window.BDSP_INSTANCES` from `data/instances.js` (works with file:// protocol)
- Fallback: `fetch('data/instances.json')` for server environments

---

## Phase 3: Instance Detail Pages — DONE

Single dynamic page: `bdsp_instance.html?instance=realistic_10_1`

### Detail page sections
1. **Header**: Instance name + status badge
2. **Summary Cards**: Source, Size, Tours, Legs, Stations, BKS, Lower Bound, Gap, Best Algorithm
3. **Algorithm Comparison Table**:
   - "LNS Variants (JAIR 2025)" section for realistic instances with full stats
   - "Previous Algorithms" / "PATAT 2024 Results" section for old/PATAT results
   - Best rows highlighted in green
4. **Instance Features**: Collapsible section with 42 features grouped by category
5. **Download Links**: Instance JSON, Best Solution CSV, Full Archive, Problem Formulation PDF
6. **Navigation**: Prev/Next instance links

---

## File Structure

```
tommanmaz.github.io/
├── bdsp.html                     # Main BDSP page with collection table
├── bdsp_instance.html            # Instance detail template page (dynamic)
├── data/
│   ├── instances.json            # All instance data (284 instances)
│   └── instances.js              # Inline JS version for file:// compatibility
├── scripts/
│   └── build_instance_data.py    # Offline data pipeline
├── js/
│   ├── bdsp_collection.js        # Collection table (sorting, filtering, search, source filter)
│   └── bdsp_instance.js          # Detail page rendering
├── metadata_paper.csv            # PATAT 2024 paper metadata (284 instances)
├── BKS_realistic_1.csv           # Old algorithm results (50 realistic)
├── BKS_realistic_2.csv           # Old algorithm results (15 realistic)
├── downloads/
│   ├── collection.tar.gz         # Full archive (Git LFS)
│   └── instances/                # Individual instance JSON files for download
├── sols/                         # Best known solution files
```

---

## Workflow / Pipeline

### Rebuilding data (when results change)
```bash
conda run -n instance python scripts/build_instance_data.py
```
Reads from all four data sources, outputs `data/instances.json` + `data/instances.js`. Re-runnable.

### Adding a new algorithm
1. Add experimental results to `final_FINAL/` directory (follow `algo_NAME/SEED/summary.csv` pattern)
2. Re-run `scripts/build_instance_data.py` (auto-discovers new algo_ directories)
3. Commit updated `data/instances.json` and `data/instances.js`
4. Push — GitHub Pages deploys; collection and detail pages auto-adapt

---

## Remaining Tasks

- [ ] **Individual instance downloads**: Copy JSON files into `downloads/instances/` for all 284 instances
- [ ] **Best solution files**: Extract best-known solution CSVs for all instances into `sols/`
- [ ] **Update collection.tar.gz**: Include all 284 instances (currently only realistic?)
- [ ] **PATAT CSV extra features**: The CSV has additional `rro` features not in the standard 42 — consider adding them
- [ ] **Polish**: Improve mobile responsiveness, add loading indicators
