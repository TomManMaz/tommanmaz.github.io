# CLAUDE.md — tommanmaz.github.io

Personal homepage + BDSP (Bus Driver Scheduling Problem) benchmark suite.
Static site on GitHub Pages: plain HTML/CSS/vanilla JS, **no build step, no
frameworks, no package.json** (its absence is what lets Node `require()` the
validator core as CommonJS — do not add one).

## Design rules

Deliberately plain, old-fashioned aesthetic (see `stylesheet.css` header):
Georgia serif on white, navy underlined links (`--link: #0b3d91`), flat
bordered tables. **No gradients, shadows, rounded corners, or
animations.** A dark palette exists (requested Oct 2026): it follows the OS,
and `js/theme.js` (loaded in every `<head>`) injects a Dark/Light switch
into the navbar that sets `<html data-theme>`; use color tokens, never
literal colors, so both themes work (the Gantt SVG uses `style="fill:var(..)"`).
All styling goes in `stylesheet.css` (tokens at the top);
never in page-level `<style>` blocks. Every page repeats the same chrome
(skip-link, header, navbar Home/Publications/BDSP/QAP/AMM, footer) by hand —
keep them in sync. Table-heavy pages use `<main class="wide">`. MathJax is
loaded only on `bdsp_problem/instance/validate.html` and
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

| QAP page | Purpose |
|---|---|
| `qap.html` + `js/qap_overview.js` | Landing: what changed since the official QAPLIB tables, conventions, citation |
| `qap_collection.html` + `js/qap_collection.js` | All QAPLIB instances (sort/filter/search/export), families, Data Access |
| `qap_instance.html` + `js/qap_instance.js` | Per-instance detail via `?instance=<name>`: permutation, proof or bound, history |
| `qap_validate.html` + `js/qap_validate.js` | Permutation checker (paste or upload `.sln`), submission panel |

## QAP section — an unofficial, verified update of the QAPLIB tables

- `data/qap_ledger.json` — **the source of truth, edited by hand**: per
  instance `bks`, `status`, `proof` / `lower_bound_source` / `bks_source`
  (keys into `references`), the official 2012 value (`qaplib_2012`), and
  `history`. Keep one instance per line.
- `downloads/qap/instances/*.dat` — official QAPLIB data (`qapdata.tar.gz`),
  never modified. `downloads/qap/solutions/*.sln` — one permutation per
  instance in the QAPLIB convention (`cost = sum a[i][j] b[p(i)][p(j)]`,
  1-based); the official archive's inverse / 0-based files were normalized.
- `python scripts/build_qap_data.py` regenerates `data/qap_instances.json` and
  `data/qap_instances.js` (never hand-edit them) and **fails unless every
  stored permutation costs exactly the ledger's bks**.
- `node scripts/qap_parity_test.js` checks `js/qap_core.js` against the
  published values. Run both after any change.
- Submissions: `.github/ISSUE_TEMPLATE/new-qap-bks.yml` (title `[QAP]`,
  label `qap-submission`), reviewed by hand — no workflow yet. To accept one:
  check the permutation, write the `.sln`, update the ledger (move the old
  value into `history`), rebuild.

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
- `bounds/lower_bounds.json` — ledger of lower bounds computed outside the
  original pipeline (currently LB_flow, the certified path-cover bound from
  `lb_flow.py` in the paper repo `~/busdriverschedulingproblem`). The
  published `lower_bound` is always the **max** over sources;
  `python scripts/apply_lower_bounds.py` folds the ledger in (idempotent,
  recomputes gap/status, aborts if a bound exceeds the BKS) and
  `build_instance_data.py` calls the same `fold_lower_bound`. Each entry
  carries `lower_bound_method` (`Branch-and-Price` or `LB_flow`).
- `downloads/instances/<name>.json` — 284 individual instance definitions
  (`legs[]{tour,start,end,startPos,endPos}` in minutes, `distances{}`,
  `extra{}`).
- `sols/<name>.csv` — best archived solution matrices (65 realistic).
  Header-less binary matrix, row = employee, column = leg in start-time
  order. **Caveat:** for ~26 instances the recorded `bks` (from algorithm
  result tables) is slightly better than what the archived matrix achieves;
  `parity_test.js` reports these as WARN, not FAIL.
- `downloads/collection.tar.gz` — Git LFS (Pages serves only the pointer, so
  the site links the copy attached to GitHub Release `collection-v1`), built on the author's old
  machine; do not regenerate here.

## Pipelines

- **Community submissions** (CI, no maintainer data needed) — one channel:
  `.github/ISSUE_TEMPLATE/new-bks.yml` form (label `bks-submission`, CSV
  attached) → `.github/workflows/validate-issue-submission.yml` →
  `scripts/process_issue_submission.py` (parses the body, fetches the
  github.com attachment or a gist owned by the issue author, composes the
  verdict comment) → `scripts/apply_submission.py` (re-validates with the
  Python validator; accepts iff every leg is covered exactly once, all
  shifts feasible, and strictly better than stored `bks`; patches data
  files, writes the re-serialized matrix to `sols/`, records the ledger
  entry in `submissions/accepted.json` — the old record moves under
  `previous` — pushes, comments). The workflow also fires on a `[BKS]`
  title prefix (CLI/API issues from non-collaborators can't carry labels).
  Accepted issues are closed; invalid ones stay open and re-validate on
  edit. The validate page's submission panel deep-links the pre-filled
  form. (The old PR flow, `validate-submission.yml`, was retired.)
  - **Solution CSV format is strict in both parsers** (`Solution.from_file`
    and `parseSolution` must stay identical): optional UTF-8 BOM, blank lines
    skipped, every other row exactly one cell per leg, cells `0`/`1`
    (`0.0`/`1.0` tolerated). Anything else is a parse error.
  - Contract tests: `python scripts/submission_test.py` (form parsing,
    verdict comments, validator dry runs); CI runs it via
    `.github/workflows/submission-tests.yml`.
- **Full data rebuild** (`scripts/build_instance_data.py`): maintainer-only;
  requires instance/JAIR sources under `/home/mannelli/...` on the old
  Linux machine — not runnable from this repo alone.

## Local development

```bash
python -m http.server 8000   # validator page needs http://, not file://
# http://localhost:8000/bdsp_validate.html?instance=realistic_10_1
```
