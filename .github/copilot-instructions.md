# Copilot Instructions for tommanmaz.github.io

## Project Overview
Personal homepage for Tommaso Mannelli Mazzoli (AI Architect at PORR AG,
Vienna; previously TU Wien). Focus: the Bus Driver Scheduling Problem
(BDSP) benchmark suite and solutions to American Mathematical Monthly
(AMM) problems. Static site on GitHub Pages — plain HTML/CSS/vanilla JS,
no build step, no frameworks (Jekyll config is present but used only for
default theme metadata).

## Navigable pages
- `index.html` — home / bio / contact
- `publications.html` — papers, preprints, theses
- `bdsp.html` — BDSP landing page (links to the sub-pages below)
- `bdsp_problem.html` — formal problem reference (objective, constraints, formats)
- `bdsp_collection.html` — sortable/filterable table of all 284 instances + data-access docs
- `bdsp_instance.html` — dynamic per-instance detail page (reached via `?instance=<name>`)
- `bdsp_validate.html` — client-side BDSP solution validator (upload CSV, per-employee breakdown, schedule timeline, submission panel)
- `amm.html` — AMM problem catalog with MathJax

## Shared chrome
Every page has the same skip-link + header + navbar (Home / Publications /
BDSP / AMM) + footer. Keep them uniform across pages — there is no
template engine. Set `class="active"` and `aria-current="page"` on the
current page's nav link. Table-heavy pages use `<main class="wide">`.

## Styling
- Single canonical stylesheet: `stylesheet.css` — deliberately plain and
  old-fashioned: black serif text (Georgia) on white, navy underlined
  links (`--link: #0b3d91`), flat fully-bordered tables.
- **No dark mode, no gradients, no shadows, no rounded corners, no
  animations.** Do not reintroduce them.
- Tokens at the top of the file: `--text`, `--text-muted`, `--bg`,
  `--link`, `--rule`, and status colors `--ok`/`--warn`/`--bad`.
- Do not hardcode colors or sizes in page-level `<style>` blocks — add to
  `stylesheet.css` instead.

## BDSP validator architecture (important invariant)
- `js/bdsp_validator_core.js` — pure computation core (UMD-lite): parsing,
  per-employee evaluation, violations, CSV export. Zero DOM access. Loaded
  by the browser (`window.BDSP_VALIDATOR_CORE`) **and** by Node via
  `require()` (the repo has no `package.json` — do not add one, it would
  change Node's module resolution and be served by Pages).
- `js/bdsp_validate.js` — DOM/render layer only. `bdsp_validate.html` must
  load `data/instances.js`, then the core, then `js/bdsp_gantt.js`, then
  this file — the order is load-bearing.
- `bdsp-validator/` — the Python reference implementation. The GitHub
  submission pipeline trusts it; the JS core must stay numerically
  identical to it.
- Parity is enforced: `node scripts/parity_test.js --python` (65 archived
  solutions, exact per-field comparison) and `node scripts/fuzz_parity.js`
  (deterministic mutants covering every hard-constraint penalty branch).
  `.github/workflows/parity.yml` runs both on any change to the validator,
  the core, `sols/`, or `data/instances.json`. If you touch evaluation
  logic on either side, run the suite locally (`pip install
  sortedcontainers` first).

## BDSP data pipeline
- `data/instances.json` (+ `data/instances.js`, the same JSON wrapped as
  `window.BDSP_INSTANCES = ...;`) is generated — never hand-edit either.
- Full rebuild: `scripts/build_instance_data.py` — maintainer-only, needs
  data sources that live outside this repo on the author's old machine.
- CI-side surgical update: `scripts/apply_submission.py`, driven by
  `.github/workflows/validate-submission.yml` when a PR adds
  `submissions/<instance>.csv`. It re-validates with the bundled Python
  validator and, if feasible and strictly better than the stored BKS,
  patches the data files, copies the CSV to `sols/`, and appends to the
  `submissions/accepted.json` ledger.

## MathJax
Loaded with `defer` only on pages that render math: `bdsp_problem.html`,
`bdsp_collection.html`, `bdsp_instance.html`, `bdsp_validate.html`,
`amm.html`. Skip it on `index.html` / `publications.html` / `bdsp.html`.

## Local development
`python -m http.server 8000` from the repo root (the validator page needs
`http://`, not `file://`, to fetch instance JSONs).

## CV artifacts
LaTeX sources (`altacv.cls`, `*.tex`) live under `docs/cv-build/`. The
published PDF is `CV-Tommaso.pdf` at the repo root (linked from
`index.html`).
