# CLAUDE.md — tommanmaz.github.io

Personal homepage + BDSP (Bus Driver Scheduling Problem) benchmark suite.
Static site on GitHub Pages: plain HTML/CSS/vanilla JS, **no build step, no
frameworks, no package.json** (its absence is what lets Node `require()` the
validator core as CommonJS — do not add one).

## Design rules

Deliberately plain, old-fashioned aesthetic (see `stylesheet.css` header):
Georgia serif on white, navy underlined links (`--link: #0b3d91`), flat
bordered tables. **No dark mode, gradients, shadows, rounded corners, or
animations.** All styling goes in `stylesheet.css` (tokens at the top);
never in page-level `<style>` blocks. Every page repeats the same chrome
(skip-link, header, navbar Home/Publications/BDSP/AMM, footer) by hand —
keep them in sync. Table-heavy pages use `<main class="wide">`. MathJax is
loaded only on `bdsp_problem/collection/instance/validate.html` and
`amm.html`.

## Page map

| Page | Purpose |
|---|---|
| `bdsp.html` | BDSP landing (links, citation, contact) |
| `bdsp_problem.html` | Formal problem reference |
| `bdsp_collection.html` | 284-instance table (sort/filter/search/export) + Data Access docs |
| `bdsp_instance.html` + `js/bdsp_instance.js` | Per-instance detail via `?instance=<name>` |
| `bdsp_validate.html` + `js/bdsp_validate.js` | In-browser validator (upload CSV → breakdown, diagnostics, timeline, submission panel) |

Collection and instance pages read `window.BDSP_INSTANCES` from
`data/instances.js` (inline copy of `data/instances.json`).

## Validator architecture — the key invariant

Two implementations of the same evaluation logic must stay numerically
identical:

- `bdsp-validator/` — Python reference. The submission CI trusts it.
- `js/bdsp_validator_core.js` — pure JS core (UMD-lite, zero DOM). Used by
  the validator page (`window.BDSP_VALIDATOR_CORE`) and by Node harnesses
  via `require()`.

`bdsp_validate.html` script order is load-bearing: `data/instances.js` →
`js/bdsp_validator_core.js` → `js/bdsp_gantt.js` → `js/bdsp_validate.js`.

**Parity suite** (run after touching either implementation; needs
`pip install sortedcontainers` once):

```bash
node scripts/parity_test.js            # 65 archived sols vs stored breakdowns
node scripts/parity_test.js --python   # + live Python, all penalty fields
node scripts/fuzz_parity.js --seed 42 --per-instance 12   # infeasible paths
```

`scripts/py_eval_batch.py` is the batch driver the Node harnesses call.
`.github/workflows/parity.yml` runs the suite in CI on any change to the
validator, core, `sols/`, or `data/instances.json`. The fuzz script asserts
every hard-constraint branch (bus/drive-block/rest penalties, drive/total/
work overruns) is actually triggered.

## Data files

- `data/instances.json` / `data/instances.js` — **generated, never
  hand-edit.** 284 instances (65 realistic + 219 synthetic; the PATAT 2024
  set). Realistic entries carry `solution_breakdown`.
- `downloads/instances/<name>.json` — 284 individual instance definitions
  (`legs[]{tour,start,end,startPos,endPos}` in minutes, `distances{}`,
  `extra{}`).
- `sols/<name>.csv` — best archived solution matrices (65 realistic).
  Header-less binary matrix, row = employee, column = leg in start-time
  order. **Caveat:** for ~26 instances the recorded `bks` (from algorithm
  result tables) is slightly better than what the archived matrix achieves;
  `parity_test.js` reports these as WARN, not FAIL.
- `downloads/collection.tar.gz` — Git LFS, built on the author's old
  machine; do not regenerate here.

## Pipelines

- **Community submissions** (CI, no maintainer data needed): PR adds
  `submissions/<instance>.csv` → `.github/workflows/validate-submission.yml`
  → `scripts/apply_submission.py` re-validates with the Python validator;
  accepts iff feasible AND strictly better than stored `bks`; patches data
  files, copies to `sols/`, appends `submissions/accepted.json`, pushes,
  comments, closes the PR. The validate page's submission panel guides
  researchers into this flow.
- **Full data rebuild** (`scripts/build_instance_data.py`): maintainer-only;
  requires instance/JAIR sources under `/home/mannelli/...` on the old
  Linux machine — not runnable from this repo alone.

## Local development

```bash
python -m http.server 8000   # validator page needs http://, not file://
# http://localhost:8000/bdsp_validate.html?instance=realistic_10_1
```
